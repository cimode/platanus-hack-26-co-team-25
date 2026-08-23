/**
 * engine.ts — Deterministic pair-compatibility scoring engine.
 *
 * Normative sources (every term cites its rule):
 *   PILLARS.md  §2 pillar term types · §3 weight tables · §4 inversions · §8 build rules
 *   AUDIT.md    S6 banded-penalty carve-out · S7 graded eligibility · S14 frozen cutoffs
 *               S15 degraded modes
 *
 * Contract: pure TypeScript, zero runtime dependencies, erasable-types-only syntax
 * (no enums / namespaces / decorators) so it runs under `node --experimental-strip-types`.
 * Determinism: no Math.random, no Date — same inputs always produce the same ranking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Lens = "romantic" | "business" | "friendship";
export type Band = "low" | "mid" | "high";
export type LatentName = "regulation" | "politeness" | "reliability" | "agency";
export type Gender = "M" | "F" | "NB";

/** Posterior for one latent. `se` defaults to 0.45 (PILLARS §1 A4 error budget). */
export interface LatentEstimate {
  mean: number; // posterior mean in [0,1]
  se?: number; // posterior SE; default DEFAULT_SE
}

/**
 * Every declared variable may be missing: the intake no longer asks the declared
 * round (docs/domain.md D20), so for most of the room none of these exist. A
 * missing one is UNMEASURED — its term scores at the neutral midpoint with the
 * weights untouched (AUDIT S15), exactly as `distanceBand` always has. It is
 * never imputed as 0, which would be a real answer at the end of the axis.
 */
export interface LifeShape {
  moneyPosture?: number; // 0..1 declared (PILLARS §2, Life Shape & Capacity)
  rootedness?: number; // 0..1 declared
  familyGravity?: number; // 0..1 declared
  capacityHoursBand?: number; // 0..3 declared retrospective hours band
}

export interface RomanticGate {
  interestedIn: Gender[];
  gender: Gender;
  single: boolean;
  ageBand: number; // 0..3
  wantsKids: boolean; // desire only — timing was cut (AUDIT S11)
}

export interface BusinessGate {
  riskPosture: number; // 0..2
  exitHorizon: number; // 0..2
  redlinesOk: boolean;
}

export interface Person {
  id: string;
  name: string;
  /** Missing latent → prior mean 0.5, se 0.6 (AUDIT S15 degraded mode). */
  latents: Partial<Record<LatentName, LatentEstimate>>;
  declared: {
    /** Re-contact latency band 0..3 (3 = stays away longest). May be missing. */
    distanceBand?: number;
    lifeShape: LifeShape;
    tags: string[]; // interests / media / food / activity / pets
    chronotype?: number; // 0..3; missing → neutral overlap (D20)
  };
  structural: {
    team?: string;
    track?: string;
    cohort?: number; // form-submission order bucket (PILLARS §2)
    acquaintances?: string[]; // capped declared list of ids
  };
  gates: {
    romantic?: RomanticGate;
    business?: BusinessGate;
  };
  consent: { romantic: boolean; business: boolean; friendship: boolean };
  hasPhoto: boolean;
}

export interface EngineOptions {
  /** Restores the business Agency .05/.10 column — the stage ablation (PILLARS §3). */
  agencyOverlay?: boolean;
}

export interface Driver {
  term: TermName;
  label: string;
  score: number; // raw term score in [0,1]
  weight: number; // w_rank weight applied
  contribution: number; // weight * score (agency: weight * (score - 1) — penalty-only, <= 0)
}

export interface Friction {
  term: TermName;
  label: string;
  score: number;
  /** weight * (1 - score): how much rank mass this term is losing the pair. */
  shortfall: number;
}

export interface PairScore {
  eligible: boolean;
  reason?: string; // gate-fail or suppress reason
  rank: number; // w_rank blend — formation (ranks the room)
  sim: number; // w_sim blend — quality (drives timeline / hazard)
  band: Band; // banded rank, frozen a-priori cutoffs (AUDIT S14)
  drivers: Driver[]; // top-3 named w_rank contributions (product surface)
  friction: Friction | null; // single worst term by weighted shortfall
  flags: { pursueWithdraw?: number; bothHighAgency?: number };
}

