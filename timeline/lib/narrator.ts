/**
 * narrator.ts — the ONE shared LLM client for all three bake-off approaches.
 *
 * Entry points:
 *   narrate(beats, persons, lens, opts)      — approach A/B: prose for pre-sampled beats
 *   nominate(a, b, score, lens, grammar, o)  — approach B: LLM-proposed bonus arc
 *   fullGenerate(a, b, score, lens, o, sk)   — approach C: arcs + events in one call
 *   getClient(live)                          — the memoized gateway client itself
 *
 * Live path: Vercel AI SDK v5 ('ai') through the Vercel AI Gateway, model ids from
 * the research phase (primary moonshotai/kimi-k2.5). API key read MANUALLY from
 * timeline/.env (KEY=VALUE lines; gitignored). Explicit key via createGateway —
 * "Direct API key configuration takes precedence over environment variables"
 * (ai-sdk.dev AI Gateway provider docs).
 *
 * Mock path: deterministic template-filled sentences from beat + person tags —
 * used whenever the key is missing OR opts.live is not true, so everything runs
 * offline. A missing key NEVER crashes anything. Output marks
 * meta.narration = 'live' | 'mock'.
 *
 * 'ai' and 'zod' are imported DYNAMICALLY inside the live path only, so this
 * module (and everything importing it) runs under plain
 * `node --experimental-strip-types` even before `pnpm install`.
 */

import { readFileSync } from 'node:fs';
import type { Person, PairScore, Lens, TermName } from '../../matching/engine.ts';
import type {
  Arc, Beat, EventKind, NarrationMode, StateDelta, TimelineEvent, TimelineOpts,
} from '../shared.ts';
import {
  LENS_CONSTRAINTS, applyDelta, hashSeed, initialState, kidEventAllowed, mulberry32, pick,
  sampleDissolutionYear, scanBanned, scanSurvivalClaims, sharedTags,
} from '../shared.ts';

// ---------------------------------------------------------------------------
// Model ids — research phase result (Vercel AI Gateway catalog, 2026-08-22)
// ---------------------------------------------------------------------------

// LOCKED (2026-08-22 model-off): kimi-k2.5 -> deepseek-v4-pro -> glm-4.7-flash -> mock.
export const MODEL_PRIMARY = 'moonshotai/kimi-k2.5';
export const MODEL_FALLBACKS: readonly string[] = [
  'deepseek/deepseek-v4-pro',
  'zai/glm-4.7-flash',
];

/**
 * TIMELINE_MODEL override — process env wins over timeline/.env, else the
 * research-phase primary. When set, generateWithFallback tries it FIRST and the
 * chain becomes [override, ...MODEL_FALLBACKS minus duplicates], so a reachable
 * model (e.g. free-tier 'zai/glm-4.7-flash') never burns failing requests on
 * models the account cannot access.
 */
export function resolveModel(env: Record<string, string>): string {
  const override = (process.env.TIMELINE_MODEL ?? env.TIMELINE_MODEL ?? '').trim();
  return override || MODEL_PRIMARY;
}

// ---------------------------------------------------------------------------
// .env — parsed manually (KEY=VALUE lines), never via dotenv
// ---------------------------------------------------------------------------

const ENV_URL = new URL('../.env', import.meta.url);

export function readEnvFile(): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(ENV_URL, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The ONE client — memoized; approaches never construct their own
// ---------------------------------------------------------------------------

export interface LiveClient {
  mode: 'live';
  model: string;
  /** ai's generateObject, bound and ready. */
  generateObject: (args: Record<string, unknown>) => Promise<{ object: unknown }>;
  /** gateway(modelId) → model instance for the args above. */
  gateway: (modelId: string) => unknown;
  /** zod namespace for schema building. */
  z: typeof import('zod')['z'];
}
export interface MockClient { mode: 'mock' }
export type NarratorClient = LiveClient | MockClient;

const MOCK: MockClient = { mode: 'mock' };
let livePromise: Promise<NarratorClient> | null = null;

/**
 * A dead key must never masquerade as a successful live run: when a caller
 * explicitly requested live narration (opts.live === true) but the pipeline
 * fell back to mock, emit ONE stderr warning per process saying why.
 * User-facing output is unaffected — meta.narration still reports 'mock'.
 */
let liveFallbackWarned = false;
export function warnLiveFellBackToMock(reason: string): void {
  if (liveFallbackWarned) return;
  liveFallbackWarned = true;
  process.stderr.write(
    `[narrator] WARNING: live narration was requested (opts.live=true) but fell back to MOCK — ${reason}. ` +
    'Check AI_GATEWAY_API_KEY in timeline/.env (rotate the key if the gateway rejects it).\n',
  );
}

/**
 * live !== true → mock immediately. Otherwise attempt (once, memoized) to build
 * the gateway client; ANY failure — missing key, missing node_modules — falls
 * back to mock silently. Never throws.
 */
export function getClient(live?: boolean): Promise<NarratorClient> {
  if (live !== true) return Promise.resolve(MOCK);
  if (livePromise) return livePromise;
  livePromise = (async (): Promise<NarratorClient> => {
    const env = readEnvFile();
    const apiKey = env.AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) return MOCK;
    try {
      const ai = await import('ai');
      const zodMod = await import('zod');
      const gateway = ai.createGateway({ apiKey });
      const model = resolveModel(env);
      return {
        mode: 'live',
        model,
        generateObject: ai.generateObject as unknown as LiveClient['generateObject'],
        gateway: gateway as unknown as LiveClient['gateway'],
        z: zodMod.z,
      };
    } catch {
      return MOCK; // 'ai' not installed / import failed → offline mode
    }
  })();
  return livePromise;
}

