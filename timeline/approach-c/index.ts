/**
 * approach-c/index.ts — FULL LLM timeline generation (bake-off approach C).
 *
 * The LLM invents BOTH the arcs and the events in one structured call
 * (`fullGenerate` in timeline/lib/narrator.ts), guided by two rigorous skill
 * documents that ARE the approach:
 *   skills/arc-science.md       — pillar meanings, effect directions, hazard
 *                                 shape, per-lens constraints (PILLARS/RESEARCH)
 *   skills/narrative-safety.md  — banned categories, tone, grounding rules
 *
 * A CODE validator then enforces the contract — schema, per-lens constraints,
 * friction arc present, state coherence, banned-words scan, kid gates — with
 * ONE retry on failure (the retry prompt carries sanitized repair notes: issue
 * codes and category descriptions only, never matched banned text). If the
 * retry also fails, a HARD FALLBACK guarantees a valid timeline:
 *   1. approach A's sampler (timeline/approach-a), when present and valid;
 *   2. otherwise a built-in deterministic sampler in this file.
 * generateTimeline() therefore never throws and never returns nothing.
 *
 * CANONICITY: STORAGE (meta.canonicity === 'storage'). Unlike approaches A/B,
 * the live structure here is LLM-authored and is NOT seeded-deterministic.
 * Canonicity is achieved by storage: the CALLER persists the FIRST generated
 * timeline for a (pair, lens) and re-serves it forever; regeneration is an
 * explicit, destructive act. In mock/fallback mode the output happens to be
 * seeded-deterministic, but callers must not rely on that property.
 *
 * Offline contract: with no API key or opts.live !== true, the shared mock
 * narrator produces the candidate (meta.narration = 'mock') — nothing crashes.
 */

import { readFileSync } from 'node:fs';
import type {
  Arc, GenerateTimeline, Lens, PairScore, Person, TermName, Timeline,
  TimelineEvent, TimelineMeta, TimelineOpts, ValidationIssue,
} from '../shared.ts';
import {
  LENS_CONSTRAINTS, hashSeed, isDegradedPair, kidEventAllowed, mulberry32,
  sampleDissolutionYear, sharedTags, validateTimeline,
} from '../shared.ts';
import { TERM_PHRASES, fullGenerate, mockNarrateBeat, type FullGenCandidate, type SkillDocs } from '../lib/narrator.ts';

// ---------------------------------------------------------------------------
// Skill documents — loaded once; these are the approach
// ---------------------------------------------------------------------------

const SKILLS_DIR = new URL('./skills/', import.meta.url);

function loadSkill(name: string): string {
  return readFileSync(new URL(name, SKILLS_DIR), 'utf8');
}

const ARC_SCIENCE = loadSkill('arc-science.md');
const NARRATIVE_SAFETY = loadSkill('narrative-safety.md');

/**
 * Per-pair addendum appended to the arc-science skill: computed facts the LLM
 * cannot see through the base prompt (kid-gate verdict, degraded mode, flags,
 * lens structural reminders). Keeps the base documents static and reusable.
 */
