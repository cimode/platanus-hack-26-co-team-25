/**
 * The ranking read port (screen 1c).
 *
 * Every signature names the viewer and there is deliberately NO
 * `forRoom(roomId, lens)`: a rank is unaddressable without saying whose it is,
 * which turns "a ranking is visible only to the person who ran it"
 * (CONTEXT.md §3, docs/testing.md) into a compile-time property instead of a
 * convention a future caller can forget. Pages take the viewer from the cookie
 * resolver, never from the URL.
 *
 * Nothing implements this yet. Issue #10's `prepareResults` is written to
 * satisfy it structurally -- that is the whole reason the interface exists
 * before its implementation, and why the shapes it names are not ours to move.
 *
 * Screen 1c paints `RankedRoom` from `src/components/rank/mock.ts` in the
 * meantime. That mock is deliberately NOT an adapter behind this port: a
 * fixture with a port in front of it looks like a swap that has already been
 * designed, when the real swap is #10 landing and one line naming it in
 * `src/lib/composition.ts`. Deleting a colocated mock is deleting one file.
 */

import type { RankedRoom, ViewerId } from "../domain/reveal/rank";
import type { Lens } from "../domain/room/layout";

export interface RankingPort {
  forSubject(subjectId: ViewerId, lens: Lens): Promise<RankedRoom>;
}
