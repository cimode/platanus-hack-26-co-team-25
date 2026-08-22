/**
 * estimate.ts — 15 block responses in, one posterior per pillar out (issue #7).
 *
 * Honest label (`AUDIT.md` S8): **Bayesian MAP scoring of a Thurstonian choice
 * model with fixed, authored item parameters.** The parameters are not
 * calibrated — see `items.ts`. What ships is the logit (Luce) form of that
 * model, which is what `SCORER_VERSION` says and what the literature on
 * most-least designs actually uses; the probit is approximated through the
 * standard scaling constant rather than integrating orthant probabilities for
 * a 4-way choice.
 *
 * ## The model
 *
 * A respondent carries θ ∈ R⁴, one coordinate per pillar, prior θ ~ N(0, I).
 * Option j of a block is worth `u_j = a·s_j·θ_{pillar(j)} + c_j` to them, and
 * they pick by Luce:
 *
 *     P(most = m)            = softmax(u)_m
 *     P(least = l | most)    = softmax(−u restricted to j ≠ m)_l
 *
 * The "least" pick is the same choice rule run on negated utility over what is
 * left — the standard most-least (MaxDiff) explosion, and the reason a block
 * answered both ways carries more information than one answered "most" only.
 *
 * ## Why MAP is enough here
 *
 * −log P is a log-sum-exp of terms linear in θ, so it is **convex**; adding the
 * Gaussian prior makes the objective **strictly** convex. There is therefore
 * exactly one optimum, no local minima, no initialization sensitivity and no
 * randomness — Newton with a backtracking line search finds it in a handful of
 * iterations and the same responses always score to the same object, which is
 * what `scoring.test.ts` AC-1 pins.
 *
 * The posterior SE comes from the Laplace approximation: `seTheta` is the root
 * of the diagonal of the inverse Hessian at the optimum. Each block adds a PSD
 * term to that Hessian, so **more answered blocks can only narrow the posterior**
 * (AC-4), and a block answered most+least can only be narrower than the same
 * block answered most-only (AC-5). Those two ACs hold by construction, not by
 * luck.
 *
 * ## What the identification actually depends on
 *
 * With every option positively keyed, `u_j = a·θ_{pillar(j)} + c`, and softmax
 * is invariant to a constant added to every utility. Adding δ to all four
 * coordinates of θ shifts every option in every block by the same a·δ, leaving
 * the likelihood untouched: the **sum** direction is invisible to the data and
 * the prior alone decides it, pinning Σθ to 0. Only contrasts survive. That is
 * `AUDIT.md` F1 stated as algebra rather than as a simulation result, and AC-3
 * checks exactly it. One reversed-keyed option per block breaks the invariance,
 * because that option moves by −a·δ while the others move by +a·δ.
 *
 * ## Measured precision
 *
 * Reported by `scoring.test.ts` AC-2 over 200 simulated respondents, and by
 * `npm run scoring:report`. Read it with the caveat that matters: the
 * respondents are simulated FROM this model with THESE parameters, so recovery
 * measures whether the arithmetic inverts its own generative model. It is not
 * evidence about real people, and it must never be quoted as if it were.
 *
 * ## A scale mismatch worth knowing about
 *
 * `Person.latents[p]` carries `mean` and `se` on the [0,1] scale, and the band
 * cuts sit at .40/.60. But Φ(θ) for θ ~ N(0, 1) is *exactly* Uniform(0, 1), so
 * the population SD of `mean` is 1/√12 = .289 — and `engine.ts`'s
 * `DEFAULT_SE = 0.45` is therefore LARGER than the entire spread of the scale
 * it is applied to. At se = .45 a perfectly mid person scores P(low) = .41,
 * P(mid) = .18, P(high) = .41: the bands stop discriminating. That number reads
 * like `PILLARS.md` A4's "SE ≈ .45", which is a *standardized latent* figure —
 * a θ-scale quantity applied on the probability scale.
 *
 * It does not bite today: `DEFAULT_SE` is only the fallback for a latent stored
 * without an `se`, and this estimator always writes one. Flagged rather than
 * changed, because the fix belongs with whoever re-runs A4's simulations.
 *
 * Zero runtime dependencies, no clock, no randomness.
 */
import { normCdf } from "../matching/engine.ts";
import type { Pillar } from "../quiz/instrument.ts";
import { BLOCK_COUNT, PILLARS } from "../quiz/instrument.ts";
import type { BlockResponse, OptionKey } from "../quiz/response.ts";
import type { BlockItems } from "./items.ts";
import { ITEM_PARAMETERS } from "./items.ts";

/** Scorer identity stored beside every estimate, so a re-score is detectable. */
export const SCORER_VERSION = "map-luce-v1";

/** AC-8: a bounded theta is what keeps `mean` inside [0,1] and `se` positive. */
export const THETA_LIMIT = 4;

