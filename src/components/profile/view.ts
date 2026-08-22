/**
 * One other person, as the viewer is allowed to see them (screen 1d).
 *
 * There is no `PersonProfile` without a viewer: `standing` is where this person
 * sits in THIS viewer's rank under THIS lens, which is why `ProfilePort.byId`
 * takes the viewer and why an unranked person is `null` rather than a profile
 * with an empty standing.
 */
import type { RankBand, RankReason } from "@/components/rank/view";

export interface PersonProfile {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly team: string | null;
  /**
   * The tags this person SHARES with the viewer -- already intersected in the
   * adapter, so the screen cannot accidentally present the other person's
   * private interests as common ground (AC-PROF-3).
   *
   * Closed-vocabulary slugs from `domain/participant/tags.ts` (30 of them).
   * Free text would make the engine's Jaccard kernel compare "cafe" with
   * "café" and score two coffee people as strangers.
   */
  readonly tags: readonly string[];
  /**
   * Deliberately the SAME vocabulary as `RankEntry`, not a parallel copy: the
   * pill on `/rank` and the pill on `/profile` must be the same two bands and
   * the same named reasons, or they drift.
   */
  readonly standing: {
    /** 1-based place in the viewer's rank. Never rendered as "3rd best". */
    readonly position: number;
    readonly band: RankBand;
    readonly bond: RankReason;
    readonly friction: RankReason | null;
  };
}
