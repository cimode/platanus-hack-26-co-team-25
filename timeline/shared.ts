/**
 * shared.ts — AUDIT F2 score→timeline layer: the ONE interface all three
 * bake-off approaches implement, plus every deterministic utility they share.
 *
 * Normative sources:
 *   PILLARS.md  §2 pillar meanings · §4 inversions · §6.1 friendship ships NO survival curve
 *   AUDIT.md    §1 F2 (fixed event library keyed to pillar bands; LLM narrates a
 *               pre-sampled list) · S10 (no numeric survival fractions voiced) · S11
 *               (kids: desire-only gate) · A7/A8 safety
 *   RESEARCH-COMPATIBILITY.md §5.1 hazard shape (rises, peaks ~yr 4–8, declines)
 *   CONTEXT.md  §3 canonical events; coherence is the product
 *
 * Contract: pure TypeScript, zero runtime dependencies, erasable-types-only syntax
 * (no enums / namespaces / decorators) — runs under `node --experimental-strip-types`.
 * This module is fully deterministic: no Math.random, no Date, no I/O.
 */

import type { Person, PairScore, Lens, TermName } from '../src/lib/domain/matching/engine.ts';

export type { Person, PairScore, Lens, TermName } from '../src/lib/domain/matching/engine.ts';

// ---------------------------------------------------------------------------
// The common interface (every approach exports `generateTimeline` with this shape)
// ---------------------------------------------------------------------------

export interface TimelineOpts {
  seed: number;
  offspringConsentA: boolean;
  offspringConsentB: boolean;
  /** true → use the live LLM narrator (needs AI_GATEWAY_API_KEY); default mock. */
  live?: boolean;
  /**
   * Progressive rendering hooks for the live demo. The beat STRUCTURE is
   * deterministic and costs nothing, so the UI can draw the whole timeline
   * skeleton — years, kinds, domains — the instant it exists, then fill each
   * sentence in as its own call returns. That turns "wait for the slowest
   * beat, see nothing" into "see the shape immediately, watch it write".
   *
   * Both are optional, fire at most once per beat, and are wrapped so a
   * throwing callback can never break generation. Neither affects output:
   * a run with hooks and a run without produce identical timelines.
   */
  onStructure?: (beats: readonly Beat[]) => void;
  /** index is the beat's position in the list passed to onStructure. */
  onSentence?: (index: number, text: string) => void;
}

export type GenerateTimeline = (
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
) => Promise<Timeline>;

export type NarrationMode = 'live' | 'mock';

/** Canonicity model: A/B are seeded-deterministic; C documents storage-canonicity. */
export type Canonicity = 'seeded' | 'storage';

export interface TimelineMeta {
  approach: string;          // 'a' | 'b' | 'c' (free-form label)
  seed: number;
  narration: NarrationMode;
  canonicity: Canonicity;
  degraded: boolean;         // pair ran with >=1 imputed latent (AUDIT S15)
  model?: string;            // gateway model id when narration === 'live'
  /** Live narration: sentences replaced by the invented-state pet guard. */
  petGuardReplacements?: number;
  /** Live parallel narration: beats whose own call failed and took mock prose. */
  mockFallbacks?: number;
}

// ---------------------------------------------------------------------------
// Events, beats, arcs
// ---------------------------------------------------------------------------

export type EventKind =
  | 'milestone' | 'move' | 'job' | 'pet' | 'kid' | 'ritual' | 'trip'
  | 'conflict' | 'recovery'
  | 'venture' | 'client' | 'decision' | 'exit'
  | 'dissolution' | 'epilogue' | 'vignette';

export type ArcRole = 'driver' | 'friction' | 'flag' | 'texture' | 'bonus';

/** Threaded world-state deltas — coherence is the product (CONTEXT §3). */
export interface StateDelta {
  location?: string;
  addKid?: string;   // label, e.g. 'their first kid'
  addPet?: string;   // label, e.g. 'a rescue dog'
  jobA?: string;
  jobB?: string;
  venture?: string;  // business: the venture's working name
  dissolve?: boolean;
}