export interface RankedEntry extends PairScore {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Frozen constants
// ---------------------------------------------------------------------------

/**
 * Fallback SE for a latent stored with a `mean` but no `se`. NOT the
 * instrument's precision, which is what the old one-line comment here claimed.
 *
 * The real scorer (`domain/scoring`) measures a median se near **.10** on this
 * [0,1] scale, and always writes one — `latent_estimates` requires `se > 0` and
 * `estimateLatents` emits all four pillars unconditionally — so on the real
 * data path this constant is unreachable. A participant with no rows at all
 * takes the missing-latent path below instead (PRIOR_MEAN / PRIOR_SE).
 *
 * .45 is retained deliberately: as a fallback for genuinely UNKNOWN uncertainty
 * it should be near-uninformative, and it is. At se = .45 a person sitting at
 * exactly .50 scores P(low) = .41, P(mid) = .18, P(high) = .41 — the bands stop
 * sorting, which is the honest output when the SE is unknown. It would be the
 * wrong number for a measured latent, and is never used as one.
 *
 * `PILLARS.md` A4's "SE ≈ .45" is a different-scale figure: the doc states no
 * scale (`AUDIT.md` S9 notes it has no derivation anywhere), and .45 is only
 * coherent as a standardized-latent quantity — Φ(θ) for θ ~ N(0,1) is exactly
 * Uniform(0,1), so this scale's whole population SD is 1/√12 = .289. Carried
 * across by the delta method, A4's figure lands near **.18** here.
 */
export const DEFAULT_SE = 0.45;
export const PRIOR_MEAN = 0.5; // missing latent → prior (AUDIT S15)
export const PRIOR_SE = 0.6; // missing latent → wide se (AUDIT S15)

/** Band cutoffs fixed a-priori, frozen, never re-normed in-room (AUDIT S14). */
export const BAND_LOW_CUT = 0.4; // LOW < 0.40
export const BAND_HIGH_CUT = 0.6; // 0.60 <= HIGH

/** Agency anti-complementarity: fixed penalty multiplier on P(both top band) (PILLARS §7.1). */
const AGENCY_FIXED_PENALTY = 1.0;
/** pursueWithdraw fires when P(bottom-band regulation) x [partner distanceBand==3] > 0.60. */
const PURSUE_WITHDRAW_THRESHOLD = 0.6;
/** Fixed small penalty applied to romance w_sim only when pursueWithdraw fires (PILLARS §2 Distance rom). */
const PURSUE_WITHDRAW_SIM_PENALTY = 0.04;

/** Gaussian kernel sigma for romance Life Shape declared-variable similarity (PILLARS §4 inv.3). */
const LIFESHAPE_SIGMA = 0.3;
/** Steep graded penalty on |capacityHoursBand| gap in business (PILLARS §4 inv.3). */
const CAPACITY_GAP_BUSINESS = [1.0, 0.55, 0.2, 0.0];
/** Chronotype window overlap by band gap (friendship Life Shape) / adjacency (Common Ground). */
const CHRONO_OVERLAP = [1.0, 0.5, 0.0, 0.0];
/** Common Ground saturating kernel steepness: 1 - exp(-k * jaccard) (PILLARS §2). */
const TAG_KERNEL_K = 3;
const TAG_WEIGHT = 0.75; // Common Ground split: tags vs chronotype adjacency
const CHRONO_WEIGHT = 0.25;

/** Structural Proximity saturating-overlap point values (PILLARS §2, §8: team strongest). */
const STRUCT_TEAM = 1.0;
const STRUCT_TRACK = 0.6;
const STRUCT_COHORT_SAME = 0.4;
const STRUCT_COHORT_ADJ = 0.2;
const STRUCT_ACQUAINTANCE = 0.8; // positive proximity in ALL lenses

// ---------------------------------------------------------------------------
// Weight tables — copied cell by cell from PILLARS §3. Each vector sums to 1.00
// (verified by three independent auditors — AUDIT §4).
// ---------------------------------------------------------------------------

export type TermName =
  | "regulation"
  | "politeness"
  | "reliability"
  | "agency"
  | "distance"
  | "lifeShape"
  | "commonGround"
  | "structural"
  | "eligibility";

const TERM_ORDER: TermName[] = [
  "lifeShape",
  "commonGround",
  "structural",
  "regulation",
  "distance",
  "politeness",
  "eligibility",
  "reliability",
  "agency",
];

export const TERM_LABELS: Record<TermName, string> = {
  regulation: "Regulation",
  politeness: "Politeness",
  reliability: "Reliability",
  agency: "Agency",
  distance: "Distance & Re-initiation",
  lifeShape: "Life Shape & Capacity",
  commonGround: "Common Ground",
  structural: "Structural Proximity",
  eligibility: "Eligibility (graded)",
};

type WeightVector = Record<TermName, number>;

/** PILLARS §3 — exact numbers. Friendship has no Eligibility row (weight 0, AUDIT S7). */
const WEIGHTS: Record<Lens, { rank: WeightVector; sim: WeightVector }> = {
  romantic: {
    rank: {
      lifeShape: 0.22,
      commonGround: 0.21,
      structural: 0.17,
      regulation: 0.13,
      distance: 0.08,
      politeness: 0.07,
      eligibility: 0.05,
      reliability: 0.04,
      agency: 0.03,
    },
    sim: {
      lifeShape: 0.1,
      commonGround: 0.04,
      structural: 0.02,
      regulation: 0.24,
      distance: 0.14,
      politeness: 0.13,
      eligibility: 0.2,
      reliability: 0.08,
      agency: 0.05,
    },
  },
  business: {
    rank: {
      structural: 0.24,
      lifeShape: 0.22,
      reliability: 0.16,
      commonGround: 0.1,
      eligibility: 0.1,
      politeness: 0.07,
      regulation: 0.06,
      agency: 0.05,
      distance: 0.0,
    },
    sim: {
      structural: 0.02,
      lifeShape: 0.22,
      reliability: 0.28,
      commonGround: 0.05,
      eligibility: 0.06,
      politeness: 0.15,
      regulation: 0.12,
      agency: 0.1,
      distance: 0.0,
    },
  },
  friendship: {
    rank: {
      structural: 0.3,
      commonGround: 0.28,
      lifeShape: 0.25,
      distance: 0.06,
      politeness: 0.05,
      reliability: 0.03,
      regulation: 0.02,
      agency: 0.01,
      eligibility: 0.0,
    },
    sim: {
      structural: 0.11,
      commonGround: 0.21,
      lifeShape: 0.21,
      distance: 0.26,
      politeness: 0.07,
      reliability: 0.08,
      regulation: 0.04,
      agency: 0.02,
      eligibility: 0.0,
    },
  },
};

/**
 * Resolve effective weights. Business Agency is DEFAULT OFF: the .05/.10 cells go to 0
 * and the remaining vector renormalizes — the ONLY case where weights ever renormalize
 * (AUDIT S15 forbids renormalization for missing data). `agencyOverlay: true` restores
 * the published column (the stage ablation).
 */
export function getWeights(
  lens: Lens,
  opts?: EngineOptions
): { rank: WeightVector; sim: WeightVector } {
  const base = WEIGHTS[lens];
  if (lens !== "business" || opts?.agencyOverlay) return base;
  const strip = (v: WeightVector): WeightVector => {
    const out = { ...v, agency: 0 };
    const keep = 1 - v.agency;
    for (const t of TERM_ORDER) out[t] = out[t] / keep;
    return out;
  };
  return { rank: strip(base.rank), sim: strip(base.sim) };
}

/**
 * Soft-min gamma per (latent pillar, lens) — PILLARS §2 level terms.
 * Romance Regulation/Politeness/Reliability γ=0.5; business Reliability γ=1.0 (the one
 * evidenced hard min — PILLARS §2); business Regulation/Politeness keep the soft-min
 * default 0.5; friendship latent levels γ=0 (plain mean).
 */
const GAMMA: Record<
  Lens,
  Record<"regulation" | "politeness" | "reliability", number>
> = {
  romantic: { regulation: 0.5, politeness: 0.5, reliability: 0.5 },
  business: { regulation: 0.5, politeness: 0.5, reliability: 1.0 },
  friendship: { regulation: 0.0, politeness: 0.0, reliability: 0.0 },
};

/** Distance soft-min γ for romance (PILLARS §4 inversion 1). */
const DISTANCE_GAMMA_ROMANCE = 0.5;

// ---------------------------------------------------------------------------
// Math helpers — no dependencies
// ---------------------------------------------------------------------------

/** Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
    t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/** Normal CDF P(X <= x) for X ~ N(mean, sd^2). */
export function normCdf(x: number, mean: number, sd: number): number {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Soft-min level: s = mean(a,b) - γ/2·|a-b| (PILLARS §2; soft-min rationale AUDIT §4). */
function softMin(a: number, b: number, gamma: number): number {
  return (a + b) / 2 - (gamma / 2) * Math.abs(a - b);
}

/** Missing latent imputes to the population prior (AUDIT S15); missing se → 0.45. */
function resolveLatent(l: LatentEstimate | undefined): {
  mean: number;
  se: number;
} {
  if (!l) return { mean: PRIOR_MEAN, se: PRIOR_SE };
  return { mean: l.mean, se: l.se ?? DEFAULT_SE };
}

/** P(latent >= HIGH cut) via normal CDF on the posterior (AUDIT S14 frozen cutoffs). */
function pTopBand(l: { mean: number; se: number }): number {
  return 1 - normCdf(BAND_HIGH_CUT, l.mean, l.se);
}

/** P(latent < LOW cut). */
function pBottomBand(l: { mean: number; se: number }): number {
  return normCdf(BAND_LOW_CUT, l.mean, l.se);
}

/** [P(low), P(mid), P(high)] band probabilities from the posterior. */
function bandProbs(l: { mean: number; se: number }): [number, number, number] {
  const lo = pBottomBand(l);
  const hi = pTopBand(l);
  return [lo, Math.max(0, 1 - lo - hi), hi];
}

/** Band a score with the frozen a-priori cutoffs — never re-banded (AUDIT S14). */
export function bandOf(score: number): Band {
  if (score < BAND_LOW_CUT) return "low";
  if (score < BAND_HIGH_CUT) return "mid";
  return "high";
}

// ---------------------------------------------------------------------------
// Gates — multiplicative three-state {0, 1, suppress} (PILLARS §2 Eligibility Gates,
// AUDIT S15). suppress → excluded from the reveal entirely, never ranked.
// ---------------------------------------------------------------------------

type GateState =
  | { state: "pass" }
  | { state: "fail"; reason: string } // gate = 0: real pair, ineligible
  | { state: "suppress"; reason: string }; // below floor: never ranked

/** Per-person floor: photo + per-lens consent + lens gates answered (AUDIT S15/S16). */
function personFloor(p: Person, lens: Lens): GateState {
  if (!p.hasPhoto)
    return { state: "suppress", reason: `suppressed: ${p.id} has no photo` };
  if (!p.consent[lens])
    return {
      state: "suppress",
      reason: `suppressed: ${p.id} has no ${lens} consent`,
    };
  if (lens === "romantic" && !p.gates.romantic)
    return {
      state: "suppress",
      reason: `suppressed: ${p.id} answered no romantic gates`,
    };
  if (lens === "business" && !p.gates.business)
    return {
      state: "suppress",
      reason: `suppressed: ${p.id} answered no business gates`,
    };
  return { state: "pass" };
}

function evaluateGates(a: Person, b: Person, lens: Lens): GateState {
  // Floor / consent — suppress, both sides (PILLARS §8 rule 3, AUDIT S15).
  for (const p of [a, b]) {
    const floor = personFloor(p, lens);
    if (floor.state !== "pass") return floor;
  }
  if (lens === "romantic") {
    const ga = a.gates.romantic as RomanticGate;
    const gb = b.gates.romantic as RomanticGate;
    // Mutual orientation/interest match — hard gate.
    if (
      !ga.interestedIn.includes(gb.gender) ||
      !gb.interestedIn.includes(ga.gender)
    ) {
      return { state: "fail", reason: "orientation/interest not mutual" };
    }
    if (!ga.single || !gb.single)
      return { state: "fail", reason: "not both single" };
    // wantsKids desire agreement — hard gate; timing was cut (AUDIT S11).
    if (ga.wantsKids !== gb.wantsKids)
      return { state: "fail", reason: "wantsKids disagreement" };
    return { state: "pass" };
  }
  if (lens === "business") {
    const ga = a.gates.business as BusinessGate;
    const gb = b.gates.business as BusinessGate;
    if (!ga.redlinesOk || !gb.redlinesOk)
      return { state: "fail", reason: "redlines not ok" };
    if (Math.abs(ga.riskPosture - gb.riskPosture) > 1)
      return { state: "fail", reason: "riskPosture gap > 1" };
    if (Math.abs(ga.exitHorizon - gb.exitHorizon) > 1)
      return { state: "fail", reason: "exitHorizon gap > 1" };
    return { state: "pass" };
  }
  // Friendship: consent + floor only.
  return { state: "pass" };
}

// ---------------------------------------------------------------------------
// Term scores — each in [0,1]; every form cites PILLARS §2/§4
// ---------------------------------------------------------------------------

/**
 * The degraded score of any unmeasured declared term: the neutral midpoint, with
 * the weights untouched (AUDIT S15). Shared by every declared variable since D20
 * stopped asking the declared round, so a room where nobody answered it ranks on
 * the latents and the structure rather than on fabricated extremes.
 */
const NEUTRAL = 0.5;

/** Normalized, inverted re-contact score: shorter re-contact latency = better. */
function distanceScore(band: number | undefined): number {
  if (band === undefined) return NEUTRAL;
  return 1 - clamp01(band / 3);
}

/** Distance & Re-initiation — inversion 1 (PILLARS §4): soft-min (rom) / 0 (biz) / max() (fri). */
function termDistance(a: Person, b: Person, lens: Lens): number {
  const da = distanceScore(a.declared.distanceBand);
  const db = distanceScore(b.declared.distanceBand);
  if (lens === "romantic")
    return clamp01(softMin(da, db, DISTANCE_GAMMA_ROMANCE));
  if (lens === "friendship") return Math.max(da, db); // one texter is enough
  return 0; // business: weight .00 — term inert (PILLARS §3, cut on A1)
}

/**
 * Agency — anti-complementarity, PENALTY-ONLY (PILLARS §4 inversion 2, §7.1 "a penalty
 * on the high-high corner"). The term can only SUBTRACT rank/sim mass — it never adds any,
 * so low agency is never rewarded and Agency never appears as a positive driver.
 * rom/biz penalty: fixedPenalty·P(both in top band), probabilities from the posteriors.
 * fri penalty: banded gap computed as expected band-gap probability from the posteriors
 * (max gap over 3 bands = 2), NOT raw band difference — the AUDIT S6 carve-out to the
 * A4 |a-b| ban. `bothMeasured` marks whether BOTH agency posteriors are real measurements
 * (not the AUDIT S15 imputed prior) — the flag surface requires it (A10 legibility).
 */
function termAgency(
  a: Person,
  b: Person,
  lens: Lens
): { penalty: number; pBothTop: number; bothMeasured: boolean } {
  const bothMeasured =
    a.latents.agency !== undefined && b.latents.agency !== undefined;
  const la = resolveLatent(a.latents.agency);
  const lb = resolveLatent(b.latents.agency);
  const pBothTop = pTopBand(la) * pTopBand(lb);
  if (lens === "friendship") {
    const pa = bandProbs(la);
    const pb = bandProbs(lb);
    let expectedGap = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++)
        expectedGap += pa[i] * pb[j] * Math.abs(i - j);
    }
    return { penalty: clamp01(expectedGap / 2), pBothTop, bothMeasured };
  }
  return {
    penalty: clamp01(AGENCY_FIXED_PENALTY * pBothTop),
    pBothTop,
    bothMeasured,
  };
}