function pairAddendum(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
  degraded: boolean,
): string {
  const tags = sharedTags(a, b);
  const lines: string[] = [
    '',
    '## This specific pair (computed context — trust these over inference)',
    `- Shared tags: ${tags.join(', ') || '(none — build texture from each person\'s own declared tags instead)'}`,
  ];
  if (degraded) {
    lines.push('- DEGRADED MODE: at least one trait estimate on one side is an imputed prior with wide uncertainty. Build arcs from declared facts (tags, life shape, structure); keep trait attributions minimal; still deliver the full event count.');
  }
  if (lens === 'friendship') {
    lines.push('- FRIENDSHIP STRUCTURE: output has NO horizonYears, NO dissolution, NO epilogue field, and no ending events of any kind.');
  } else {
    const kidsPermitted = kidEventAllowed(a, b, lens, opts, true);
    lines.push(kidsPermitted
      ? '- Kid events PERMITTED for this pair — but only in years the pair is still together; kid beats must carry delta.addKid; keep them warm and logistical.'
      : '- Kid events FORBIDDEN for this pair — include no kid events and no references to future children.');
  }
  if (lens === 'business' && a.gates.business && b.gates.business) {
    lines.push(`- Exit-horizon gate values: ${a.name}=${a.gates.business.exitHorizon}, ${b.name}=${b.gates.business.exitHorizon} (0 sooner … 2 longer) — pace any exit arc to these.`);
  }
  if (score.flags.bothHighAgency !== undefined) {
    lines.push('- bothHighAgency flag present: include a decision-rights thread — two people used to driving; the durable fix is an explicit split of who decides what.');
  }
  if (score.flags.pursueWithdraw !== undefined) {
    lines.push('- pursueWithdraw flag present: after hard conversations one person needs more time away than the other wants to give — write it as a pacing mismatch with a negotiated re-contact rhythm, never as fault.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Candidate → Timeline assembly
// ---------------------------------------------------------------------------

function assembleTimeline(
  cand: FullGenCandidate,
  a: Person,
  b: Person,
  lens: Lens,
  meta: TimelineMeta,
): Timeline {
  const personA = { id: a.id, name: a.name };
  const personB = { id: b.id, name: b.name };
  const events = [...cand.events].sort((x, y) => x.year - y.year);
  const arcs = cand.arcs;
  if (lens === 'friendship') {
    // Constructed WITHOUT horizon/dissolution/epilogue keys — the structural
    // guarantee of PILLARS §6.1, enforced again by checkSchema at runtime.
    return { lens: 'friendship', personA, personB, arcs, events, meta };
  }
  const span = LENS_CONSTRAINTS[lens].yearSpan;
  return {
    lens,
    personA,
    personB,
    arcs,
    events,
    meta,
    horizonYears: cand.horizonYears ?? span[0],
    dissolution: cand.dissolution ?? null,
    epilogue: cand.epilogue ?? null,
  } as Timeline;
}

// ---------------------------------------------------------------------------
// Validator — shared checks + approach-C-specific checks
// ---------------------------------------------------------------------------

function err(code: string, message: string): ValidationIssue {
  return { code, severity: 'error', message };
}

/** Raw-candidate checks that assembly would otherwise silently mask. */
function candidateIssues(cand: FullGenCandidate, lens: Lens): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (lens === 'friendship') {
    if (cand.dissolution !== undefined && cand.dissolution !== null) {
      out.push(err('c.friendship-dissolution', 'candidate smuggled a dissolution into a friendship timeline (PILLARS §6.1: no ending, ever)'));
    }
    if (cand.horizonYears !== undefined) {
      out.push(err('c.friendship-horizon', 'candidate smuggled horizonYears into a friendship timeline (no duration claim, PILLARS §6.1)'));
    }
    if (cand.epilogue !== undefined && cand.epilogue !== null) {
      out.push(err('c.friendship-epilogue', 'candidate smuggled an epilogue into a friendship timeline (PILLARS §6.1)'));
    }
  } else if (cand.horizonYears === undefined) {
    out.push(err('c.horizon-missing', `candidate lacks horizonYears (required in the ${lens} lens)`));
  }
  return out;
}

/**
 * State-coherence hardening beyond shared checkCoherence: every state-bearing
 * EVENT (kid/pet/move) must trace to a beat in its arc that carries the delta —
 * otherwise later references would use unestablished state (CONTEXT §3).
 */
function checkStateAlignment(t: Timeline): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const arcById = new Map(t.arcs.map((arc) => [arc.id, arc]));
  for (const e of t.events) {
    if (e.kind !== 'kid' && e.kind !== 'pet' && e.kind !== 'move') continue;
    const arc = arcById.get(e.arcId);
    const beat = arc?.beats.find((bt) => bt.year === e.year && bt.kind === e.kind);
    const ok = beat !== undefined && (
      (e.kind === 'kid' && !!beat.delta?.addKid) ||
      (e.kind === 'pet' && !!beat.delta?.addPet) ||
      (e.kind === 'move' && !!beat.delta?.location)
    );
    if (!ok) {
      out.push(err('c.state-delta', `${e.kind} event at year ${e.year} has no matching beat carrying its state delta — later references would be unestablished (CONTEXT §3)`));
    }
  }
  return out;
}

function validateCandidate(
  cand: FullGenCandidate,
  t: Timeline,
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
): ValidationIssue[] {
  return [
    ...candidateIssues(cand, lens),
    ...validateTimeline(t, a, b, score, opts),
    ...checkStateAlignment(t),
  ].filter((i) => i.severity === 'error');
}

// ---------------------------------------------------------------------------
// Retry repair notes — SANITIZED. Never echo matched banned text back into a
// prompt (the safety scanner's messages embed the matched term; we do not).
// ---------------------------------------------------------------------------

const SAFETY_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'gottman': 'named a conflict-communication construct — describe the concrete behavior instead',
  'ultimatum': 'included a demand framed as a threat — remove it',
  'moral-attribution': 'judged a person\'s character or morals — flaws must be situational, never dispositional',
  'infidelity': 'introduced a romantic third party or exclusivity breach — remove it',
  'illness-death': 'included a medical or loss-of-life storyline — remove it',
  'substances': 'referenced an intoxicant — remove it',
  'religion': 'included a faith or worship reference — remove it',
  'politics': 'included a civic or government controversy reference — remove it',
  'money-shame': 'shamed someone about money — financial pressure may only be neutral structure',
};

