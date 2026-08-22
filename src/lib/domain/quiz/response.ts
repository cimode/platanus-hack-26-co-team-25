/**
 * One answered block (docs/domain.md §3 `quiz_responses`, D10).
 *
 * A participant answers a block once; re-answering through the back affordance
 * is an update, not a second row. `shownOrder` records the per-participant
 * shuffle so position bias stays analysable.
 */
export type OptionKey = "a" | "b" | "c" | "d";

export interface BlockResponse {
  participantId: string;
  /** 1..15. */
  position: number;
  mostKey: OptionKey;
  /** null under the single-pick fallback; never equal to `mostKey`. */
  leastKey: OptionKey | null;
  /** A permutation of "abcd", e.g. "cbad". */
  shownOrder: string;
  answeredAt: Date;
}

/** The keys a block offers, and the alphabet `shownOrder` permutes. */
const KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

/** Positions run 1..15 -- the fixed balanced form (PILLARS.md §7.2). */
const MIN_POSITION = 1;
const MAX_POSITION = 15;

function isOptionKey(value: string): value is OptionKey {
  return (KEYS as readonly string[]).includes(value);
}

/**
 * most !== least, keys in a..d, position 1..15, `shownOrder` a permutation of
 * "abcd". Throws naming the field that failed.
 *
 * Applied by the adapter before the write as well as by the use case, so a
 * response the database's check constraints would reject never reaches a batch
 * that also carries the completion timestamp (docs/domain.md §7).
 */
export function validateResponse(response: BlockResponse): void {
  const { position, mostKey, leastKey, shownOrder } = response;

  if (
    !Number.isInteger(position) ||
    position < MIN_POSITION ||
    position > MAX_POSITION
  ) {
    throw new Error(
      `response: position must be ${MIN_POSITION}..${MAX_POSITION}, got ${position}`
    );
  }
  if (!isOptionKey(mostKey)) {
    throw new Error(
      `response ${position}: mostKey must be a..d, got "${mostKey}"`
    );
  }
  if (leastKey !== null && !isOptionKey(leastKey)) {
    throw new Error(
      `response ${position}: leastKey must be a..d or null, got "${leastKey}"`
    );
  }
  if (leastKey !== null && leastKey === mostKey) {
    throw new Error(
      `response ${position}: leastKey may not equal mostKey ("${mostKey}")`
    );
  }

  const shown = [...shownOrder].sort().join("");
  if (shownOrder.length !== KEYS.length || shown !== KEYS.join("")) {
    throw new Error(
      `response ${position}: shownOrder must be a permutation of "abcd", got "${shownOrder}"`
    );
  }
}