/**
 * Life Shape & Capacity — inversion 3 (PILLARS §4): gaussian kernel similarity on the
 * declared continuous vars (rom) / steep graded |capacity gap| penalty (biz) / capacity
 * level + chronotype window overlap (fri). Continuous kernels are legal here: the
 * continuous |a-b| ban applies to LATENTS only (PILLARS §1 A4).
 */
function termLifeShape(a: Person, b: Person, lens: Lens): number {
  const la = a.declared.lifeShape;
  const lb = b.declared.lifeShape;
  const capA = capacityUnit(la.capacityHoursBand);
  const capB = capacityUnit(lb.capacityHoursBand);
  if (lens === "romantic") {
    const pairs: Array<[number | undefined, number | undefined]> = [
      [la.moneyPosture, lb.moneyPosture],
      [la.rootedness, lb.rootedness],
      [la.familyGravity, lb.familyGravity],
      [capA, capB],
    ];
    let s = 0;
    for (const [x, y] of pairs) s += gaussianSimilarity(x, y);
    return s / pairs.length;
  }
  if (lens === "business") {
    // Unmeasured on either side: there is no gap to grade (S15).
    if (
      la.capacityHoursBand === undefined ||
      lb.capacityHoursBand === undefined
    )
      return NEUTRAL;
    const gap = Math.min(
      3,
      Math.abs(la.capacityHoursBand - lb.capacityHoursBand)
    );
    return CAPACITY_GAP_BUSINESS[gap]; // full-time vs nights-and-weekends = resentment engine
  }
  // friendship: level (plain mean, γ=0) on capacity hours + chronotype window overlap
  const level = ((capA ?? NEUTRAL) + (capB ?? NEUTRAL)) / 2;
  return 0.5 * level + 0.5 * chronoOverlap(a, b);
}

