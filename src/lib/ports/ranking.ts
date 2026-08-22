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
 * Today `adapters/reveal/` implements this over a fixture roster and the real
 * pure `rankRoom()`; issue #10's `prepareResults` replaces it by changing one
 * line in `src/lib/composition.ts`.
 */

import type { RankedRoom, ViewerId } from "../domain/reveal/rank";
import type { Lens } from "../domain/room/layout";

export interface RankingPort {
  forSubject(subjectId: ViewerId, lens: Lens): Promise<RankedRoom>;
}
