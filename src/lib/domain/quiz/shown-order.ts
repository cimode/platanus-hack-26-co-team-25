/**
 * shown-order.ts — the per-participant option shuffle.
 *
 * Normative sources:
 *   docs/domain.md  D10 shuffled per participant per block, recorded
 *   AUDIT.md        minor: a fixed form repeating one quadruple becomes readable
 *
 * Every block presents the same four pillars in the same slot order — `a` is the
 * reliability option in block 1, `b` the regulation one, and so on. Rendered
 * unshuffled fifteen times, that mapping is learnable: a participant who works
 * out "the second card is always the dramatic one" is answering a different
 * instrument from one who does not. Shuffling breaks it; recording the shuffle
 * keeps position bias analysable afterwards.
 *
 * Deterministic on purpose. `quiz-progress` recomputes the order for a block the
 * participant has already seen, and it must match what was stored — so the
 * shuffle is a pure function of `(participantId, position)`, never a clock and
 * never `Math.random`.
 *
 * Contract: pure TypeScript, zero runtime dependencies, no Math.random, no Date.
 */

import { OPTION_KEYS } from "./instrument.ts";
import type { OptionKey } from "./response.ts";
import { mulberry32, seedFrom, shuffled } from "./rng.ts";

/**
 * The order block `position` is rendered in for `participantId`, e.g. `"cbad"`.
 *
 * Fisher–Yates over a copy of `OPTION_KEYS`; unbiased, and every one of the 24
 * permutations is reachable.
 */
export function shownOrderFor(participantId: string, position: number): string {
  const random = mulberry32(seedFrom(`${participantId}:${position}`));
  const keys: OptionKey[] = shuffled(OPTION_KEYS, random);
  return keys.join("");
}