/** The 0..3 capacity band as a 0..1 level; stays absent when unmeasured. */
function capacityUnit(band: number | undefined): number | undefined {
  return band === undefined ? undefined : clamp01(band / 3);
}

/** Gaussian kernel on two 0..1 values; neutral when either side is unmeasured. */
function gaussianSimilarity(
  x: number | undefined,
  y: number | undefined
): number {
  if (x === undefined || y === undefined) return NEUTRAL;
  return Math.exp(-((x - y) ** 2) / (2 * LIFESHAPE_SIGMA ** 2));
}

/** Chronotype window overlap by band gap; neutral when either side is unmeasured. */
function chronoOverlap(a: Person, b: Person): number {
  const ca = a.declared.chronotype;
  const cb = b.declared.chronotype;
  if (ca === undefined || cb === undefined) return NEUTRAL;
  return CHRONO_OVERLAP[Math.min(3, Math.abs(ca - cb))];
}

/**
 * Common Ground — Jaccard on tags through the literal saturating kernel 1-exp(-k·j)
 * (PILLARS §2, exact contract form — no normalization), plus chronotype adjacency
 * (PILLARS §2: manufactures perceived similarity).
 */
function termCommonGround(a: Person, b: Person): number {
  const ta = new Set(a.declared.tags.map((t) => t.toLowerCase()));
  const tb = new Set(b.declared.tags.map((t) => t.toLowerCase()));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union; // degraded: no tags → 0, no renorm
  const kernel = 1 - Math.exp(-TAG_KERNEL_K * jaccard);
  return TAG_WEIGHT * kernel + CHRONO_WEIGHT * chronoOverlap(a, b);
}

