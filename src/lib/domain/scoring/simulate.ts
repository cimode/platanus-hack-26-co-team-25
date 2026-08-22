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
import { assignmentsFor } from "../quiz/assignments.ts";
import type { Block, Pillar } from "../quiz/instrument.ts";
import { OPTION_KEYS, PILLARS, validateBlock } from "../quiz/instrument.ts";
import type { BlockResponse, OptionKey } from "../quiz/response.ts";
import { mulberry32, seedFrom, shuffled } from "../quiz/rng.ts";
import type { BlockItems } from "./items.ts";

// The quiz domain already owns the seeded PRNG; re-exported so the scoring
// tests draw from the same one rather than a second copy of the algorithm.
export { mulberry32 };

/**
 * A structurally valid 15-block form for one participant, with a per-person
 * key↔pillar layout — what D16 actually serves.
 *
 * Everything the measurement depends on is fixed across people: 15 positions,
 * the 4/4/4/3 focus rotation from `assignmentsFor`, four pillars once each,
 * exactly one reversed option and it sits on the focus pillar. What varies is
 * which option KEY carries which pillar — precisely the thing that makes
 * scoring someone against another person's form wrong, and the reason
 * `estimateLatents` takes `items` rather than defaulting to a constant.
 *
 * Scenario and option text are placeholders: the likelihood never reads them.
 * Each block goes through the real `validateBlock`, so a form the app would
 * reject cannot quietly become a passing test fixture.
 */
export function structuralBlocksFor(participantId: string): Block[] {
  const random = mulberry32(seedFrom(`scoring-sim:${participantId}`));
  return assignmentsFor(participantId).map((assignment) => {
    const layout = shuffled(PILLARS, random);
    const block: Block = {
      position: assignment.position,
      batch: assignment.batch,
      focusPillar: assignment.focusPillar,
      domain: assignment.domain,
      scenario: `simulated block ${assignment.position}`,
      options: OPTION_KEYS.map((key, i) => ({
        key,
        text: `option ${key}`,
        pillar: layout[i],
        keyed:
          layout[i] === assignment.focusPillar
            ? ("reversed" as const)
            : ("positive" as const),
      })),
    };
    validateBlock(block);
    return block;
  });
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