/** A pre-narration beat: structure decided by code, prose decided by the narrator. */
export interface Beat {
  year: number;        // 1-based simulated year
  kind: EventKind;
  domain: string;      // one of LENS_CONSTRAINTS[lens].domains
  hint: string;        // concrete structured hint for the narrator (what happens)
  delta?: StateDelta;
}

export interface Arc {
  id: string;
  role: ArcRole;
  /** Pillar that triggered this arc; null for pure texture / bonus arcs. */
  sourceTerm: TermName | null;
  label: string;       // short human label — scanned for banned words too
  beats: Beat[];
}

export interface TimelineEvent {
  year: number;
  arcId: string;
  kind: EventKind;
  domain: string;
  text: string;        // narrated sentence(s) — user-facing, safety-scanned
}

// ---------------------------------------------------------------------------
// Timeline — discriminated union. The friendship variant STRUCTURALLY lacks
// duration/dissolution fields (PILLARS §6.1: no survival curve, no numeric
// duration claim — episodic vignettes keyed to shared texture).
// ---------------------------------------------------------------------------

export interface PairRef { id: string; name: string }

interface TimelineBase {
  personA: PairRef;
  personB: PairRef;
  arcs: Arc[];
  events: TimelineEvent[];  // sorted by year ascending
  meta: TimelineMeta;
}

export interface RomanticTimeline extends TimelineBase {
  lens: 'romantic';
  horizonYears: number;                               // span of the simulation
  dissolution: { year: number; arcId: string } | null; // null = together at horizon
  epilogue: string | null;                             // ONE optional post-dissolution beat
}

export interface BusinessTimeline extends TimelineBase {
  lens: 'business';
  horizonYears: number;
  dissolution: { year: number; arcId: string } | null; // wind-down / exit of the venture
  epilogue: string | null;
}

/** No horizonYears, no dissolution, no epilogue — by construction. */
export interface FriendshipTimeline extends TimelineBase {
  lens: 'friendship';
}

export type Timeline = RomanticTimeline | BusinessTimeline | FriendshipTimeline;

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32 (deterministic structure; canonicity by storage)
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over strings/numbers → 32-bit sub-seed (derive per-pair, per-beat seeds). */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // separator so ('ab','c') !== ('a','bc')
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// State threading — events only reference established state (CONTEXT §3)
// ---------------------------------------------------------------------------

export interface ThreadedState {
  location: string;
  kids: string[];
  pets: string[];
  jobs: { a: string; b: string };
  venture: string | null;
  dissolvedAtYear: number | null;
}

export function initialState(): ThreadedState {
  return {
    location: 'the city where they met',
    kids: [],
    pets: [],
    jobs: { a: 'their current work', b: 'their current work' },
    venture: null,
    dissolvedAtYear: null,
  };
}

export function applyDelta(s: ThreadedState, d: StateDelta | undefined, year: number): ThreadedState {
  if (!d) return s;
  const next: ThreadedState = {
    ...s,
    kids: [...s.kids],
    pets: [...s.pets],
    jobs: { ...s.jobs },
  };
  if (d.location !== undefined) next.location = d.location;
  if (d.addKid !== undefined) next.kids.push(d.addKid);
  if (d.addPet !== undefined) next.pets.push(d.addPet);
  if (d.jobA !== undefined) next.jobs.a = d.jobA;
  if (d.jobB !== undefined) next.jobs.b = d.jobB;
  if (d.venture !== undefined) next.venture = d.venture;
  if (d.dissolve) next.dissolvedAtYear = s.dissolvedAtYear ?? year;
  return next;
}

/** Replay all beats of all arcs in year order → state as of the END of each year. */
export function replayBeats(arcs: readonly Arc[]): Map<number, ThreadedState> {
  const beats = arcs
    .flatMap((a) => a.beats)
    .slice()
    .sort((x, y) => x.year - y.year);
  const byYear = new Map<number, ThreadedState>();
  let s = initialState();
  for (const b of beats) {
    s = applyDelta(s, b.delta, b.year);
    byYear.set(b.year, s);
  }
  return byYear;
}