/**
 * Structural Proximity — saturating overlap over same-team (strongest), same-track,
 * cohort adjacency, declared acquaintance (positive in ALL lenses) (PILLARS §2, §8).
 * Missing fields contribute 0 — the term degrades, weights never renormalize (S15).
 */
function termStructural(a: Person, b: Person): number {
  let raw = 0;
  if (
    a.structural.team !== undefined &&
    a.structural.team === b.structural.team
  )
    raw += STRUCT_TEAM;
  if (
    a.structural.track !== undefined &&
    a.structural.track === b.structural.track
  )
    raw += STRUCT_TRACK;
  if (a.structural.cohort !== undefined && b.structural.cohort !== undefined) {
    const gap = Math.abs(a.structural.cohort - b.structural.cohort);
    if (gap === 0) raw += STRUCT_COHORT_SAME;
    else if (gap === 1) raw += STRUCT_COHORT_ADJ;
  }
  const knows =
    (a.structural.acquaintances ?? []).includes(b.id) ||
    (b.structural.acquaintances ?? []).includes(a.id);
  if (knows) raw += STRUCT_ACQUAINTANCE;
  return 1 - Math.exp(-raw); // saturating overlap — nothing here rewards a difference
}

/**
 * Eligibility graded remainder (AUDIT S7: construct named here explicitly).
 * rom: ageBand proximity (desire agreement already hard-gated).
 * biz: riskPosture + exitHorizon proximity inside the gate-passing region.
 * fri: no row in PILLARS §3 — weight 0, term inert.
 */