/**
 * Free-tier rate limiting (GatewayRateLimitError / HTTP 429) is transient, not
 * a broken model: wait and retry the SAME model with linear backoff before
 * falling down the chain, so throttled runs stay live instead of going mock.
 */
// Capped backoff budget: 2 retries x (5s, 10s) = 15s max per model, so a
// throttled call degrades to the next model (or mock) fast instead of hanging.
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BASE_MS = 5_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
function isRateLimit(e: unknown): boolean {
  const err = e as { name?: string; statusCode?: number };
  return err?.name === 'GatewayRateLimitError' || err?.statusCode === 429;
}
/** Try primary then fallbacks; returns null (and warns once) when every model fails. */
async function generateWithFallback(
  client: LiveClient,
  build: (modelId: string) => Record<string, unknown>,
): Promise<{ object: unknown; model: string } | null> {
  let lastError = 'unknown error';
  for (const modelId of [client.model, ...MODEL_FALLBACKS.filter((m) => m !== client.model)]) {
    for (let retry = 0; ; retry++) {
      try {
        const { object } = await client.generateObject({
          ...build(modelId),
          // Hard per-call ceiling: a hung socket or an over-thinking model must
          // fail into the fallback chain, never hang the caller (stage rule).
          // Per-call ceiling. A BATCH narration writes every sentence in one
          // response, so it legitimately needs far longer than a single-beat
          // call; 60s was cutting batches off mid-generation and silently
          // demoting the run to a weaker fallback model. Override via
          // build().__timeoutMs when the caller knows the shape of the work.
          abortSignal: AbortSignal.timeout(
            (build(modelId).__timeoutMs as number | undefined) ?? 60_000,
          ),
        });
        return { object, model: modelId };
      } catch (e) {
        if (isRateLimit(e) && retry < RATE_LIMIT_RETRIES) {
          await sleep(RATE_LIMIT_BASE_MS * (retry + 1));
          continue; // same model again after backoff
        }
        const err = e as { name?: string; message?: string };
        const msg = String(err?.message ?? e)
          .replace(/\u001b\[[0-9;]*m/g, '') // strip ANSI color codes
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        lastError = `${err?.name ?? 'Error'}: ${msg}`;
        break; // next model in the chain
      }
    }
  }
  // Only reachable on the live path (client.mode === 'live' implies opts.live).
  warnLiveFellBackToMock(`every gateway model failed (last: ${lastError})`);
  return null;
}

// ---------------------------------------------------------------------------
// Shared prompt fragments — A7/A8 phrasing; the four conflict-construct names
// from the banned list never appear here either.
// ---------------------------------------------------------------------------

// NOTE: categories are DESCRIBED, never enumerated word-by-word — the banned
// list (incl. the four conflict-communication construct names) must not appear
// in any template or prompt-authored output. scanBanned() enforces post-hoc.
const SAFETY_RULES = [
  'Warm, concrete, specific. Third person, present tense. One to two sentences per event.',
  'NEVER include: ultimatums or demands framed as threats; judging either person\'s character or morals; third parties entering the romance; health scares, loss of life, or medical storylines; any intoxicant; religious references; political references; shaming anyone about money; naming psychology constructs or conflict-communication constructs (describe behavior concretely instead).',
  'Never state numeric chances, percentages, or how likely the relationship is to last.',
  'Only reference places, kids, pets, or jobs that earlier events in the list established.',
].join('\n');

function personFacts(label: string, p: Person): string {
  const ls = p.declared.lifeShape;
  return [
    `${label}: ${p.name}`,
    `  tags: ${p.declared.tags.join(', ') || '(none)'}`,
    `  chronotype band: ${p.declared.chronotype} (0 early … 3 late)`,
    `  life shape — money posture ${ls.moneyPosture}, rootedness ${ls.rootedness}, family gravity ${ls.familyGravity}, capacity hours band ${ls.capacityHoursBand}`,
  ].join('\n');
}

function scoreFacts(score: PairScore): string {
  const drivers = score.drivers.map((d) => `${d.term} (${d.label})`).join(', ');
  const friction = score.friction ? `${score.friction.term} (${score.friction.label})` : 'none';
  const flags = Object.entries(score.flags).map(([k]) => k).join(', ') || 'none';
  return `band: ${score.band} · top drivers: ${drivers || 'none'} · friction term: ${friction} · flags: ${flags}`;
}

// ---------------------------------------------------------------------------
// MOCK narrator — deterministic template-filled sentences from beat + tags
// ---------------------------------------------------------------------------

const TEMPLATES: Partial<Record<EventKind, readonly string[]>> = {
  milestone: [
    '{hint} — {A} and {B} mark it with a long overdue {tag} day.',
    '{hint}; it quietly becomes the thing they measure other years against.',
    '{hint} — small on paper, load-bearing in practice.',
  ],
  move: [
    '{hint}; boxes, a new map pin, and a week of figuring out where the good {tag} spot is.',
    '{hint} — {A} scouts the neighborhood, {B} handles the logistics, and it works.',
    '{hint}; the new place is smaller than promised and better than expected.',
  ],
  job: [
    '{hint} — the calendars take a month to recover, then find a new rhythm.',
    '{hint}; {A} and {B} celebrate with the {tag} tradition they never skip.',
    '{hint} — a bet on the long game, made together.',
  ],
  pet: [
    '{hint} — naming rights are settled over {tag}, and the couch is never the same.',
    '{hint}; within a month neither can remember the place without it.',
  ],
  kid: [
    '{hint} — the household reorganizes around a very small new boss.',
    '{hint}; sleep gets rare, the {tag} plans go on pause, and neither would trade it.',
  ],
  ritual: [
    '{hint} — it starts as a joke and calcifies into the calendar.',
    '{hint}; miss it once and the week feels off. They stop missing it.',
    'Every year since, {hint} — the ritual {A} and {B} defend against every scheduling conflict.',
  ],
  trip: [
    '{hint} — the photos are terrible and the stories are excellent.',
    '{hint}; they come back with an inside joke that survives the decade.',
    '{hint} — planned around {tag}, derailed by weather, rescued by improvisation.',
  ],
  conflict: [
    '{hint} — a rough stretch; both keep showing up anyway.',
    '{hint}; the disagreement is real and neither pretends otherwise.',
    '{hint} — they name the problem out loud, which is harder than it sounds.',
  ],
  recovery: [
    '{hint} — the repair takes actual work, and it lands.',
    '{hint}; what changes is not the problem but how they schedule around it.',
    '{hint} — an honest reset, and the {tag} plans resume.',
  ],
  venture: [
    '{hint} — the whiteboard photo from that night becomes the company origin story.',
    '{hint}; {A} and {B} split the work along the seam that was always there.',
  ],
  client: [
    '{hint} — the first yes changes the tone of every meeting after it.',
    '{hint}; they frame the invoice. Nobody frames the sixteen drafts behind it.',
  ],
  decision: [
    '{hint} — they write down who decides what, before they need it.',
    '{hint}; the tie-break rule is used twice all year, and respected both times.',
  ],
  exit: [
    '{hint} — the handshake takes a minute; the paperwork takes a quarter.',
    '{hint}; they close the chapter on the timeline they said they would.',
  ],
  dissolution: [
    '{hint} — they wind it down deliberately, on their own terms, with the paperwork done right.',
    '{hint}; the ending is quiet, chosen, and handled like adults.',
  ],
  epilogue: [
    'Years later, {hint} — the respect outlasts the arrangement.',
    '{hint}; from a distance, each still roots for the other.',
  ],
  vignette: [
    '{hint} — it becomes one of those stories {A} and {B} keep retelling.',
    '{hint}; the {tag} habit they share does the heavy lifting.',
    '{hint} — nobody plans it, everybody remembers it.',
  ],
};

const DEFAULT_TEMPLATES: readonly string[] = TEMPLATES.vignette as readonly string[];

function fillTemplate(tpl: string, beat: Beat, a: Person, b: Person, tag: string): string {
  const hint = beat.hint.trim().replace(/[.;]\s*$/, '');
  let text = tpl
    .replace(/\{hint\}/g, hint || `year ${beat.year} brings a ${beat.domain} moment`)
    .replace(/\{A\}/g, a.name)
    .replace(/\{B\}/g, b.name)
    .replace(/\{tag\}/g, tag);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

/** Deterministic mock prose for one beat (exported for reuse in approach C's fallback). */
export function mockNarrateBeat(beat: Beat, a: Person, b: Person, seed: number, index: number): string {
  const rng = mulberry32(hashSeed(seed, a.id, b.id, beat.year, beat.kind, index));
  const shared = sharedTags(a, b);
  const tagPool = shared.length > 0 ? shared : [...a.declared.tags, ...b.declared.tags];
  const tag = tagPool.length > 0 ? pick(rng, tagPool) : 'weekend';
  const templates = TEMPLATES[beat.kind] ?? DEFAULT_TEMPLATES;
  return fillTemplate(pick(rng, templates), beat, a, b, tag);
}

// ---------------------------------------------------------------------------
// narrate() — approaches A & B: prose for a pre-sampled beat list.
//
// LIVE PATH = ONE BATCH CALL. The 2026-08-22 model-off measured ~2-minute
// timelines caused by sequential per-beat calling; a single kimi call answers
// in seconds. The batch prompt carries person facts ONCE, the safety rules,
// the full ordered beat list with each beat's established-state facts, and an
// explicit ESTABLISHED STATE inventory (guard against invented state — a dog
// appeared in live prose with no pet event). Validation: exact sentence count,
// per-sentence banned/survival scan, length cap; one retry, then the per-beat
// MOCK path (unchanged — tests depend on mock determinism).
// ---------------------------------------------------------------------------

export interface NarrateResult {
  texts: string[];             // one per beat, same order
  narration: NarrationMode;
  model?: string;
  /** Live batch only: sentences replaced because they referenced a pet no event established. */
  petGuardReplacements?: number;
}

/** Max chars per narrated sentence — mirrors the zod cap for stubbed clients. */
export const MAX_SENTENCE_CHARS = 400;

/** Everything the beats establish — anything else must not appear in prose. */
export interface StateInventory {
  locations: string[];
  kids: string[];
  pets: string[];
  jobs: string[];
  venture: string | null;
}

/** Replay the beat deltas (list order = chronological) into a global inventory. */
export function buildInventory(beats: readonly Beat[]): StateInventory {
  let s = initialState();
  const locations = [s.location];
  const jobs = [s.jobs.a];
  for (const beat of beats) {
    s = applyDelta(s, beat.delta, beat.year);
    if (!locations.includes(s.location)) locations.push(s.location);
    for (const j of [s.jobs.a, s.jobs.b]) if (!jobs.includes(j)) jobs.push(j);
  }
  return { locations, kids: s.kids, pets: s.pets, jobs, venture: s.venture };
}

/** Per-beat established-state line (state AFTER that beat's own delta applies). */
export function establishedFactsPerBeat(beats: readonly Beat[]): string[] {
  let s = initialState();
  return beats.map((beat) => {
    s = applyDelta(s, beat.delta, beat.year);
    return [
      `location: ${s.location}`,
      `kids: ${s.kids.join(', ') || 'none'}`,
      `pets: ${s.pets.join(', ') || 'none'}`,
      s.venture !== null ? `venture: ${s.venture}` : null,
    ].filter((x) => x !== null).join(' · ');
  });
}

/** Cheap invented-state post-check: does the sentence mention a pet-word? */
const PET_WORD_RE = /\b(dogs?|cats?|pupp(?:y|ies)|pups?|kittens?|pets?)\b/i;
export function mentionsPet(text: string): boolean {
  return PET_WORD_RE.test(text);
}

/**
 * Batch response validation: exact count, index bijection (1..n, tolerating a
 * 0-based model), non-empty text under the length cap, and every sentence
 * clean under scanBanned + scanSurvivalClaims. Returns the texts in beat
 * order, or a reason string for the retry/fallback decision.
 */
export function validateBatch(
  object: unknown,
  beatCount: number,
): { ok: true; texts: string[] } | { ok: false; reason: string } {
  const sentences = (object as { sentences?: Array<{ index?: number; text?: string }> })?.sentences;
  if (!Array.isArray(sentences)) return { ok: false, reason: 'no sentences array' };
  if (sentences.length !== beatCount) {
    return { ok: false, reason: `expected ${beatCount} sentences, got ${sentences.length}` };
  }
  const indexes = sentences.map((s) => s?.index);
  if (indexes.some((i) => typeof i !== 'number' || !Number.isInteger(i))) {
    return { ok: false, reason: 'non-integer sentence index' };
  }
  const sorted = [...(indexes as number[])].sort((x, y) => x - y);
  const oneBased = sorted.every((v, i) => v === i + 1);
  const zeroBased = sorted.every((v, i) => v === i);
  if (!oneBased && !zeroBased) return { ok: false, reason: 'sentence indexes are not 1..n' };
  const byBeat = new Array<string>(beatCount);
  for (const s of sentences) {
    const text = (s.text ?? '').trim();
    if (text.length === 0) return { ok: false, reason: 'empty sentence text' };
    if (text.length > MAX_SENTENCE_CHARS) return { ok: false, reason: 'sentence over length cap' };
    if (scanBanned(text).length > 0) return { ok: false, reason: 'banned content in a sentence' };
    if (scanSurvivalClaims(text).length > 0) return { ok: false, reason: 'survival claim in a sentence' };
    byBeat[(s.index as number) - (oneBased ? 1 : 0)] = text;
  }
  return { ok: true, texts: byBeat };
}

/**
 * The live batch path — exported for tests. ONE generateObject call for the
 * whole timeline (through generateWithFallback: capped backoff + 60s abort);
 * on validation failure retries ONCE, then returns null so the caller falls
 * back to the deterministic per-beat mock. Pet-guard post-check: a sentence
 * mentioning a pet-word while the inventory has no pet is replaced with its
 * mock fallback and counted.
 */
export async function narrateBatchLive(
  client: LiveClient,
  beats: readonly Beat[],
  a: Person,
  b: Person,
  lens: Lens,
  opts: TimelineOpts,
): Promise<{ texts: string[]; model: string; petGuardReplacements: number } | null> {
  const { z } = client;
  // Deliberately LOOSE provider-side schema: strict enforcement (exact count,
  // index bijection, length cap, safety scans) lives in validateBatch(), where
  // a near-miss triggers our single retry. A strict zod schema here would turn
  // any near-miss into AI_NoObjectGeneratedError and burn the whole model
  // chain per attempt (observed live: B fell to mock while A ran live).
  const schema = z.object({
    sentences: z.array(z.object({
      index: z.number().int(),
      text: z.string(),
    })),
  });

  const inventory = buildInventory(beats);
  const perBeat = establishedFactsPerBeat(beats);
  const beatList = beats
    .map((bt, i) =>
      `${i + 1}. year ${bt.year} · kind ${bt.kind} · domain ${bt.domain} · what happens: ${bt.hint}\n` +
      `   established state: ${perBeat[i]}`)
    .join('\n');
  const inventoryBlock = [
    'ESTABLISHED STATE inventory (the complete cast of this story):',
    `  locations: ${inventory.locations.join(', ')}`,
    `  kids: ${inventory.kids.join(', ') || 'none'}`,
    `  pets: ${inventory.pets.join(', ') || 'none'}`,
    `  jobs: ${inventory.jobs.join(', ')}`,
    `  venture: ${inventory.venture ?? 'none'}`,
    'HARD RULE: no person, pet, or place may appear in any sentence unless it is in this inventory or in the beat list below. If pets is "none", no animal lives with them and none may be mentioned.',
  ].join('\n');
  const prompt = [
    `You are narrating a simulated shared ${lens} timeline between two real people. The structure is fixed; you only write the prose.`,
    personFacts('Person A', a),
    personFacts('Person B', b),
    inventoryBlock,
    `Write exactly ${beats.length} sentences in ONE response — the sentences array must have exactly ${beats.length} items, index running 1..${beats.length}, where sentence i narrates beat i below. Keep each text under 300 characters.`,
    beatList,
    'Ground each sentence in the two people\'s tags and declared facts where natural, and only within the established state above.',
    SAFETY_RULES,
  ].join('\n\n');

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generateWithFallback(client, (modelId) => ({
      model: client.gateway(modelId),
      schema,
      prompt,
      // One response carries EVERY sentence, so scale the ceiling with the beat
      // count (~12s/beat, floor 90s, cap 240s). At the flat 60s default the big
      // models were cut off mid-batch and the run silently demoted to a weaker
      // fallback — measured 207s and visibly worse prose.
      __timeoutMs: Math.min(240_000, Math.max(90_000, beats.length * 12_000)),
    }));
    if (!result) return null; // every model failed — generateWithFallback already warned
    const v = validateBatch(result.object, beats.length);
    if (!v.ok) continue; // retry ONCE, then fall through to null
    let petGuardReplacements = 0;
    const texts = v.texts.map((text, i) => {
      if (inventory.pets.length === 0 && mentionsPet(text)) {
        petGuardReplacements++;
        return mockNarrateBeat(beats[i], a, b, opts.seed, i);
      }
      return text;
    });
    return { texts, model: result.model, petGuardReplacements };
  }
  warnLiveFellBackToMock('batch narration failed validation twice (count/safety/length)');
  return null;
}

export async function narrate(
  beats: readonly Beat[],
  persons: readonly [Person, Person],
  lens: Lens,
  opts: TimelineOpts,
): Promise<NarrateResult> {
  const [a, b] = persons;
  const mockAll = (): string[] => beats.map((beat, i) => mockNarrateBeat(beat, a, b, opts.seed, i));

  const client = await getClient(opts.live);
  if (client.mode === 'mock') {
    if (opts.live === true) warnLiveFellBackToMock('no usable gateway client (missing key or ai package not installed)');
    return { texts: mockAll(), narration: 'mock' };
  }

  const live = await narrateBatchLive(client, beats, a, b, lens, opts);
  if (live === null) return { texts: mockAll(), narration: 'mock' };
  return {
    texts: live.texts,
    narration: 'live',
    model: live.model,
    ...(live.petGuardReplacements > 0 ? { petGuardReplacements: live.petGuardReplacements } : {}),
  };
}

// ---------------------------------------------------------------------------
// nominate() — approach B: LLM-proposed bonus arc from the grammar; the CALLER
// verifies triggerClaim against the actual scores and admits or rejects.
// ---------------------------------------------------------------------------

export interface GrammarSpace {
  patterns: readonly string[];
  domains: readonly string[];
  outcomes: readonly string[];
}

export interface Nomination {
  pattern: string;
  domain: string;
  outcome: string;
  /** e.g. "driver:commonGround" or "friction:lifeShape" — verified by code. */
  triggerClaim: string;
}

export interface NominateResult {
  nomination: Nomination;
  narration: NarrationMode;
  model?: string;
}

export async function nominate(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  grammar: GrammarSpace,
  opts: TimelineOpts,
): Promise<NominateResult> {
  const mock = (): Nomination => {
    const rng = mulberry32(hashSeed(opts.seed, 'nominate', a.id, b.id, lens));
    const useFriction = score.friction !== null && rng() < 0.5;
    const term = useFriction ? score.friction!.term : (score.drivers[0]?.term ?? 'commonGround');
    return {
      pattern: pick(rng, grammar.patterns),
      domain: pick(rng, grammar.domains),
      outcome: pick(rng, grammar.outcomes),
      triggerClaim: `${useFriction ? 'friction' : 'driver'}:${term}`,
    };
  };

  const client = await getClient(opts.live);
  if (client.mode === 'mock') {
    if (opts.live === true) warnLiveFellBackToMock('no usable gateway client (missing key or ai package not installed)');
    return { nomination: mock(), narration: 'mock' };
  }

  const { z } = client;
  const asEnum = (xs: readonly string[]) => z.enum(xs as [string, ...string[]]);
  const schema = z.object({
    pattern: asEnum(grammar.patterns),
    domain: asEnum(grammar.domains),
    outcome: asEnum(grammar.outcomes),
    triggerClaim: z.string().min(3).max(60),
  });
  const prompt = [
    `Propose ONE bonus story arc for a simulated ${lens} timeline between these two people, chosen from a fixed grammar.`,
    personFacts('Person A', a),
    personFacts('Person B', b),
    `Their pair score: ${scoreFacts(score)}`,
    `Pick exactly one pattern from [${grammar.patterns.join(', ')}], one domain from [${grammar.domains.join(', ')}], one outcome from [${grammar.outcomes.join(', ')}].`,
    'triggerClaim must name the score component that justifies the arc, formatted "driver:<term>", "friction:<term>", or "flag:<flagName>" using the terms listed above. Your claim will be verified against the actual scores by code; unjustified arcs are rejected.',
    SAFETY_RULES,
  ].join('\n\n');

  const result = await generateWithFallback(client, (modelId) => ({
    model: client.gateway(modelId),
    schema,
    prompt,
  }));
  if (!result) return { nomination: mock(), narration: 'mock' };
  return { nomination: result.object as Nomination, narration: 'live', model: result.model };
}

// ---------------------------------------------------------------------------
// fullGenerate() — approach C: arcs AND events in one structured call, guided
// by the caller-supplied skill documents. The caller validates (schema,
// friction arc, kid gates, coherence, banned scan) with one retry, then hard
// fallback — this function itself never throws.
// ---------------------------------------------------------------------------

export interface FullGenCandidate {
  arcs: Arc[];
  events: TimelineEvent[];
  /** rom/biz only; friendship candidates must leave both undefined. */
  dissolution?: { year: number; arcId: string } | null;
  epilogue?: string | null;
  horizonYears?: number;
}

export interface FullGenerateResult {
  candidate: FullGenCandidate | null; // null only if even the mock path is impossible
  narration: NarrationMode;
  model?: string;
}

export interface SkillDocs {
  arcScience: string;      // timeline/approach-c/skills/arc-science.md content
  narrativeSafety: string; // timeline/approach-c/skills/narrative-safety.md content
}

/**
 * Human phrasing per score term — internal pillar names (camelCase TermNames)
 * must NEVER leak into user-facing prose. Authored noun phrases with singular
 * heads so they compose into sentences ("<gap> surfaces for real", "<strength>
 * becomes a yearly tradition"). Shared by this mock candidate and approach C's
 * internal fallback sampler.
 */
export const TERM_PHRASES: Record<TermName, { gap: string; strength: string }> = {
  regulation:   { gap: 'the mismatch in how fast they each run hot', strength: 'the calm they lend each other on hard days' },
  politeness:   { gap: 'the edge that blunt remarks can carry', strength: 'the easy warmth in how they talk' },
  reliability:  { gap: 'the space between plans made and plans kept', strength: 'their habit of doing what they said' },
  agency:       { gap: 'the tug of two people used to driving', strength: 'the drive they both bring' },
  distance:     { gap: 'the stretch of quiet before either reaches back out', strength: 'the ease of picking the thread back up' },
  lifeShape:    { gap: 'the mismatch in how they map money, pace, and roots', strength: 'the way their weeks already fit each other' },
  commonGround: { gap: 'the shrinking overlap in their calendars', strength: 'the shared ground they keep returning to' },
  structural:   { gap: 'the absence of rooms that used to throw them together', strength: 'the way their worlds keep overlapping' },
  eligibility:  { gap: 'the unanswered timing of the big steps', strength: 'timing that lines up on the big steps' },
};

/**
 * Deterministic candidate — lets approach C exercise its validator offline.
 * Seed-varied structure (years, kid inclusion, hazard-sampled dissolution),
 * kind-appropriate domains per beat, and human phrasing only (no raw TermNames).
 */
function mockFullCandidate(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
): FullGenCandidate {
  const c = LENS_CONSTRAINTS[lens];
  const rng = mulberry32(hashSeed(opts.seed, 'fullgen', a.id, b.id, lens));
  const span = c.yearSpan[0];
  const frictionTerm = score.friction?.term ?? 'lifeShape';
  const driverTerm = score.drivers[0]?.term ?? 'commonGround';
  const gap = TERM_PHRASES[frictionTerm].gap;
  const strength = TERM_PHRASES[driverTerm].strength;
  const texture = sharedTags(a, b).slice(0, 2).join(' and ') || 'an easy shared rhythm';

  const arcs: Arc[] = [];
  let dissolution: { year: number; arcId: string } | null = null;

  if (lens === 'friendship') {
    const cy = 3 + Math.floor(rng() * 2);   // conflict year 3-4
    const ry = Math.min(cy + 1, span);      // recovery right after
    arcs.push(
      {
        id: 'arc-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
        beats: [
          { year: cy, kind: 'conflict', domain: 'distance-texture', hint: `a season tests ${gap}` },
          { year: ry, kind: 'recovery', domain: 'distance-texture', hint: 'one of them reaches out first and the thread picks right back up' },
        ],
      },
      {
        id: 'arc-driver', role: 'driver', sourceTerm: driverTerm, label: 'What carries them',
        beats: [
          { year: 1, kind: 'vignette', domain: 'food', hint: `it starts with ${texture} and an easy first hangout` },
          { year: 2, kind: 'ritual', domain: 'ritual', hint: `${strength} turns into a standing plan` },
          { year: Math.min(span, ry + 1 + Math.floor(rng() * 2)), kind: 'trip', domain: 'trip', hint: `a short trip built around ${texture}` },
        ],
      },
    );
    // Friendship: no horizon, no dissolution, no epilogue — by construction.
  } else if (lens === 'romantic') {
    const cy = 2 + Math.floor(rng() * 2);                                        // conflict year 2-3
    const ry = cy + 1;                                                           // recovery 3-4
    const ritualYear = ry + 1 + Math.floor(rng() * 2);                           // 4-6
    const tripYear = Math.min(span - 1, ritualYear + 1 + Math.floor(rng() * 2)); // 5-7
    const driverArc: Arc = {
      id: 'arc-driver', role: 'driver', sourceTerm: driverTerm, label: 'What carries them',
      beats: [
        { year: 1, kind: 'milestone', domain: 'home', hint: `it starts with ${texture} and a first month that feels easy` },
        { year: ritualYear, kind: 'ritual', domain: 'ritual', hint: `${strength} becomes a yearly tradition` },
        { year: tripYear, kind: 'trip', domain: 'travel', hint: `a trip planned around ${texture}` },
      ],
    };
    const frictionArc: Arc = {
      id: 'arc-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
      beats: [
        { year: cy, kind: 'conflict', domain: 'conflict-recovery', hint: `${gap} surfaces for real between ${a.name} and ${b.name}` },
        { year: ry, kind: 'recovery', domain: 'conflict-recovery', hint: 'they redesign the week around the gap instead of pretending it is gone' },
      ],
    };
    // Kid beat — only through the full gate (wantsKids both + consent both), and
    // always earlier than any sampled dissolution below (kid year < tripYear < d).
    if (kidEventAllowed(a, b, lens, opts, true) && rng() < 0.5) {
      driverArc.beats.push({
        year: Math.min(span - 2, ry + 1), kind: 'kid', domain: 'kids',
        hint: 'their first kid arrives', delta: { addKid: 'their first kid' },
      });
    }
    arcs.push(frictionArc, driverArc);
    // Hazard-sampled ending (RESEARCH §5.1 shape) — accepted only when it lands
    // after every regular beat, so the event minimum and kid gate always hold.
    const d = sampleDissolutionYear(rng, score.sim, span);
    const maxYear = Math.max(...arcs.flatMap((x) => x.beats.map((bt) => bt.year)));
    if (d !== null && d > maxYear) {
      frictionArc.beats.push({
        year: d, kind: 'dissolution', domain: 'conflict-recovery',
        hint: `${gap} outlasts every workaround`, delta: { dissolve: true },
      });
      dissolution = { year: d, arcId: 'arc-friction' };
    }
  } else { // business
    const cy = 2 + Math.floor(rng() * 2);           // conflict year 2-3
    const ry = Math.min(cy + 1, span - 1);          // recovery 3-4
    const decisionYear = 3 + Math.floor(rng() * 2); // 3-4
    const frictionArc: Arc = {
      id: 'arc-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
      beats: [
        { year: cy, kind: 'conflict', domain: 'work-rhythm', hint: `${gap} shows up in the week-to-week rhythm` },
        { year: ry, kind: 'recovery', domain: 'work-rhythm', hint: 'they codify the working rhythm so the gap stops costing them mornings' },
      ],
    };
    const driverArc: Arc = {
      id: 'arc-driver', role: 'driver', sourceTerm: driverTerm, label: 'Building it',
      beats: [
        { year: 1, kind: 'venture', domain: 'runway', hint: `they commit to building together — ${strength} sets the pace`, delta: { venture: 'the venture' } },
        { year: 2, kind: 'client', domain: 'first-client', hint: 'the first client says yes and the tone of every meeting changes' },
        { year: decisionYear, kind: 'decision', domain: 'decision-rights', hint: 'they write down who decides what before they need it' },
      ],
    };
    arcs.push(frictionArc, driverArc);
    const d = sampleDissolutionYear(rng, score.sim, span);
    const maxYear = Math.max(...arcs.flatMap((x) => x.beats.map((bt) => bt.year)));
    if (d !== null && d > maxYear) {
      frictionArc.beats.push({
        year: d, kind: 'dissolution', domain: 'exit',
        hint: 'the venture reaches the point they agreed on', delta: { dissolve: true },
      });
      dissolution = { year: d, arcId: 'arc-friction' };
    }
  }

  const beatsFlat = arcs.flatMap((arc) => arc.beats.map((beat) => ({ arc, beat })));
  beatsFlat.sort((x, y) => x.beat.year - y.beat.year);
  const events: TimelineEvent[] = beatsFlat.map(({ arc, beat }, i) => ({
    year: beat.year,
    arcId: arc.id,
    kind: beat.kind,
    domain: beat.domain,
    text: mockNarrateBeat(beat, a, b, opts.seed, i),
  }));
  const out: FullGenCandidate = { arcs, events };
  if (lens !== 'friendship') {
    out.horizonYears = span;
    out.dissolution = dissolution;
    out.epilogue = null;
  }
  return out;
}

export async function fullGenerate(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
  skills: SkillDocs,
): Promise<FullGenerateResult> {
  const client = await getClient(opts.live);
  if (client.mode === 'mock') {
    if (opts.live === true) warnLiveFellBackToMock('no usable gateway client (missing key or ai package not installed)');
    return { candidate: mockFullCandidate(a, b, score, lens, opts), narration: 'mock' };
  }

  const { z } = client;
  const c = LENS_CONSTRAINTS[lens];
  const kindEnum = z.enum(c.allowedKinds as unknown as [string, ...string[]]);
  const domainEnum = z.enum(c.domains as unknown as [string, ...string[]]);
  const deltaSchema = z.object({
    location: z.string().optional(),
    addKid: z.string().optional(),
    addPet: z.string().optional(),
    jobA: z.string().optional(),
    jobB: z.string().optional(),
    venture: z.string().optional(),
    dissolve: z.boolean().optional(),
  }).partial();
  const beatSchema = z.object({
    year: z.number().int().min(1).max(c.yearSpan[1]),
    kind: kindEnum,
    domain: domainEnum,
    hint: z.string().min(3).max(200),
    delta: deltaSchema.optional(),
  });
  // NOTE: nullable-or-absent — flash-class models omit keys instead of writing
  // explicit null; downstream already maps undefined → null (assembleTimeline,
  // Arc.sourceTerm only ever compared against the friction term).
  const arcSchema = z.object({
    id: z.string().min(1).max(40),
    role: z.enum(['driver', 'friction', 'flag', 'texture', 'bonus']),
    sourceTerm: z.enum(['regulation', 'politeness', 'reliability', 'agency', 'distance', 'lifeShape', 'commonGround', 'structural', 'eligibility']).nullable().optional(),
    label: z.string().min(1).max(60),
    beats: z.array(beatSchema).min(1).max(5),
  });
  const eventSchema = z.object({
    year: z.number().int().min(1).max(c.yearSpan[1]),
    arcId: z.string(),
    kind: kindEnum,
    domain: domainEnum,
    text: z.string().min(1).max(400),
  });
  const base = {
    arcs: z.array(arcSchema).min(2).max(6),
    events: z.array(eventSchema).min(c.minEvents).max(c.maxEvents),
  };
  const schema = lens === 'friendship'
    ? z.object(base)
    : z.object({
        ...base,
        horizonYears: z.number().int().min(c.yearSpan[0]).max(c.yearSpan[1]),
        dissolution: z.object({ year: z.number().int().min(2), arcId: z.string() }).nullable().optional(),
        epilogue: z.string().max(400).nullable().optional(),
      });

  const prompt = [
    `Generate a complete simulated ${lens} timeline (arcs + narrated events) for these two people. Follow BOTH skill documents below exactly.`,
    '=== SKILL: arc science ===',
    skills.arcScience,
    '=== SKILL: narrative safety ===',
    skills.narrativeSafety,
    '=== The pair ===',
    personFacts('Person A', a),
    personFacts('Person B', b),
    `Pair score: ${scoreFacts(score)}`,
    `Hard requirements: at least one arc with role "friction" citing the friction term; ${c.minEvents}-${c.maxEvents} events sorted by year; every event's arcId must match an arc; only kinds [${c.allowedKinds.join(', ')}] and domains [${c.domains.join(', ')}].`,
    SAFETY_RULES,
  ].join('\n\n');

  const result = await generateWithFallback(client, (modelId) => ({
    model: client.gateway(modelId),
    schema,
    prompt,
  }));
  if (!result) {
    return { candidate: mockFullCandidate(a, b, score, lens, opts), narration: 'mock' };
  }
  return { candidate: result.object as FullGenCandidate, narration: 'live', model: result.model };
}
