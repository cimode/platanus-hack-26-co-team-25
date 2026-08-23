/**
 * grammar.ts — approach B's compositional arc grammar (AUDIT F2, the flagship).
 *
 * An arc = PATTERN × DOMAIN × OUTCOME × TIMING:
 *   patterns — 6 beat-shapes shared across lenses (each a fixed step sequence)
 *   domains  — the per-lens domain vocabulary (LENS_CONSTRAINTS[lens].domains)
 *   outcomes — 3 ways an arc can land
 *   timing   — arc windows placed by the sampler; rom/biz windows follow the
 *              RESEARCH §5.1 hazard shape (rises → peak yr 4–8 → decline)
 *
 * Sampling probabilities are CONDITIONED on the PairScore:
 *   - the friction pillar boosts the friction patterns and owns its domain
 *     (FRICTION_DOMAINS — every TermName maps to a concrete stage for the grind)
 *   - drivers boost the warm domains they evidence (DRIVER_DOMAINS, scaled by
 *     each driver's actual w_rank contribution)
 *   - outcome weights follow w_sim (quality drives how arcs land)
 *
 * Zero-dep, erasable-types, fully deterministic given an rng.
 */

import type { GrammarSpace, Lens, PairScore, TermName } from "./shared.ts";
import { LENS_CONSTRAINTS } from "./shared.ts";

// ---------------------------------------------------------------------------
// Patterns × outcomes
// ---------------------------------------------------------------------------

export type PatternName =
  | "spark"
  | "slow-build"
  | "grind-repair"
  | "leap"
  | "ritual"
  | "stress-test";
export type OutcomeName = "strengthens" | "lingers" | "redirects";
export type StepName =
  | "begin"
  | "settle" // spark: something starts, then becomes how they operate
  | "seed"
  | "progress"
  | "payoff" // slow-build: intent → practice → payoff
  | "clash"
  | "repair" // grind-repair: friction surfaces, then a repair
  | "decide"
  | "aftermath" // leap: one decisive call, then its settling
  | "start"
  | "defend" // ritual: a tradition starts, then survives a hard year
  | "pressure"
  | "proof"; // stress-test: outside pressure, then the hold

export const PATTERNS: Record<PatternName, readonly StepName[]> = {
  spark: ["begin", "settle"],
  "slow-build": ["seed", "progress", "payoff"],
  "grind-repair": ["clash", "repair"],
  leap: ["decide", "aftermath"],
  ritual: ["start", "defend"],
  "stress-test": ["pressure", "proof"],
};

export const PATTERN_NAMES = Object.keys(
  PATTERNS
) as unknown as readonly PatternName[];
export const OUTCOMES: readonly OutcomeName[] = [
  "strengthens",
  "lingers",
  "redirects",
];

/** Patterns the friction pillar boosts (grind is the default honest shape). */
export const FRICTION_PATTERNS: readonly PatternName[] = [
  "grind-repair",
  "stress-test",
];
/** Patterns warm (driver/texture) arcs sample from. */
export const WARM_PATTERNS: readonly PatternName[] = [
  "spark",
  "slow-build",
  "ritual",
  "leap",
];

// ---------------------------------------------------------------------------
// Score → domain conditioning tables
// ---------------------------------------------------------------------------

/**
 * Which warm domains each pillar term evidences, per lens. A driver's actual
 * w_rank contribution scales the boost, so "what you two share" literally
 * shapes where the good years happen.
 */
export const DRIVER_DOMAINS: Record<
  Lens,
  Partial<Record<TermName, readonly string[]>>
> = {
  romantic: {
    lifeShape: ["home", "work-balance", "relocation"],
    commonGround: ["travel", "craft", "ritual", "pets"],
    structural: ["home", "ritual"],
    regulation: ["conflict-recovery"],
    distance: ["travel", "ritual"],
    politeness: ["ritual", "home"],
    eligibility: ["home"],
    reliability: ["craft", "work-balance"],
  },
  business: {
    structural: ["product", "work-rhythm"],
    lifeShape: ["work-rhythm", "runway"],
    reliability: ["runway", "first-client"],
    commonGround: ["product", "work-rhythm"],
    eligibility: ["runway"],
    politeness: ["hiring", "work-rhythm"],
    regulation: ["pivot", "runway"],
    agency: ["decision-rights"],
  },
  friendship: {
    structural: ["reunion", "project"],
    commonGround: ["hobby", "media", "food"],
    lifeShape: ["ritual", "trip"],
    distance: ["distance-texture"],
    politeness: ["food", "ritual"],
    reliability: ["project", "ritual"],
    regulation: ["distance-texture"],
    agency: ["project"],
  },
};

/**
 * Where each pillar's FRICTION plays out, per lens — the stage for the
 * mandatory honesty arc. Total coverage: every TermName maps in every lens.
 */
export const FRICTION_DOMAINS: Record<Lens, Record<TermName, string>> = {
  romantic: {
    regulation: "conflict-recovery",
    politeness: "conflict-recovery",
    reliability: "work-balance",
    agency: "home",
    distance: "conflict-recovery",
    lifeShape: "work-balance",
    commonGround: "ritual",
    structural: "home",
    eligibility: "home",
  },
  business: {
    regulation: "pivot",
    politeness: "hiring",
    reliability: "runway", // follow-through under boredom → the runway notices
    agency: "decision-rights",
    distance: "work-rhythm",
    lifeShape: "work-rhythm", // capacity gap — the canonical resentment engine (PILLARS §4 inv.3)
    commonGround: "product",
    structural: "work-rhythm",
    eligibility: "exit",
  },
  friendship: {
    regulation: "distance-texture",
    politeness: "food",
    reliability: "project",
    agency: "project",
    distance: "distance-texture",
    lifeShape: "ritual", // capacity/chronotype mismatch → scheduling grind
    commonGround: "hobby",
    structural: "reunion", // no shared team/track → proximity must be manufactured
    eligibility: "ritual",
  },
};

