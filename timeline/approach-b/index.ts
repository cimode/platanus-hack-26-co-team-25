/**
 * approach-b/index.ts — GRAMMAR HYBRID (AUDIT F2 bake-off, approach B).
 *
 * Structure pipeline (seeded-deterministic; canonicity 'seeded'):
 *   1. Timing skeleton — horizon drawn from the lens span; rom/biz dissolution
 *      sampled from the RESEARCH §5.1 hazard shape damped by w_sim.
 *      Friendship draws an internal vignette year-key span only — it ships
 *      NO horizon, NO dissolution, NO epilogue (PILLARS §6.1).
 *   2. Mandatory friction arc — the scored friction term picks its domain
 *      (grammar.FRICTION_DOMAINS) and its clash lands in the hazard window.
 *      When a dissolution was drawn, the friction arc carries the wind-down:
 *      early grind → unravel → dissolution → one epilogue.
 *   3. Warm driver arcs — pattern × domain × outcome sampled with weights
 *      conditioned on the actual drivers/sim (grammar.ts tables).
 *   4. Gated extras — kid arc (kidEventAllowed: wantsKids both + offspring
 *      consent both + alive that year, AUDIT S11), flag arcs (bothHighAgency,
 *      pursueWithdraw), business exit per declared exitHorizon, quiet-stretch
 *      beat in the post-peak hazard decline.
 *   5. LLM-NOMINATED bonus arc — nominate() proposes {pattern, domain,
 *      outcome, triggerClaim} from the grammar; verify.ts checks the claim
 *      against the actual PairScore and admits or rejects. Mock nomination is
 *      seeded, so offline structure stays fully deterministic.
 *   6. Event budget by priority, chronological realization with threaded
 *      world state (realize.ts), then narrate() writes the prose (live LLM
 *      via the shared gateway client, or the deterministic mock).
 */

import type {
  GenerateTimeline, Lens, PairScore, Person, TermName, Timeline, TimelineMeta, TimelineOpts,
} from '../shared.ts';
import type { Arc, ArcRole, Beat } from '../shared.ts';
import {
  LENS_CONSTRAINTS, applyDelta, hashSeed, hazardShape, initialState, isDegradedPair,
  kidEventAllowed, mulberry32, randInt, sampleDissolutionYear, sharedTags,
} from '../shared.ts';
import { TERM_LABELS } from '../../src/lib/domain/matching/engine.ts';
import { narrate, nominate } from '../lib/narrator.ts';
import type { OutcomeName, PatternName, StepName } from './grammar.ts';
import {
  DOMAIN_LABELS, FRICTION_DOMAINS, PATTERNS, frictionOutcomeWeights,
  frictionPatternWeights, grammarSpace, outcomeWeights, warmDomainWeights,
  warmPatternWeights, weightedPick,
} from './grammar.ts';
import type { FlagName, RealizeCtx, SpecialBeat } from './realize.ts';
import { deriveVentureName, realizeFlag, realizeFriction, realizeSpecial, realizeWarm } from './realize.ts';
import { verifyTriggerClaim } from './verify.ts';

// ---------------------------------------------------------------------------
// Internal planning types
// ---------------------------------------------------------------------------

interface BeatPlan {
  year: number;
  step: StepName;
  special?: SpecialBeat;
  realized?: Beat;
}

interface ArcPlan {
  id: string;
  role: ArcRole;
  sourceTerm: TermName | null;
  label: string;
  pattern: PatternName;
  domain: string;
  outcome: OutcomeName;
  beats: BeatPlan[];
  /** When set, clash/repair steps use the authored friction voice for this term. */
  hintTerm?: TermName;
  flag?: FlagName;
}

const clampYear = (y: number, last: number): number => Math.max(1, Math.min(last, y));