/**
 * Floor on the reported `se`, on the [0,1] scale. A tail guard, nothing more.
 *
 * Measured over 800 estimates from 200 simulated respondents, the unfloored
 * `φ(θ)·seTheta` runs: min .0125, p05 .038, median .100, max .163. So the
 * delta-method transform does NOT collapse in practice — |θ| stays around 2 —
 * and a floor set anywhere near the median would not be a floor, it would be a
 * constant overwriting a real measurement. .04 binds on roughly the lowest 5%,
 * where θ is most extreme and the Gaussian-on-[0,1] approximation is least
 * trustworthy, and leaves every other estimate exactly as measured.
 *
 * What it encodes is model misspecification, not sampling noise: the Laplace SE
 * is the uncertainty of θ *given that the authored item parameters are right*,
 * and they are not calibrated (`items.ts`). It is deliberately explicit rather
 * than folded into the likelihood.
 *
 * NOTE for whoever tunes the engine: a median se near .10 is what delivers
 * `PILLARS.md` A4's "2–3 distinguishable bands per latent". `engine.ts`'s
 * `DEFAULT_SE = 0.45` cannot — see this module's header note on the scale
 * mismatch.
 */
export const SE_FLOOR = 0.04;

/** One pillar's posterior, on both the latent and the [0,1] scale. */
export interface ScoredLatent {
  /** Posterior mode on the standardized latent scale. */
  theta: number;
  /** Laplace posterior SE of `theta`. */
  seTheta: number;
  /** Φ(theta) — what `Person.latents[p].mean` consumes. */
  mean: number;
  /** φ(theta)·seTheta, floored — what `Person.latents[p].se` consumes. */
  se: number;
}

export interface LatentEstimates {
  scorerVersion: string;
  estimates: Record<Pillar, ScoredLatent>;
}

/** Standard-normal density — the delta-method factor carrying seTheta to [0,1]. */
function phi(theta: number): number {
  return Math.exp((-theta * theta) / 2) / Math.sqrt(2 * Math.PI);
}

const KEY_INDEX: Record<OptionKey, number> = { a: 0, b: 1, c: 2, d: 3 };
const PILLAR_INDEX: Record<Pillar, number> = {
  regulation: 0,
  politeness: 1,
  reliability: 2,
  agency: 3,
};
const DIM = 4;

/**
 * Reject a response set before any of it is scored, naming the offending
 * position — a half-scored participant is worse than an unscored one.
 */
function validateResponseSet(responses: readonly BlockResponse[]): void {
  const seen = new Set<number>();
  for (const r of responses) {
    if (
      !Number.isInteger(r.position) ||
      r.position < 1 ||
      r.position > BLOCK_COUNT
    ) {
      throw new Error(
        `scoring: position must be 1..${BLOCK_COUNT}, got ${r.position}`
      );
    }
    if (seen.has(r.position)) {
      throw new Error(`scoring: duplicate response for position ${r.position}`);
    }
    seen.add(r.position);
    if (r.leastKey !== null && r.leastKey === r.mostKey) {
      throw new Error(
        `scoring: position ${r.position} has leastKey equal to mostKey ("${r.mostKey}")`
      );
    }
  }
}

/** softmax over the given indices of `u`, written into `p` (zero elsewhere). */
function softmaxInto(
  u: readonly number[],
  members: readonly number[],
  p: number[]
): void {
  let max = Number.NEGATIVE_INFINITY;
  for (const j of members) if (u[j] > max) max = u[j];
  let total = 0;
  for (const j of members) {
    const e = Math.exp(u[j] - max);
    p[j] = e;
    total += e;
  }
  for (const j of members) p[j] /= total;
}