function sanitizeIssue(i: ValidationIssue): string {
  if (i.code === 'safety.banned') {
    const m = /banned (\S+) term/.exec(i.message);
    const desc = SAFETY_CATEGORY_DESCRIPTIONS[m?.[1] ?? ''];
    return desc ?? 'contained content from a banned category — rewrite that event';
  }
  if (i.code === 'safety.survival-claim') {
    return 'stated a numeric likelihood or duration confidence — remove every such claim';
  }
  return i.message; // non-safety messages never embed generated text
}

function repairNotes(errors: ValidationIssue[]): string {
  const lines = errors.slice(0, 10).map((e) => `- ${e.code}: ${sanitizeIssue(e)}`);
  return [
    '',
    '## Repair notes — your previous attempt was REJECTED by the code validator',
    'Regenerate the ENTIRE timeline and fix every item below:',
    ...lines,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hard fallback 2: built-in deterministic sampler (used when approach A is
// absent or itself invalid). Minimal authored arcs in the spirit of approach A:
// origin/driver + mandatory friction (conflict→recovery) + texture, hazard-
// sampled dissolution for rom/biz, mock narration. Always valid, always >= 5
// events, seeded-deterministic.
// ---------------------------------------------------------------------------

function eventsFromArcs(arcs: Arc[], a: Person, b: Person, seed: number): TimelineEvent[] {
  const flat = arcs.flatMap((arc) => arc.beats.map((beat) => ({ arc, beat })));
  flat.sort((x, y) => x.beat.year - y.beat.year);
  return flat.map(({ arc, beat }, i) => ({
    year: beat.year,
    arcId: arc.id,
    kind: beat.kind,
    domain: beat.domain,
    text: mockNarrateBeat(beat, a, b, seed, i),
  }));
}

export function fallbackTimeline(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
): Timeline {
  const rng = mulberry32(hashSeed(opts.seed, 'approach-c-fallback', a.id, b.id, lens));
  const degraded = isDegradedPair(a, b);
  const frictionTerm: TermName = score.friction?.term ?? 'lifeShape';
  const driverTerm: TermName = score.drivers[0]?.term ?? 'commonGround';
  // Human phrasing only — internal camelCase term names never reach prose.
  const gap = TERM_PHRASES[frictionTerm].gap;
  const strength = TERM_PHRASES[driverTerm].strength;
  const meta: TimelineMeta = {
    approach: 'c-fallback-internal',
    seed: opts.seed,
    narration: 'mock',
    canonicity: 'seeded',
    degraded,
  };
  const personA = { id: a.id, name: a.name };
  const personB = { id: b.id, name: b.name };
  const texture = sharedTags(a, b).slice(0, 2).join(' and ') || 'an easy shared rhythm';
  const minEvents = LENS_CONSTRAINTS[lens].minEvents;

  if (lens === 'friendship') {
    const arcs: Arc[] = [
      {
        id: 'fb-origin', role: 'driver', sourceTerm: driverTerm, label: 'What they build on',
        beats: [
          { year: 1, kind: 'vignette', domain: 'food', hint: `it starts with ${texture} and an easy first hangout` },
          { year: 2, kind: 'ritual', domain: 'ritual', hint: `${strength} turns into a standing plan` },
        ],
      },
      {
        id: 'fb-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
        beats: [
          { year: 3, kind: 'conflict', domain: 'distance-texture', hint: `a season tests ${gap}` },
          { year: 4, kind: 'recovery', domain: 'distance-texture', hint: 'one of them texts first and the thread picks right back up' },
        ],
      },
      {
        id: 'fb-texture', role: 'texture', sourceTerm: null, label: 'The good stuff',
        beats: [
          { year: 5, kind: 'trip', domain: 'trip', hint: `a short trip built around ${texture}` },
          { year: 6, kind: 'vignette', domain: 'media', hint: 'a running joke from year one resurfaces and sticks' },
        ],
      },
    ];
    return { lens: 'friendship', personA, personB, arcs, events: eventsFromArcs(arcs, a, b, opts.seed), meta };
  }

  const horizon = LENS_CONSTRAINTS[lens].yearSpan[0];
  let arcs: Arc[];
  if (lens === 'romantic') {
    arcs = [
      {
        id: 'fb-origin', role: 'driver', sourceTerm: driverTerm, label: 'What carries them',
        beats: [
          { year: 1, kind: 'milestone', domain: 'home', hint: `it starts with ${texture} and a first month that feels easy` },
          { year: 4, kind: 'ritual', domain: 'ritual', hint: `${strength} becomes a yearly tradition` },
        ],
      },
      {
        id: 'fb-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
        beats: [
          { year: 2, kind: 'conflict', domain: 'conflict-recovery', hint: `${gap} surfaces for real between ${a.name} and ${b.name}` },
          { year: 3, kind: 'recovery', domain: 'conflict-recovery', hint: 'they redesign the week around the gap instead of pretending it is gone' },
        ],
      },
      {
        id: 'fb-texture', role: 'texture', sourceTerm: null, label: 'Texture',
        beats: [
          { year: 5, kind: 'trip', domain: 'travel', hint: `a trip planned around ${texture}` },
          { year: 7, kind: 'milestone', domain: 'craft', hint: 'a shared project one size bigger than last year' },
        ],
      },
    ];
  } else {
    arcs = [
      {
        id: 'fb-origin', role: 'driver', sourceTerm: driverTerm, label: 'Building it',
        beats: [
          { year: 1, kind: 'venture', domain: 'runway', hint: 'they commit to building together and set the runway plan', delta: { venture: 'the venture' } },
          { year: 2, kind: 'client', domain: 'first-client', hint: 'the first client says yes and changes the tone of every meeting' },
        ],
      },
      {
        id: 'fb-friction', role: 'friction', sourceTerm: frictionTerm, label: 'Where it grinds',
        beats: [
          { year: 3, kind: 'conflict', domain: 'work-rhythm', hint: `${gap} shows up in the week-to-week rhythm` },
          { year: 4, kind: 'recovery', domain: 'work-rhythm', hint: 'they codify the working rhythm so the gap stops costing them mornings' },
        ],
      },
      {
        id: 'fb-texture', role: 'texture', sourceTerm: null, label: 'Structure',
        beats: [
          { year: 5, kind: 'decision', domain: 'decision-rights', hint: 'they write down the decision split before they need it' },
        ],
      },
    ];
  }

  // Hazard-sampled ending (RESEARCH §5.1 shape via shared sampler), accepted
  // only when enough beats precede it to keep the minimum event count.
  let dissolution: { year: number; arcId: string } | null = null;
  const d = sampleDissolutionYear(rng, score.sim, horizon);
  if (d !== null) {
    const beatsBefore = arcs.flatMap((x) => x.beats).filter((bt) => bt.year < d).length;
    if (beatsBefore >= minEvents - 1) {
      arcs = arcs
        .map((x) => ({ ...x, beats: x.beats.filter((bt) => bt.year < d) }))
        .filter((x) => x.beats.length > 0 || x.id === 'fb-friction');
      const fr = arcs.find((x) => x.id === 'fb-friction');
      fr?.beats.push({
        year: d,
        kind: 'dissolution',
        domain: lens === 'romantic' ? 'conflict-recovery' : 'exit',
        hint: lens === 'romantic'
          ? `${gap} outlasts every workaround`
          : 'the venture reaches the point they agreed on',
        delta: { dissolve: true },
      });
      dissolution = { year: d, arcId: 'fb-friction' };
    }
  }

  return {
    lens,
    personA,
    personB,
    arcs,
    events: eventsFromArcs(arcs, a, b, opts.seed),
    meta,
    horizonYears: horizon,
    dissolution,
    epilogue: null,
  } as Timeline;
}

// ---------------------------------------------------------------------------
// Hard fallback 1: approach A's sampler, when present and valid
// ---------------------------------------------------------------------------

async function tryApproachA(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  opts: TimelineOpts,
): Promise<Timeline | null> {
  try {
    const mod = await import('../approach-a/index.ts') as { generateTimeline?: GenerateTimeline };
    if (typeof mod.generateTimeline !== 'function') return null;
    const t = await mod.generateTimeline(a, b, score, lens, opts);
    const errors = validateTimeline(t, a, b, score, opts).filter((i) => i.severity === 'error');
    if (errors.length > 0) return null;
    return { ...t, meta: { ...t.meta, approach: 'c-fallback-a' } } as Timeline;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// generateTimeline — the common interface
// ---------------------------------------------------------------------------

export const generateTimeline: GenerateTimeline = async (a, b, score, lens, opts) => {
  const degraded = isDegradedPair(a, b);
  const arcScience = ARC_SCIENCE + '\n' + pairAddendum(a, b, score, lens, opts, degraded);
  let lastErrors: ValidationIssue[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const skills: SkillDocs = {
      arcScience,
      narrativeSafety: attempt === 0
        ? NARRATIVE_SAFETY
        : NARRATIVE_SAFETY + '\n' + repairNotes(lastErrors),
    };
    let result: Awaited<ReturnType<typeof fullGenerate>> | null = null;
    try {
      result = await fullGenerate(a, b, score, lens, opts, skills);
    } catch {
      result = null;
    }
    if (!result || !result.candidate) {
      lastErrors = [err('c.generate-null', 'generator produced no candidate')];
      continue;
    }
    const meta: TimelineMeta = {
      approach: 'c',
      seed: opts.seed,
      narration: result.narration,
      canonicity: 'storage',
      degraded,
      ...(result.model !== undefined ? { model: result.model } : {}),
    };
    const t = assembleTimeline(result.candidate, a, b, lens, meta);
    const errors = validateCandidate(result.candidate, t, a, b, score, lens, opts);
    if (errors.length === 0) return t;
    lastErrors = errors;
  }

  const viaA = await tryApproachA(a, b, score, lens, opts);
  if (viaA !== null) return viaA;
  return fallbackTimeline(a, b, score, lens, opts);
};