function termEligibilityGraded(a: Person, b: Person, lens: Lens): number {
  if (lens === "romantic" && a.gates.romantic && b.gates.romantic) {
    const gap = Math.abs(a.gates.romantic.ageBand - b.gates.romantic.ageBand);
    return clamp01(1 - gap / 3);
  }
  if (lens === "business" && a.gates.business && b.gates.business) {
    const risk =
      1 -
      Math.abs(a.gates.business.riskPosture - b.gates.business.riskPosture) / 2;
    const exit =
      1 -
      Math.abs(a.gates.business.exitHorizon - b.gates.business.exitHorizon) / 2;
    return clamp01((risk + exit) / 2);
  }
  return 0;
}

/** Latent level term with the per-(pillar,lens) soft-min γ (PILLARS §2). */
function termLevel(
  a: Person,
  b: Person,
  lens: Lens,
  name: "regulation" | "politeness" | "reliability"
): number {
  const la = resolveLatent(a.latents[name]);
  const lb = resolveLatent(b.latents[name]);
  return clamp01(softMin(la.mean, lb.mean, GAMMA[lens][name]));
}

// ---------------------------------------------------------------------------
// scorePair
// ---------------------------------------------------------------------------

/** Fresh object per call — ineligible results must never share mutable drivers/flags. */
function ineligibleResult(reason: string): PairScore {
  return {
    eligible: false,
    reason,
    rank: 0,
    sim: 0,
    band: "low",
    drivers: [],
    friction: null,
    flags: {},
  };
}

