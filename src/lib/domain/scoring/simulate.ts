/**
 * simulate.ts — synthetic respondents for the scoring property tests (issue #7).
 *
 * This is test infrastructure that ships in `domain/` because the property
 * tests are the specification: a respondent is drawn from the SAME model
 * `estimate.ts` fits, so AC-2's recovery figure measures whether the estimator
 * inverts its own generative model. That is a real and necessary check — it
 * catches sign errors, ipsativity bugs and optimizer failures — but it is not
 * evidence about real people, and `estimate.ts` says so where the number is
 * reported.
 *
 * Seeded throughout (`mulberry32`), never `Math.random`, so a failing AC
 * reproduces from its seed alone.
 */
import type { Pillar } from "../quiz/instrument.ts";
import { PILLARS } from "../quiz/instrument.ts";
import type { BlockResponse, OptionKey } from "../quiz/response.ts";
import type { BlockItems } from "./items.ts";

/** The same PRNG the timeline layer uses — 32-bit, seeded, dependency-free. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, seeded — draws a standard normal from `rng`. */
export function standardNormal(rng: () => number): number {
  const u = Math.max(rng(), Number.MIN_VALUE);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** A respondent's true trait vector, drawn from the model's prior. */
export function drawTheta(rng: () => number): Record<Pillar, number> {
  const theta = {} as Record<Pillar, number>;
  for (const pillar of PILLARS) theta[pillar] = standardNormal(rng);
  return theta;
}

const KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

/** Gumbel-max sampling: argmax over `u_j + Gumbel` IS a draw from softmax(u). */
function sampleLuce(
  utilities: readonly number[],
  members: readonly number[],
  rng: () => number
): number {
  let best = members[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const j of members) {
    const uniform = Math.max(rng(), Number.MIN_VALUE);
    const gumbel = -Math.log(-Math.log(uniform));
    const value = utilities[j] + gumbel;
    if (value > bestValue) {
      bestValue = value;
      best = j;
    }
  }
  return best;
}

export interface SimulateOptions {
  /**
   * Stamped onto every response. Required, and supplied by the caller, because
   * `scoring.test.ts` forbids this directory from touching a clock at all —
   * identical responses must never score differently twice, and the cheapest
   * way to guarantee that is to own no source of variation whatsoever.
   */
  answeredAt: Date;
  /** false → leastKey is null on every block (the single-pick fallback). */
  withLeast?: boolean;
  /** Score only the first N blocks. */
  blocks?: number;
}

/**
 * One respondent's answers to the whole form, drawn from the Luce model at
 * the given true theta.
 *
 * `shownOrder` is recorded as the identity permutation: the model carries no
 * position effect, so the shuffle would be decoration here. The column exists
 * in the schema precisely so a real room's position bias stays analysable
 * later — this simulator is not the place it gets used.
 */
export function simulateRespondent(
  theta: Record<Pillar, number>,
  items: readonly BlockItems[],
  rng: () => number,
  options: SimulateOptions
): BlockResponse[] {
  const withLeast = options.withLeast ?? true;
  const limit = options.blocks ?? items.length;
  const { answeredAt } = options;
  const responses: BlockResponse[] = [];

  for (const block of items.slice(0, limit)) {
    const utilities = block.options.map(
      (o) => o.discrimination * o.sign * theta[o.pillar] + o.intercept
    );
    const members = [0, 1, 2, 3];
    const most = sampleLuce(utilities, members, rng);
    let least: number | null = null;
    if (withLeast) {
      const rest = members.filter((j) => j !== most);
      const negated = utilities.map((u) => -u);
      least = sampleLuce(negated, rest, rng);
    }
    responses.push({
      participantId: "simulated",
      position: block.position,
      mostKey: KEYS[most],
      leastKey: least === null ? null : KEYS[least],
      shownOrder: "abcd",
      answeredAt,
    });
  }
  return responses;
}