/** Hazard-shaped year draw in [lo, hi] — places grind windows per RESEARCH §5.1. */
function hazardYearPick(rng: () => number, lo: number, hi: number): number {
  if (hi <= lo) return Math.max(1, lo);
  const entries: Array<[number, number]> = [];
  for (let y = lo; y <= hi; y++) entries.push([y, hazardShape(y)]);
  return weightedPick(rng, entries);
}

/** Ascending beat years from anchors, clamped to [1, last]; light seeded jitter. */
function warmYears(rng: () => number, count: number, anchors: readonly number[], last: number): number[] {
  const ys: number[] = [];
  let prev = 1;
  for (let i = 0; i < count; i++) {
    const base = anchors[Math.min(i, anchors.length - 1)];
    const jitter = i > 0 && rng() < 0.35 ? 1 : 0;
    const y = clampYear(Math.max(prev, base + jitter), last);
    ys.push(y);
    prev = y;
  }
  return ys;
}

/** Pattern steps, trimmed to at most `max` beats (keeps opening + closing). */
function stepsOf(pattern: PatternName, max: number): readonly StepName[] {
  const steps = PATTERNS[pattern];
  if (steps.length <= max) return steps;
  return [steps[0], steps[steps.length - 1]];
}

// ---------------------------------------------------------------------------
// generateTimeline
// ---------------------------------------------------------------------------