export function scorePair(
  a: Person,
  b: Person,
  lens: Lens,
  opts?: EngineOptions
): PairScore {
  const gate = evaluateGates(a, b, lens);
  if (gate.state === "suppress") return ineligibleResult(gate.reason);
  if (gate.state === "fail") return ineligibleResult(`gate: ${gate.reason}`);

  const agency = termAgency(a, b, lens);
  const scores: Record<TermName, number> = {
    regulation: termLevel(a, b, lens, "regulation"),
    politeness: termLevel(a, b, lens, "politeness"),
    reliability: termLevel(a, b, lens, "reliability"),
    agency: 1 - agency.penalty, // display form; aggregated penalty-only below
    distance: termDistance(a, b, lens),
    lifeShape: termLifeShape(a, b, lens),
    commonGround: termCommonGround(a, b),
    structural: termStructural(a, b),
    eligibility: termEligibilityGraded(a, b, lens),
  };

  const w = getWeights(lens, opts);
  let rank = 0;
  let sim = 0;
  for (const t of TERM_ORDER) {
    // Agency is penalty-only (PILLARS §4 inversion 2, §7.1): its contribution is
    // w·(score − 1) = −w·penalty ≤ 0 — it can only subtract mass, never add it.
    // Every other term contributes w·score ≥ 0.
    const s = t === "agency" ? scores[t] - 1 : scores[t];
    rank += w.rank[t] * s;
    sim += w.sim[t] * s;
  }
  rank = Math.max(0, rank);
  sim = Math.max(0, sim);

  // Flags -------------------------------------------------------------------
  const flags: PairScore["flags"] = {};

  if (lens !== "friendship" && agency.bothMeasured) {
    // Probability displayed whenever both agency posteriors are MEASURED — no numeric
    // threshold (PILLARS §7.1). Imputed priors (AUDIT S15) never surface the flag: at
    // zero data the surface must not assert a dominance collision (A10 legibility).
    flags.bothHighAgency = agency.pBothTop;
  }

  if (lens === "romantic") {
    // pursueWithdraw: P(X regulation in bottom band) x [Y distanceBand == 3] > 0.60,
    // symmetric — flag + fixed small penalty in romance w_sim only (PILLARS §2 Distance rom).
    const pBotA = pBottomBand(resolveLatent(a.latents.regulation));
    const pBotB = pBottomBand(resolveLatent(b.latents.regulation));
    const fireAB = b.declared.distanceBand === 3 ? pBotA : 0;
    const fireBA = a.declared.distanceBand === 3 ? pBotB : 0;
    const fired = Math.max(fireAB, fireBA);
    if (fired > PURSUE_WITHDRAW_THRESHOLD) {
      flags.pursueWithdraw = fired;
      sim = Math.max(0, sim - PURSUE_WITHDRAW_SIM_PENALTY);
    }
  }

  // Drivers / friction — per-term weighted contributions by name, for the UI panel
  // and the LLM narrator ("what you two share" + friction point).
  const contributions = TERM_ORDER.filter((t) => w.rank[t] > 0).map((t) => ({
    term: t,
    label: TERM_LABELS[t],
    score: scores[t],
    weight: w.rank[t],
    // Agency's contribution is its (non-positive) penalty-only form.
    contribution: w.rank[t] * (t === "agency" ? scores[t] - 1 : scores[t]),
  }));

  // Agency is excluded from drivers: a penalty-only term can never "drive" a match
  // (PILLARS §7.1) — its cost still surfaces through friction below.
  const drivers = contributions
    .filter((c) => c.term !== "agency")
    .sort(
      (x, y) => y.contribution - x.contribution || (x.term < y.term ? -1 : 1)
    )
    .slice(0, 3);

  const friction =
    [...contributions]
      .map(({ term, label, score }) => ({
        term,
        label,
        score,
        shortfall: w.rank[term] * (1 - score),
      }))
      .sort(
        (x, y) => y.shortfall - x.shortfall || (x.term < y.term ? -1 : 1)
      )[0] ?? null;

  return {
    eligible: true,
    rank,
    sim,
    band: bandOf(rank),
    drivers,
    friction,
    flags,
  };
}