/** 4x4 inverse by Gauss-Jordan with partial pivoting. H is SPD, so this is safe. */
function invert4(m: readonly number[][]): number[][] {
  const a = m.map((row, i) => [
    ...row,
    ...Array.from({ length: DIM }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < DIM; col++) {
    let pivot = col;
    for (let r = col + 1; r < DIM; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }
    const d = a[col][col];
    for (let c = col; c < 2 * DIM; c++) a[col][c] /= d;
    for (let r = 0; r < DIM; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let c = col; c < 2 * DIM; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row) => row.slice(DIM));
}

interface Term {
  /** Option index → (pillar index, coefficient on that pillar). */
  pillarOf: number[];
  coef: number[];
  intercept: number[];
  /** Options in play for the "most" pick. */
  members: number[];
  most: number;
  /** Options in play for the "least" pick, or null when unanswered. */
  leastMembers: number[] | null;
  least: number;
}

/** Objective, gradient and Hessian of the negative log posterior at theta. */
function evaluate(
  theta: readonly number[],
  terms: readonly Term[]
): { f: number; g: number[]; h: number[][] } {
  // Prior N(0, I).
  let f = 0;
  const g = new Array<number>(DIM).fill(0);
  const h: number[][] = Array.from({ length: DIM }, (_, i) =>
    Array.from({ length: DIM }, (_, j) => (i === j ? 1 : 0))
  );
  for (let k = 0; k < DIM; k++) {
    f += 0.5 * theta[k] * theta[k];
    g[k] += theta[k];
  }

  const u = new Array<number>(4).fill(0);
  const p = new Array<number>(4).fill(0);

  for (const t of terms) {
    for (let j = 0; j < 4; j++) {
      u[j] = t.coef[j] * theta[t.pillarOf[j]] + t.intercept[j];
    }

    // --- "most": pick m from all four ------------------------------------
    p.fill(0);
    softmaxInto(u, t.members, p);
    f -= Math.log(Math.max(p[t.most], Number.MIN_VALUE));
    for (const j of t.members) {
      const w = (j === t.most ? 1 : 0) - p[j];
      g[t.pillarOf[j]] -= w * t.coef[j];
    }
    for (const j of t.members) {
      for (const k of t.members) {
        const cov = (j === k ? p[j] : 0) - p[j] * p[k];
        h[t.pillarOf[j]][t.pillarOf[k]] += t.coef[j] * cov * t.coef[k];
      }
    }

    // --- "least": pick l from the rest, on negated utility ----------------
    if (t.leastMembers === null) continue;
    const v = u.map((x) => -x);
    p.fill(0);
    softmaxInto(v, t.leastMembers, p);
    f -= Math.log(Math.max(p[t.least], Number.MIN_VALUE));
    for (const j of t.leastMembers) {
      const w = (j === t.least ? 1 : 0) - p[j];
      // d v_j / d theta = -coef_j
      g[t.pillarOf[j]] += w * t.coef[j];
    }
    for (const j of t.leastMembers) {
      for (const k of t.leastMembers) {
        const cov = (j === k ? p[j] : 0) - p[j] * p[k];
        h[t.pillarOf[j]][t.pillarOf[k]] += t.coef[j] * cov * t.coef[k];
      }
    }
  }
  return { f, g, h };
}

/**
 * Posterior mode + Laplace SE per pillar.
 *
 * `items` is injectable so the tests can score the same responses against an
 * all-positive copy of the form (AC-3). Responses may be any subset of the 15
 * blocks — a partially answered quiz scores, just less precisely (AC-4).
 */
export function estimateLatents(
  responses: readonly BlockResponse[],
  items: readonly BlockItems[] = ITEM_PARAMETERS
): LatentEstimates {
  validateResponseSet(responses);

  const byPosition = new Map(items.map((b) => [b.position, b]));
  const terms: Term[] = [];
  for (const r of responses) {
    const block = byPosition.get(r.position);
    if (block === undefined) {
      throw new Error(`scoring: no block at position ${r.position}`);
    }
    const pillarOf = block.options.map((o) => PILLAR_INDEX[o.pillar]);
    const coef = block.options.map((o) => o.discrimination * o.sign);
    const intercept = block.options.map((o) => o.intercept);
    const most = KEY_INDEX[r.mostKey];
    const members = [0, 1, 2, 3];
    const leastMembers =
      r.leastKey === null ? null : members.filter((j) => j !== most);
    terms.push({
      pillarOf,
      coef,
      intercept,
      members,
      most,
      leastMembers,
      least: r.leastKey === null ? -1 : KEY_INDEX[r.leastKey],
    });
  }

  // --- Newton with backtracking. Strictly convex ⇒ one optimum. ------------
  let theta = new Array<number>(DIM).fill(0);
  let state = evaluate(theta, terms);
  for (let iter = 0; iter < 50; iter++) {
    const step = invert4(state.h);
    const delta = new Array<number>(DIM).fill(0);
    for (let i = 0; i < DIM; i++) {
      for (let j = 0; j < DIM; j++) delta[i] += step[i][j] * state.g[j];
    }
    let magnitude = 0;
    for (const d of delta) magnitude = Math.max(magnitude, Math.abs(d));
    if (magnitude < 1e-10) break;

    let scale = 1;
    let next = theta;
    let nextState = state;
    for (let back = 0; back < 40; back++) {
      const candidate = theta.map((t, i) => t - scale * delta[i]);
      const candidateState = evaluate(candidate, terms);
      if (candidateState.f <= state.f) {
        next = candidate;
        nextState = candidateState;
        break;
      }
      scale /= 2;
    }
    if (next === theta) break; // no improving step: already at the optimum
    theta = next;
    state = nextState;
  }

  const covariance = invert4(state.h);
  const estimates = {} as Record<Pillar, ScoredLatent>;
  for (const pillar of PILLARS) {
    const k = PILLAR_INDEX[pillar];
    const bounded = Math.max(-THETA_LIMIT, Math.min(THETA_LIMIT, theta[k]));
    // The Hessian is SPD, so the diagonal is positive; guard anyway so a
    // pathological form can never emit a NaN into the ranking (AC-8).
    const variance = covariance[k][k];
    const seTheta =
      Number.isFinite(variance) && variance > 0 ? Math.sqrt(variance) : 1;
    estimates[pillar] = {
      theta: bounded,
      seTheta,
      mean: normCdf(bounded, 0, 1),
      se: Math.max(SE_FLOOR, phi(bounded) * seTheta),
    };
  }
  return { scorerVersion: SCORER_VERSION, estimates };
}