export const generateTimeline: GenerateTimeline = async (a, b, score, lens, opts) => {
  const cons = LENS_CONSTRAINTS[lens];
  const rng = mulberry32(hashSeed(opts.seed, 'approach-b', a.id, b.id, lens));
  const shared = sharedTags(a, b);
  const frictionTerm: TermName = score.friction?.term ?? (lens === 'business' ? 'reliability' : 'commonGround');
  const frictionDomain = FRICTION_DOMAINS[lens][frictionTerm];

  // -- 1. timing skeleton ---------------------------------------------------
  const horizon = randInt(rng, cons.yearSpan[0], cons.yearSpan[1]);
  const dYear = lens === 'friendship' ? null : sampleDissolutionYear(rng, score.sim, horizon);
  const lastYear = dYear ?? horizon;

  // -- 2. mandatory friction arc -------------------------------------------
  const fPattern = weightedPick(rng, frictionPatternWeights(score));
  const fOutcome = weightedPick(rng, frictionOutcomeWeights(score));
  const fBeats: BeatPlan[] = [];
  if (lens === 'friendship') {
    const clashY = randInt(rng, 2, Math.max(2, horizon - 1));
    fBeats.push({ year: clashY, step: 'clash' });
    fBeats.push({ year: clampYear(clashY + 1, horizon), step: 'repair' });
  } else if (dYear !== null) {
    if (dYear >= 5) {
      const early = hazardYearPick(rng, 2, dYear - 3);
      fBeats.push({ year: early, step: 'clash' });
      fBeats.push({ year: early + 1, step: 'repair' });
    }
    fBeats.push({ year: dYear - 1, step: 'clash', special: 'unravel' });
    fBeats.push({ year: dYear, step: 'clash', special: 'dissolution' });
    fBeats.push({ year: dYear + 1, step: 'repair', special: 'epilogue' });
  } else {
    const clashY = hazardYearPick(rng, 2, Math.min(8, lastYear));
    const isStress = fPattern === 'stress-test';
    fBeats.push({ year: clashY, step: isStress ? 'pressure' : 'clash' });
    fBeats.push({ year: clampYear(clashY + 1, lastYear), step: isStress ? 'proof' : 'repair' });
    if (fOutcome === 'strengthens') fBeats.push({ year: clampYear(clashY + 2, lastYear), step: 'settle' });
  }
  const frictionArc: ArcPlan = {
    id: 'arc-friction', role: 'friction', sourceTerm: frictionTerm,
    label: `Where it grinds — ${TERM_LABELS[frictionTerm]}`,
    pattern: fPattern, domain: frictionDomain, outcome: fOutcome,
    beats: fBeats, hintTerm: frictionTerm,
  };

  // -- 3. warm driver arcs (score-conditioned pattern × domain × outcome) ---
  const warmExcluded = new Set<string>([frictionDomain]);
  if (lens === 'romantic') { warmExcluded.add('kids'); warmExcluded.add('conflict-recovery'); }
  if (lens === 'business') { warmExcluded.add('exit'); warmExcluded.add('decision-rights'); }
  if (lens === 'friendship') warmExcluded.add('distance-texture');

  const warmArcs: ArcPlan[] = [];
  for (let i = 0; i < 2; i++) {
    let pattern = weightedPick(rng, warmPatternWeights(score, shared.length));
    let domain: string;
    if (lens === 'business' && i === 0 && !warmExcluded.has('product')) {
      domain = 'product'; // venture formation always anchors the business story
      if (pattern !== 'spark' && pattern !== 'slow-build') pattern = 'slow-build';
    } else {
      domain = weightedPick(rng, warmDomainWeights(lens, score, warmExcluded));
    }
    warmExcluded.add(domain);
    const outcome = weightedPick(rng, outcomeWeights(score));
    const maxBeats = i === 0 ? 3 : 2;
    const steps = stepsOf(pattern, maxBeats);
    const anchors = lens === 'friendship'
      ? (i === 0 ? [1, Math.ceil(horizon / 2), horizon] : [2, horizon - 2])
      : (i === 0 ? [1, 3, 5] : [2, 6]);
    const years = warmYears(rng, steps.length, anchors, lastYear);
    warmArcs.push({
      id: `arc-warm-${i + 1}`, role: 'driver',
      sourceTerm: score.drivers[i]?.term ?? score.drivers[0]?.term ?? null,
      label: DOMAIN_LABELS[domain] ?? `The ${domain} thread`,
      pattern, domain, outcome,
      beats: steps.map((step, j) => ({ year: years[j], step })),
    });
  }

  // -- 4. gated extras ------------------------------------------------------
  const extras: ArcPlan[] = [];

  // Kid arc — romantic only; hard gate + survival-conditioned window (S11, §5.2).
  if (lens === 'romantic' && kidEventAllowed(a, b, lens, opts, true)) {
    const maxKid = Math.min(8, dYear !== null ? dYear - 1 : horizon - 1);
    if (maxKid >= 3) {
      const kidYear = randInt(rng, 3, maxKid);
      extras.push({
        id: 'arc-kid', role: 'texture', sourceTerm: 'eligibility',
        label: DOMAIN_LABELS.kids, pattern: 'leap', domain: 'kids', outcome: 'strengthens',
        beats: [{ year: kidYear, step: 'payoff', special: 'kid' }],
      });
    }
  }

  // bothHighAgency flag arc (rom/biz) — decision-rights collision.
  const agencyP = score.flags.bothHighAgency;
  if (lens !== 'friendship' && agencyP !== undefined && agencyP >= 0.25 && frictionTerm !== 'agency') {
    const domain = lens === 'business' ? 'decision-rights' : 'home';
    if (domain !== frictionDomain) {
      const y = clampYear(lens === 'business' ? 2 : 3, lastYear);
      extras.push({
        id: 'arc-agency', role: 'flag', sourceTerm: 'agency',
        label: 'Two hands on the wheel', pattern: 'grind-repair', domain, outcome: 'strengthens',
        beats: [{ year: y, step: 'clash' }, { year: clampYear(y + 1, lastYear), step: 'repair' }],
        flag: 'bothHighAgency',
      });
    }
  }

  // pursueWithdraw flag arc (romantic only).
  if (lens === 'romantic' && score.flags.pursueWithdraw !== undefined && frictionDomain !== 'conflict-recovery') {
    const y = clampYear(4, lastYear);
    extras.push({
      id: 'arc-space', role: 'flag', sourceTerm: 'distance',
      label: 'Space and return', pattern: 'grind-repair', domain: 'conflict-recovery', outcome: 'lingers',
      beats: [{ year: y, step: 'clash' }, { year: clampYear(y + 1, lastYear), step: 'repair' }],
      flag: 'pursueWithdraw',
    });
  }

  // Business exit beat per declared exitHorizon — only when the venture survives.
  const avgExit = lens === 'business' && a.gates.business && b.gates.business
    ? (a.gates.business.exitHorizon + b.gates.business.exitHorizon) / 2
    : 1;
  if (lens === 'business' && dYear === null) {
    extras.push({
      id: 'arc-exit', role: 'texture', sourceTerm: 'eligibility',
      label: DOMAIN_LABELS.exit, pattern: 'leap', domain: 'exit', outcome: 'strengthens',
      beats: [{ year: horizon, step: 'decide', special: 'exit' }],
    });
  }

  // Friendship long-quiet arc — the Distance max() inversion made visible.
  if (lens === 'friendship' && frictionTerm !== 'distance' && frictionTerm !== 'regulation') {
    const isDriver = score.drivers.some((d) => d.term === 'distance');
    const y = randInt(rng, 2, Math.max(2, horizon - 1));
    extras.push({
      id: 'arc-distance', role: isDriver ? 'driver' : 'texture', sourceTerm: 'distance',
      label: DOMAIN_LABELS['distance-texture'], pattern: 'grind-repair',
      domain: 'distance-texture', outcome: 'strengthens',
      beats: [{ year: y, step: 'clash' }, { year: clampYear(y + 1, horizon), step: 'repair' }],
      hintTerm: 'distance',
    });
  }

  // Quiet-stretch beat — the post-peak hazard decline for surviving pairs.
  const quietArc: ArcPlan | null = lens !== 'friendship' && dYear === null && horizon >= (lens === 'business' ? 9 : 10)
    ? {
        id: 'arc-quiet', role: 'texture', sourceTerm: null,
        label: 'The quiet stretch', pattern: 'spark',
        domain: lens === 'business' ? 'work-rhythm' : 'ritual', outcome: 'strengthens',
        beats: [{ year: horizon - 1, step: 'settle', special: 'quiet' }],
      }
    : null;

  // -- 5. the LLM-nominated bonus arc, code-verified ------------------------
  const space = grammarSpace(lens);
  const nomineePool = [frictionArc, ...warmArcs, ...extras];
  let bonusArc: ArcPlan | null = null;
  const nomRes = await nominate(a, b, score, lens, space, opts);
  const verdict = verifyTriggerClaim(
    nomRes.nomination, score, lens, space,
    nomineePool.map((p) => ({ pattern: p.pattern, domain: p.domain })),
  );
  if (verdict.admitted) {
    const pattern = nomRes.nomination.pattern as PatternName;
    const steps = stepsOf(pattern, 2);
    const y0 = clampYear(randInt(rng, 2, Math.max(2, lastYear - 1)), lastYear);
    bonusArc = {
      id: 'arc-bonus', role: 'bonus', sourceTerm: verdict.sourceTerm,
      label: `Off the map — ${DOMAIN_LABELS[nomRes.nomination.domain] ?? nomRes.nomination.domain}`,
      pattern, domain: nomRes.nomination.domain,
      outcome: nomRes.nomination.outcome as OutcomeName,
      beats: steps.map((step, j) => ({ year: clampYear(y0 + j, lastYear), step })),
      hintTerm: verdict.claimKind === 'friction' ? verdict.sourceTerm ?? undefined : undefined,
    };
  }

  // -- 6. event budget by priority ------------------------------------------
  const priorityOrder: Array<ArcPlan | null> = lens === 'friendship'
    ? [frictionArc, warmArcs[0], warmArcs[1], bonusArc, ...extras]
    : [frictionArc, warmArcs[0], warmArcs[1], ...extras, bonusArc, quietArc];
  const kept: ArcPlan[] = [];
  let total = 0;
  for (const p of priorityOrder) {
    if (p === null) continue;
    if (p === frictionArc || total + p.beats.length <= cons.maxEvents) {
      kept.push(p);
      total += p.beats.length;
    }
  }

  // -- 7. chronological realization with threaded world state ----------------
  const flat = kept
    .flatMap((arc) => arc.beats.map((bp) => ({ arc, bp })))
    .map((e, idx) => ({ ...e, idx }))
    .sort((x, y) => x.bp.year - y.bp.year || x.idx - y.idx);

  const realizeRng = mulberry32(hashSeed(opts.seed, 'approach-b/realize', a.id, b.id, lens));
  const venture = deriveVentureName(a, b, shared);
  let state = initialState();
  for (const { arc, bp } of flat) {
    const ctx: RealizeCtx = {
      a, b, lens, state, shared, rng: realizeRng, score, venture, avgExit, frictionDomain,
    };
    const r = bp.special
      ? realizeSpecial(ctx, bp.special)
      : arc.flag
        ? realizeFlag(ctx, arc.flag, bp.step === 'clash' || bp.step === 'pressure' ? 'clash' : 'repair')
        : arc.hintTerm && (bp.step === 'clash' || bp.step === 'pressure' || bp.step === 'repair' || bp.step === 'proof')
          ? realizeFriction(ctx, arc.hintTerm, bp.step === 'clash' || bp.step === 'pressure' ? 'clash' : 'repair')
          : realizeWarm(ctx, arc.domain, bp.step, arc.outcome);
    bp.realized = { year: bp.year, kind: r.kind, domain: arc.domain, hint: r.hint, delta: r.delta };
    state = applyDelta(state, r.delta, bp.year);
  }

  // -- 8. narration (live gateway or deterministic mock) ---------------------
  const beats = flat.map(({ bp }) => bp.realized as Beat);
  // The structure is decided and deterministic at this point; only the prose
  // still costs a round trip. Publish the skeleton before narrating so the demo
  // can draw the full timeline instantly and fill sentences in as they land.
  try {
    opts.onStructure?.(beats);
  } catch { /* a broken renderer is not a generation failure */ }
  const narrated = await narrate(beats, [a, b], lens, opts);
  const events = beats.map((beat, i) => ({
    year: beat.year,
    arcId: flat[i].arc.id,
    kind: beat.kind,
    domain: beat.domain,
    text: narrated.texts[i],
  }));

  const arcs: Arc[] = kept.map((p) => ({
    id: p.id, role: p.role, sourceTerm: p.sourceTerm, label: p.label,
    beats: p.beats.map((bp) => bp.realized as Beat),
  }));

  const meta: TimelineMeta = {
    approach: 'b',
    seed: opts.seed,
    narration: narrated.narration,
    canonicity: 'seeded',
    degraded: isDegradedPair(a, b),
    ...(narrated.model !== undefined ? { model: narrated.model } : {}),
    ...(narrated.petGuardReplacements !== undefined ? { petGuardReplacements: narrated.petGuardReplacements } : {}),
    ...(narrated.mockFallbacks !== undefined ? { mockFallbacks: narrated.mockFallbacks } : {}),
  };
  const personA = { id: a.id, name: a.name };
  const personB = { id: b.id, name: b.name };

  // Friendship variant STRUCTURALLY lacks horizon/dissolution/epilogue (PILLARS §6.1).
  if (lens === 'friendship') {
    return { lens: 'friendship', personA, personB, arcs, events, meta };
  }
  const epilogueText = dYear !== null
    ? events.find((e) => e.kind === 'epilogue')?.text ?? null
    : null;
  const common = {
    personA, personB, arcs, events, meta,
    horizonYears: horizon,
    dissolution: dYear !== null ? { year: dYear, arcId: 'arc-friction' } : null,
    epilogue: epilogueText,
  };
  return lens === 'romantic'
    ? { lens: 'romantic', ...common }
    : { lens: 'business', ...common };
};