/** Short noun for "the <X> gap" in wind-down prose, per domain. */
export const FRICTION_GAP_NOUN: Record<string, string> = {
  "work-balance": "hours",
  "conflict-recovery": "recovery-rhythm",
  home: "day-to-day",
  ritual: "shared-time",
  relocation: "geography",
  travel: "pace",
  pets: "care",
  kids: "timing",
  craft: "practice",
  "work-rhythm": "rhythm",
  runway: "follow-through",
  "decision-rights": "decision",
  product: "product-vision",
  hiring: "team",
  pivot: "direction",
  exit: "timing",
  "first-client": "traction",
  reunion: "calendar",
  hobby: "overlap",
  food: "taste",
  media: "canon",
  project: "momentum",
  "distance-texture": "silence",
  trip: "pace",
};

/** Human labels for warm/bonus arcs, per domain (user-facing, safety-scanned). */
export const DOMAIN_LABELS: Record<string, string> = {
  home: "Making home",
  relocation: "The city question",
  travel: "Out the door",
  pets: "The small roommate",
  kids: "The kid year",
  ritual: "Standing ritual",
  craft: "The shared craft",
  "work-balance": "Hours and us",
  "conflict-recovery": "The way back",
  runway: "Runway math",
  "first-client": "First yes",
  "decision-rights": "Decision rights",
  hiring: "First hire",
  product: "The build",
  pivot: "The turn",
  exit: "The horizon",
  "work-rhythm": "Operating rhythm",
  trip: "The trip",
  hobby: "The obsession",
  food: "The rotation",
  media: "The canon",
  project: "The side project",
  reunion: "The gathering problem",
  "distance-texture": "The long quiet",
};

// ---------------------------------------------------------------------------
// Grammar space handed to the LLM nominator (approach B's bonus arc)
// ---------------------------------------------------------------------------

/** Domains the nominator may NOT self-select: kid events are hard-gated and
 *  exit timing is keyed to declared exitHorizon — both are code's call. */
const NOMINATION_EXCLUDED: Record<Lens, readonly string[]> = {
  romantic: ["kids"],
  business: ["exit"],
  friendship: [],
};

export function grammarSpace(lens: Lens): GrammarSpace {
  return {
    patterns: PATTERN_NAMES,
    domains: LENS_CONSTRAINTS[lens].domains.filter(
      (d) => !NOMINATION_EXCLUDED[lens].includes(d)
    ),
    outcomes: OUTCOMES,
  };
}

// ---------------------------------------------------------------------------
// Score-conditioned sampling weights
// ---------------------------------------------------------------------------

const SIM_CEILING = 0.7; // w_sim blends rarely exceed ~0.7 (see shared.ts hazard constants)

export function simNorm(score: PairScore): number {
  return Math.min(1, Math.max(0, score.sim) / SIM_CEILING);
}

/** Deterministic weighted pick — entries iterated in the given fixed order. */
export function weightedPick<T>(
  rng: () => number,
  entries: ReadonlyArray<readonly [T, number]>
): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0][0];
  let roll = rng() * total;
  for (const [v, w] of entries) {
    roll -= Math.max(0, w);
    if (roll <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** Warm-pattern weights: quality favors the slow build; shared tags favor ritual. */
export function warmPatternWeights(
  score: PairScore,
  sharedCount: number
): Array<[PatternName, number]> {
  const q = simNorm(score);
  return [
    ["spark", 1],
    ["slow-build", 1 + 1.5 * q],
    ["ritual", 0.8 + 0.3 * Math.min(4, sharedCount)],
    ["leap", 0.7],
  ];
}

/** Friction-pattern weights: the worse the shortfall, the more it grinds. */
export function frictionPatternWeights(
  score: PairScore
): Array<[PatternName, number]> {
  const shortfall = score.friction?.shortfall ?? 0.05;
  return [
    ["grind-repair", 1 + shortfall * 6],
    ["stress-test", 0.6],
  ];
}

/** Outcome weights: w_sim (quality) decides how arcs tend to land. */
export function outcomeWeights(score: PairScore): Array<[OutcomeName, number]> {
  const q = simNorm(score);
  return [
    ["strengthens", 0.5 + q],
    ["lingers", 0.5 + (1 - q)],
    ["redirects", 0.45],
  ];
}

/** Friction-arc outcome: biased to "lingers" unless quality is genuinely high. */
export function frictionOutcomeWeights(
  score: PairScore
): Array<[OutcomeName, number]> {
  const q = simNorm(score);
  return [
    ["lingers", 1 + (1 - q)],
    ["strengthens", 0.4 + 0.8 * q],
    ["redirects", 0.4],
  ];
}

/**
 * Warm-domain weights: a floor for every lens domain (degraded pairs still
 * sample everything) plus a boost per top-3 driver, scaled by its actual
 * w_rank contribution.
 */
export function warmDomainWeights(
  lens: Lens,
  score: PairScore,
  exclude: ReadonlySet<string>
): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const d of LENS_CONSTRAINTS[lens].domains) {
    if (exclude.has(d)) continue;
    let w = 0.35;
    for (const dr of score.drivers) {
      const doms = DRIVER_DOMAINS[lens][dr.term];
      if (doms?.includes(d)) w += Math.max(0, dr.contribution) * 8;
    }
    out.push([d, w]);
  }
  return out;
}