/** State established at (the end of) the latest replayed year <= `year`. */
export function stateAt(byYear: Map<number, ThreadedState>, year: number): ThreadedState {
  let best = initialState();
  let bestYear = -1;
  for (const [y, s] of byYear) {
    if (y <= year && y > bestYear) { bestYear = y; best = s; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Hazard shape — RESEARCH §5.1: dissolution hazard is not flat; it RISES over
// the first years, PEAKS somewhere around years 4–8, then DECLINES for
// surviving couples. Unitless illustrative dynamics — these numbers are
// INTERNAL ONLY and must never be voiced or rendered as survival fractions
// (AUDIT S10). Used to place arc windows and sample dissolution years in the
// romantic and business lenses. Friendship never touches this (PILLARS §6.1).
// ---------------------------------------------------------------------------

export const HAZARD_ONSET_LEVEL = 0.25;    // relative hazard at year 1
export const HAZARD_PEAK_START_YEAR = 4;   // peak window opens (RESEARCH §5.1)
export const HAZARD_PEAK_END_YEAR = 8;     // peak window closes
export const HAZARD_PEAK_LEVEL = 1.0;      // shape maximum (unitless)
export const HAZARD_DECLINE_RATE = 0.25;   // exponential decline past the peak
/** Hand-tuned per-year scale for sampling — illustrative, never user-facing. */
export const HAZARD_BASE_P = 0.24;
/** How strongly pair quality (w_sim) suppresses hazard in the sampler. */
export const HAZARD_SIM_DAMPING = 0.85;
/** w_sim blends rarely exceed ~0.7 in practice; normalize before damping. */
export const HAZARD_SIM_CEILING = 0.7;

/** Unitless hazard shape h(year): linear rise → flat peak (yr 4–8) → exp decline. */
export function hazardShape(year: number): number {
  if (year < 1) return 0;
  if (year < HAZARD_PEAK_START_YEAR) {
    const t = (year - 1) / (HAZARD_PEAK_START_YEAR - 1);
    return HAZARD_ONSET_LEVEL + t * (HAZARD_PEAK_LEVEL - HAZARD_ONSET_LEVEL);
  }
  if (year <= HAZARD_PEAK_END_YEAR) return HAZARD_PEAK_LEVEL;
  return HAZARD_PEAK_LEVEL * Math.exp(-HAZARD_DECLINE_RATE * (year - HAZARD_PEAK_END_YEAR));
}

/**
 * Seeded dissolution-year draw for rom/biz: sequential per-year Bernoulli with
 * p(y) = HAZARD_BASE_P · h(y) · (1 − damping · min(1, sim/ceiling)).
 * Returns null when the pair survives the horizon. Friendship must not call this.
 */
export function sampleDissolutionYear(
  rng: () => number,
  sim: number,
  horizonYears: number,
): number | null {
  const simNorm = Math.min(1, Math.max(0, sim) / HAZARD_SIM_CEILING);
  for (let y = 2; y <= horizonYears; y++) { // year 1 is formation — never dissolve there
    const p = HAZARD_BASE_P * hazardShape(y) * (1 - HAZARD_SIM_DAMPING * simNorm);
    if (rng() < p) return y;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Safety — A7/A8 read-aloud safety. Banned EVERYWHERE (templates, prompts,
// generated output): ultimatums, moral attribution, infidelity, illness/death,
// substances, religion, politics, money shame — and the four Gottman conflict
// words, which never appear in any template or prompt-authored output
// (RESEARCH §2, PILLARS §5 A7/A8).
// ---------------------------------------------------------------------------

export interface BannedHit { category: string; match: string }

const BANNED_PATTERNS: ReadonlyArray<{ category: string; re: RegExp }> = [
  { category: 'gottman', re: /\b(criticism|contempt|defensiveness|stonewall\w*)\b/gi },
  { category: 'ultimatum', re: /\bultimatum\w*\b/gi },
  { category: 'moral-attribution', re: /\b(selfish|toxic|narcissis\w*|abus\w*|manipulat\w*|lazy|liar|lying|cruel|pathetic|worthless|deadbeat)\b/gi },
  { category: 'infidelity', re: /\b(cheat\w*|affair|infidelity|unfaithful|betray\w*|mistress)\b/gi },
  { category: 'illness-death', re: /\b(cancer|tumou?r|terminal|diagnos\w*|illness|disease|hospitali[sz]\w*|death|dies|died|dying|funeral|suicid\w*|grief|widow\w*)\b/gi },
  { category: 'substances', re: /\b(drugs?|alcohol\w*|drunk|wasted|hangover|addict\w*|cocaine|weed|vap(e|ing)|cigarette\w*|smoking|sober|rehab)\b/gi },
  { category: 'religion', re: /\b(religio\w*|church|mosque|synagogue|temple|god|allah|jesus|pray\w*|bible|quran|atheis\w*|baptis\w*)\b/gi },
  { category: 'politics', re: /\b(politic\w*|election\w*|president\w*|congress|senat\w*|left-wing|right-wing|liberal\w*|conservativ\w*|protest\w*)\b/gi },
  { category: 'money-shame', re: /\b(bankrupt\w*|broke|penniless|foreclos\w*|evict\w*|cheapskate|stingy|gold-?digg\w*|freeload\w*)\b/gi },
];

/** Flat curated word list for validators and docs. The scanner uses the stemmed
 *  regexes above, which cover inflections of these. Do NOT embed this list in
 *  LLM prompts or templates — the four conflict-construct names must never
 *  appear in prompt-authored output; describe the categories instead. */
export const BANNED_WORDS: readonly string[] = [
  // gottman (never in any template or prompt-authored output)
  'criticism', 'contempt', 'defensiveness', 'stonewalling',
  // ultimatums & moral attribution
  'ultimatum', 'selfish', 'toxic', 'narcissist', 'abusive', 'manipulative',
  'lazy', 'liar', 'cruel', 'pathetic', 'worthless',
  // infidelity
  'cheating', 'affair', 'infidelity', 'unfaithful', 'betrayal',
  // illness / death
  'cancer', 'terminal', 'diagnosis', 'illness', 'disease', 'hospitalized',
  'death', 'died', 'dying', 'funeral', 'grief',
  // substances
  'drugs', 'alcohol', 'drunk', 'addiction', 'sober', 'hangover',
  // religion & politics
  'religion', 'church', 'god', 'prayer', 'political', 'election',
  // money shame
  'bankrupt', 'broke', 'penniless', 'evicted', 'stingy',
];

/** Scan user-facing text for banned material. Empty array = clean. */
export function scanBanned(text: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const { category, re } of BANNED_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) hits.push({ category, match: m[0] });
  }
  return hits;
}

/**
 * AUDIT S10: numeric survival fractions never appear in user-facing text.
 * Catches "%", "percent", "odds", "probability", "N of/in M runs", "chance of".
 */
export function scanSurvivalClaims(text: string): string[] {
  const res = [
    /\d+\s*%/g,
    /\bpercent\b/gi,
    /\bprobability\b/gi,
    /\bodds\b/gi,
    /\b\d+\s+(?:of|in)\s+\d+\b/gi,
    /\bchance of\b/gi,
    /\bsurvival\b/gi,
  ];
  const hits: string[] = [];
  for (const re of res) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) hits.push(m[0]);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Per-lens constraint tables
// ---------------------------------------------------------------------------

export interface LensConstraints {
  minEvents: number;   // >= 5 in every lens, including degraded mode
  maxEvents: number;
  /** [min, max] simulated-year span. Friendship: vignette year-keys only —
   *  NOT a duration claim (PILLARS §6.1). */
  yearSpan: readonly [number, number];
  hasDissolution: boolean;
  allowsKidEvents: boolean; // still individually gated by kidEventAllowed()
  allowedKinds: readonly EventKind[];
  domains: readonly string[];
}

export const LENS_CONSTRAINTS: Record<Lens, LensConstraints> = {
  romantic: {
    minEvents: 5,
    maxEvents: 14,
    yearSpan: [8, 14],
    hasDissolution: true,
    allowsKidEvents: true,
    allowedKinds: [
      'milestone', 'move', 'job', 'pet', 'kid', 'ritual', 'trip',
      'conflict', 'recovery', 'dissolution', 'epilogue',
    ],
    domains: [
      'home', 'relocation', 'travel', 'pets', 'kids', 'ritual', 'craft',
      'work-balance', 'conflict-recovery',
    ],
  },
  business: {
    // Arcs live in venture domains: runway, first client, decision rights
    // (bothHighAgency), exit per exitHorizon.
    minEvents: 5,
    maxEvents: 12,
    yearSpan: [5, 10],
    hasDissolution: true,
    allowsKidEvents: true, // kidEventAllowed still requires both romantic wantsKids + consent
    allowedKinds: [
      'milestone', 'move', 'job', 'kid', 'ritual',
      'conflict', 'recovery',
      'venture', 'client', 'decision', 'exit', 'dissolution', 'epilogue',
    ],
    domains: [
      'runway', 'first-client', 'decision-rights', 'hiring', 'product',
      'pivot', 'exit', 'work-rhythm',
    ],
  },
  friendship: {
    // Episodic vignettes keyed to shared texture — structurally no duration,
    // no dissolution, no epilogue (PILLARS §6.1).
    minEvents: 5,
    maxEvents: 10,
    yearSpan: [6, 12],
    hasDissolution: false,
    allowsKidEvents: false,
    allowedKinds: [
      'vignette', 'ritual', 'trip', 'pet', 'move', 'job',
      'conflict', 'recovery', 'milestone',
    ],
    domains: [
      'ritual', 'trip', 'hobby', 'food', 'media', 'project', 'reunion',
      'distance-texture',
    ],
  },
};

// ---------------------------------------------------------------------------
// Gates & degraded mode
// ---------------------------------------------------------------------------

/**
 * Kid events require wantsKids on BOTH (romantic gates — desire only, AUDIT S11),
 * offspring consent on BOTH, and (rom/biz) the relationship alive that year.
 * Friendship: never.
 */
export function kidEventAllowed(
  a: Person,
  b: Person,
  lens: Lens,
  opts: TimelineOpts,
  aliveThatYear: boolean,
): boolean {
  if (lens === 'friendship') return false;
  if (!a.gates.romantic?.wantsKids || !b.gates.romantic?.wantsKids) return false;
  if (!opts.offspringConsentA || !opts.offspringConsentB) return false;
  return aliveThatYear;
}

const LATENT_NAMES = ['regulation', 'politeness', 'reliability', 'agency'] as const;

/** Degraded-mode pair: >=1 latent missing on either side (imputed prior, AUDIT S15). */
export function isDegradedPair(a: Person, b: Person): boolean {
  return LATENT_NAMES.some((n) => a.latents[n] === undefined || b.latents[n] === undefined);
}

/** Tags both persons share (lowercased) — perceived-similarity fuel (RESEARCH §1.1). */
export function sharedTags(a: Person, b: Person): string[] {
  const tb = new Set(b.declared.tags.map((t) => t.toLowerCase()));
  return a.declared.tags.map((t) => t.toLowerCase()).filter((t) => tb.has(t));
}

// ---------------------------------------------------------------------------
// Validator utilities — schema, per-lens constraints, coherence, kid gates,
// friction-arc-present, safety scans. Approach C's validator composes these;
// compare.ts runs them over every approach's output.
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warn';
  message: string;
}

function issue(code: string, severity: 'error' | 'warn', message: string): ValidationIssue {
  return { code, severity, message };
}

/** Structural/schema checks incl. the friendship no-duration guarantee. */
export function checkSchema(t: Timeline): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const c = LENS_CONSTRAINTS[t.lens];
  if (!t.personA?.id || !t.personB?.id) out.push(issue('schema.persons', 'error', 'personA/personB refs missing'));
  if (!Array.isArray(t.arcs) || t.arcs.length === 0) out.push(issue('schema.arcs', 'error', 'no arcs'));
  if (!Array.isArray(t.events)) { out.push(issue('schema.events', 'error', 'events is not an array')); return out; }
  if (t.events.length < c.minEvents) out.push(issue('schema.min-events', 'error', `only ${t.events.length} events; minimum is ${c.minEvents} (degraded mode included)`));
  if (t.events.length > c.maxEvents) out.push(issue('schema.max-events', 'warn', `${t.events.length} events exceeds the ${t.lens} cap of ${c.maxEvents}`));
  if (t.meta?.narration !== 'live' && t.meta?.narration !== 'mock') out.push(issue('schema.meta', 'error', 'meta.narration must be "live" | "mock"'));

  if (t.lens === 'friendship') {
    // Structural guarantee at runtime too (approach C emits raw JSON):
    const anyT = t as unknown as Record<string, unknown>;
    for (const forbidden of ['dissolution', 'horizonYears', 'epilogue']) {
      if (forbidden in anyT) out.push(issue('schema.friendship-structural', 'error', `friendship timeline must not carry "${forbidden}" (PILLARS §6.1: no survival curve, no duration claim)`));
    }
  } else {
    const span = c.yearSpan;
    if (typeof t.horizonYears !== 'number' || t.horizonYears < span[0] || t.horizonYears > span[1]) {
      out.push(issue('schema.horizon', 'error', `horizonYears must be in [${span[0]}, ${span[1]}]`));
    }
    if (t.dissolution !== null) {
      if (t.dissolution.year < 2 || t.dissolution.year > t.horizonYears) out.push(issue('schema.dissolution-year', 'error', 'dissolution year outside (1, horizon]'));
      if (!t.arcs.some((arc) => arc.id === t.dissolution?.arcId)) out.push(issue('schema.dissolution-arc', 'error', 'dissolution.arcId references no arc'));
    }
  }

  const arcIds = new Set(t.arcs.map((arc) => arc.id));
  for (const e of t.events) {
    if (!arcIds.has(e.arcId)) out.push(issue('schema.event-arc', 'error', `event year ${e.year} references unknown arc "${e.arcId}"`));
    if (!c.allowedKinds.includes(e.kind)) out.push(issue('schema.event-kind', 'error', `kind "${e.kind}" not allowed in the ${t.lens} lens`));
    if (!Number.isInteger(e.year) || e.year < 1) out.push(issue('schema.event-year', 'error', `event year ${e.year} must be a positive integer`));
    if (!e.text || e.text.trim().length === 0) out.push(issue('schema.event-text', 'error', `event year ${e.year} has empty text`));
  }
  for (let i = 1; i < t.events.length; i++) {
    if (t.events[i].year < t.events[i - 1].year) {
      out.push(issue('schema.event-order', 'error', 'events not sorted by year ascending'));
      break;
    }
  }
  return out;
}

/** The friction pillar MUST generate at least one arc/vignette (honesty feature). */
export function checkFrictionArc(t: Timeline, score: PairScore): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const frictionArcs = t.arcs.filter((a) => a.role === 'friction');
  if (frictionArcs.length === 0) {
    out.push(issue('friction.missing', 'error', 'no friction arc — every timeline must carry at least one (RESEARCH §4.3: the honesty feature)'));
    return out;
  }
  const ids = new Set(frictionArcs.map((a) => a.id));
  if (!t.events.some((e) => ids.has(e.arcId))) {
    out.push(issue('friction.no-events', 'error', 'friction arc exists but produced no events'));
  }
  if (score.friction && !frictionArcs.some((a) => a.sourceTerm === score.friction?.term)) {
    out.push(issue('friction.term-mismatch', 'warn', `friction arc does not cite the scored friction term "${score.friction.term}"`));
  }
  return out;
}

/** Kid gates: every kid event must pass kidEventAllowed, incl. alive-that-year. */
export function checkKidGates(
  t: Timeline,
  a: Person,
  b: Person,
  opts: TimelineOpts,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const dissolutionYear = t.lens === 'friendship' ? null : (t.dissolution?.year ?? null);
  for (const e of t.events) {
    if (e.kind !== 'kid') continue;
    const alive = dissolutionYear === null || e.year < dissolutionYear;
    if (!kidEventAllowed(a, b, t.lens, opts, alive)) {
      out.push(issue('kids.gate', 'error', `kid event at year ${e.year} fails the kid gate (wantsKids both + offspring consent both + relationship alive that year — AUDIT S11)`));
    }
  }
  return out;
}

/**
 * Coherence: threaded state; nothing after dissolution except one optional
 * epilogue; dissolution event matches the header; kid/pet/move events carry
 * their deltas so later references are established (CONTEXT §3).
 */
export function checkCoherence(t: Timeline): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (t.lens === 'friendship') {
    if (t.events.some((e) => e.kind === 'dissolution' || e.kind === 'epilogue')) {
      out.push(issue('coherence.friendship-ending', 'error', 'friendship vignettes must not contain dissolution/epilogue events'));
    }
    return out;
  }
  const dYear = t.dissolution?.year ?? null;
  const dissolutionEvents = t.events.filter((e) => e.kind === 'dissolution');
  if (dYear === null && dissolutionEvents.length > 0) out.push(issue('coherence.dissolution-header', 'error', 'dissolution event present but timeline header says together at horizon'));
  if (dYear !== null) {
    if (dissolutionEvents.length !== 1) out.push(issue('coherence.dissolution-count', 'error', `expected exactly 1 dissolution event, found ${dissolutionEvents.length}`));
    else if (dissolutionEvents[0].year !== dYear) out.push(issue('coherence.dissolution-year', 'error', 'dissolution event year does not match timeline.dissolution.year'));
    const after = t.events.filter((e) => e.year > dYear);
    const nonEpilogue = after.filter((e) => e.kind !== 'epilogue');
    if (nonEpilogue.length > 0) out.push(issue('coherence.after-dissolution', 'error', `${nonEpilogue.length} non-epilogue event(s) after dissolution year ${dYear}`));
    if (after.filter((e) => e.kind === 'epilogue').length > 1) out.push(issue('coherence.epilogue-count', 'error', 'at most one epilogue event after dissolution'));
  } else if (t.events.some((e) => e.kind === 'epilogue')) {
    out.push(issue('coherence.epilogue-alive', 'error', 'epilogue event without a dissolution'));
  }
  // Threaded-state spot check: kid/pet/move/venture beats should carry deltas.
  for (const arc of t.arcs) {
    for (const beat of arc.beats) {
      if (beat.kind === 'kid' && !beat.delta?.addKid) out.push(issue('coherence.kid-delta', 'warn', `kid beat at year ${beat.year} carries no addKid delta`));
      if (beat.kind === 'pet' && !beat.delta?.addPet) out.push(issue('coherence.pet-delta', 'warn', `pet beat at year ${beat.year} carries no addPet delta`));
      if (beat.kind === 'move' && !beat.delta?.location) out.push(issue('coherence.move-delta', 'warn', `move beat at year ${beat.year} carries no location delta`));
    }
  }
  return out;
}

/** Safety scans over every user-facing string (A7/A8 + AUDIT S10). */
export function checkSafety(t: Timeline): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const texts: Array<[string, string]> = t.events.map((e) => [`event y${e.year}`, e.text]);
  for (const arc of t.arcs) texts.push([`arc ${arc.id} label`, arc.label]);
  if (t.lens !== 'friendship' && t.epilogue) texts.push(['epilogue', t.epilogue]);
  for (const [where, text] of texts) {
    for (const hit of scanBanned(text)) {
      out.push(issue('safety.banned', 'error', `${where}: banned ${hit.category} term "${hit.match}"`));
    }
    for (const m of scanSurvivalClaims(text)) {
      out.push(issue('safety.survival-claim', 'error', `${where}: numeric survival/probability claim "${m}" (AUDIT S10)`));
    }
  }
  return out;
}

/** Full validation — union of all checks. Empty array = valid. */
export function validateTimeline(
  t: Timeline,
  a: Person,
  b: Person,
  score: PairScore,
  opts: TimelineOpts,
): ValidationIssue[] {
  return [
    ...checkSchema(t),
    ...checkFrictionArc(t, score),
    ...checkKidGates(t, a, b, opts),
    ...checkCoherence(t),
    ...checkSafety(t),
  ];
}
