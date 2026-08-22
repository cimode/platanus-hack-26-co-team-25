/**
 * The rank read model: what a viewer is allowed to see of their own room.
 *
 * `reveal/` is the read side of `matching/` -- the engine's own word for it
 * (AUDIT.md S15, "excluded from the reveal entirely"). `RankEntry` is not
 * `RankedEntry`: the engine's `rank` and `sim` floats stop in the adapter and
 * only a 1-based `position` and a two-value `band` cross the port (D3). What
 * the type cannot carry, no serialiser, no RSC payload and no dev-tools
 * inspection can leak.
 */
import type { Lens } from "../room/layout";

/** Whose reveal this is. Opaque: the cookie today, a session token later. */
export type ViewerId = string;

/**
 * No `low`. The design has two pills, so the type must not admit a third:
 * eligible-but-low pairs are ABSENT from `entries`, exactly like below-floor
 * people, because a greyed third band discloses who was excluded.
 */
export type RankBand = "high" | "mid";

/** A named engine term. Never its weight, score, contribution or shortfall. */
export interface RankReason {
  /** Engine `TermName`. Stable, never rendered. */
  readonly term: string;
  /** Spanish, user-facing. */
  readonly label: string;
}

export interface RankEntry {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  /** 1-based place in THIS viewer's rank. Discloses no score. */
  readonly position: number;
  readonly band: RankBand;
  readonly bond: RankReason;
  readonly friction: RankReason | null;
}

/**
 * Suppressed people are ABSENT from `entries`, never present-and-greyed: a
 * greyed row discloses the opt-out.
 *
 * The status union exists from day one because the real adapter
 * (`prepareResults`, issue #10) reports `"ranked" | "not-consented" |
 * "below-floor"`. A flat array would leave it nowhere to put that, and the
 * swap would have to edit the screen (D2).
 */
export type RankedRoom =
  | {
      readonly status: "ranked";
      readonly lens: Lens;
      readonly viewer: { readonly id: ViewerId; readonly name: string };
      readonly entries: readonly RankEntry[];
    }
  | { readonly status: "not-consented"; readonly lens: Lens }
  | { readonly status: "below-floor"; readonly lens: Lens };

/**
 * `RankSort` and `applyRankView` deliberately do NOT live here.
 *
 * This module is the CONTRACT: the shapes issue #10's `prepareResults`
 * returns and screen 1c paints. Sorting and filtering a row the server already
 * sent is a view concern with no second implementer, so it sits beside the
 * board that calls it, in `src/components/rank/view.ts`. Same for the chip's
 * colour map (`components/simulate/event-tag.ts`) and the fixture
 * (`components/rank/mock.ts`) -- none of them is a contract, and none of them
 * should be recreated here.
 */
