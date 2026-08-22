/**
 * The profile read port (screen 1d).
 *
 * `null` covers "no such person", "below the §0 floor", "gate-failed" and "has
 * not consented to this lens" with ONE value, so the screen cannot tell them
 * apart and therefore cannot disclose which one it was -- the four 404s of
 * AC-PROF-2 are identical because the port makes them identical.
 *
 * There is no `byId(personId)` without a viewer: `personId` is the URL segment,
 * `viewerId` comes from the cookie resolver, and the two are different
 * arguments so no page can accidentally swap them.
 */

import type { PersonProfile } from "../domain/reveal/profile";
import type { ViewerId } from "../domain/reveal/rank";
import type { Lens } from "../domain/room/layout";

export interface ProfilePort {
  byId(
    personId: string,
    viewerId: ViewerId,
    lens: Lens
  ): Promise<PersonProfile | null>;
}