// ---------------------------------------------------------------------------
// rankRoom
// ---------------------------------------------------------------------------

/**
 * Score `subjectId` against every other person under `lens`; return the eligible list
 * sorted by w_rank (formation) descending, id ascending on ties (deterministic).
 * Suppressed and gate-failed pairs are excluded from the output entirely (AUDIT S15).
 */
export function rankRoom(
  people: Person[],
  subjectId: string,
  lens: Lens,
  opts?: EngineOptions
): RankedEntry[] {
  const subject = people.find((p) => p.id === subjectId);
  if (!subject) throw new Error(`unknown subject id: ${subjectId}`);
  const out: RankedEntry[] = [];
  for (const other of people) {
    if (other.id === subject.id) continue;
    const score = scorePair(subject, other, lens, opts);
    if (score.eligible) out.push({ id: other.id, name: other.name, ...score });
  }
  out.sort((x, y) => y.rank - x.rank || (x.id < y.id ? -1 : 1));
  return out;
}

/** Excluded pairs with reasons — for QA and the consent surface, never for the reveal. */
export function excludedFromRoom(
  people: Person[],
  subjectId: string,
  lens: Lens,
  opts?: EngineOptions
): Array<{ id: string; reason: string }> {
  const subject = people.find((p) => p.id === subjectId);
  if (!subject) throw new Error(`unknown subject id: ${subjectId}`);
  const out: Array<{ id: string; reason: string }> = [];
  for (const other of people) {
    if (other.id === subject.id) continue;
    const score = scorePair(subject, other, lens, opts);
    if (!score.eligible)
      out.push({ id: other.id, reason: score.reason ?? "ineligible" });
  }
  out.sort((x, y) => (x.id < y.id ? -1 : 1));
  return out;
}
