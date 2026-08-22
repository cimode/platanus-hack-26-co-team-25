/**
 * The pure half of screen 1c.
 *
 * The shapes this operates on are the CONTRACT and live in
 * `@/lib/domain/reveal/rank` -- issue #10's `prepareResults` returns them, so
 * they are not ours to move. What IS ours is what the board does with a row
 * the server already sent: pick an order, pick a band. That has no second
 * implementer and no port, so it sits next to the component that calls it.
 */
import type { RankBand, RankEntry } from "@/lib/domain/reveal/rank";

/** The two orders the screen offers. Nothing here is a score. */
export type RankSort = "position" | "name";

/**
 * Accent- and case-insensitive, Spanish. A code-unit comparison puts "Á"
 * (U+00C1) after "B", which misfiles most of a Spanish roster; `sensitivity:
 * "base"` folds the diacritic away and leaves genuine ties to the sort's
 * stability. Built once -- constructing a collator per comparison is the
 * expensive part.
 */
const NAME_ORDER = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Filter to a band, order by one of two keys. Keeping it pure is what lets
 * `<RankBoard>` be a client island holding two pieces of state and no logic
 * (AC-RANK-4).
 *
 * Never mutates `entries` -- the server rendered from that same array -- and
 * always returns a fresh one. `position` is NOT renumbered by filtering: it is
 * this viewer's rank, not an index into the visible row.
 */
export function applyRankView(
  entries: readonly RankEntry[],
  view: { sort: RankSort; band: RankBand | "all" }
): readonly RankEntry[] {
  const kept =
    view.band === "all"
      ? [...entries]
      : entries.filter((entry) => entry.band === view.band);

  // `Array.prototype.sort` has been stable since ES2019, so equal keys keep
  // the caller's order rather than the engine's.
  return view.sort === "name"
    ? kept.sort((a, b) => NAME_ORDER.compare(a.name, b.name))
    : kept.sort((a, b) => a.position - b.position);
}
