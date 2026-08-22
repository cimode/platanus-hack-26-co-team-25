import type { SimulatedLife } from "../domain/reveal/timeline";
import type { Lens } from "../domain/room/layout";

/**
 * The read contract `/simulate/[id]` reaches its data through.
 *
 * `null` is the single answer for "no such person", "not in this viewer's
 * ranked set under this lens", "below the floor", "gate-failed" and "that is
 * you" alike -- one value, five causes, so the page renders `notFound()`
 * without ever learning which one it was and the 404s stay byte-identical
 * (AC-SIM-2). A richer error type here would be the leak.
 *
 * Every signature names the viewer and there is no `forRoom(roomId, lens)`:
 * a simulation is unaddressable without saying whose it is, which makes
 * `CONTEXT.md` §3 a compile-time property rather than a convention.
 *
 * Async because the real adapter narrates through `LlmPort` -- root
 * `timeline/` measures ~33s live -- while the fixture resolves immediately.
 */
export interface TimelinePort {
  simulate(input: {
    /**
     * The viewer, from the cookie resolver. NEVER the URL segment.
     *
     * Typed `string` rather than `ViewerId` only because that alias ships in
     * `domain/reveal/rank.ts` with work unit U1, which is a sibling branch;
     * `ViewerId` IS `string`, so tightening this to it is a one-line follow-up
     * once both units are on `main`.
     */
    subjectId: string;
    /** The other person, from the URL segment. */
    otherId: string;
    lens: Lens;
  }): Promise<SimulatedLife | null>;
}
