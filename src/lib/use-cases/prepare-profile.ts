/**
 * `prepareProfile(personId, viewerId, lens, deps)` — one other person, as this
 * viewer is allowed to see them (issue #10, screen 1d).
 *
 * It returns `PersonProfile | null` and therefore structurally satisfies
 * `ProfilePort.byId` (`ports/profile.ts`).
 *
 * It reuses `prepareResults`' machinery rather than duplicating it: rank the
 * viewer's room under the lens, find the entry whose id is `personId`, project.
 * `standing` is the SAME `position` / `band` / `bond` / `friction` that rank
 * entry carries — never a parallel computation, which would drift from the
 * `/rank` board it is supposed to agree with.
 *
 * ONE `null` for every unreachable reason, and that is the safety property:
 * no such person, below the §0 floor, gate-failed, not consented to this lens,
 * `personId === viewerId`, or the viewer themself unranked all return the same
 * value. The port's docblock states the four 404s are identical BECAUSE the
 * port makes them identical; a distinguishable failure — a different null-ish
 * shape, a partial profile, a thrown error, a different latency class — hands
 * the caller the fact that this person exists and opted out, which is the
 * disclosure the floor exists to prevent.
 *
 * `tags` are the INTERSECTION of the two participants' tags, computed here, so
 * the screen cannot present the other person's private interests as common
 * ground.
 */
import type { Lens } from "../domain/participant";
import type { PersonProfile } from "../domain/reveal/profile";
import type { ViewerId } from "../domain/reveal/rank";
import type { PrepareResultsDeps } from "./prepare-results";
import { rankSubjectRoom } from "./prepare-results";

/** The same dependencies `prepareResults` takes — it is the machinery reused. */
export type PrepareProfileDeps = PrepareResultsDeps;

export async function prepareProfile(
  personId: string,
  viewerId: ViewerId,
  lens: Lens,
  deps: PrepareProfileDeps
): Promise<PersonProfile | null> {
  // "That is you", answered before anything is read. `rankRoom` never returns
  // the subject, so this branch only makes the cheapest case cheap; it costs
  // one comparison rather than a query precisely so it is not observable as a
  // different latency class.
  if (personId === viewerId) return null;

  const { room, rows } = await rankSubjectRoom(viewerId, lens, deps);
  // The VIEWER is not consented or below the floor: nobody is visible to them
  // at all, and the reason is theirs rather than this person's.
  if (room.status !== "ranked") return null;

  // Absent from the entries covers "no such person", "below the §0 floor",
  // "gate-failed against the viewer" and "did not consent to this lens" in one
  // branch, because the ranking already collapsed them into one absence.
  const entry = room.entries.find((ranked) => ranked.id === personId);
  if (entry === undefined) return null;

  const person = rows.get(personId);
  const viewer = rows.get(viewerId);
  if (person === undefined || viewer === undefined) return null;

  // The intersection, computed HERE: what crosses the port is the tags the two
  // SHARE, and the rest of this person's list never leaves the server.
  const viewerTags = new Set(viewer.participant.declared.tags);
  const shared = person.participant.declared.tags.filter((tag) =>
    viewerTags.has(tag)
  );

  return {
    id: person.participant.id,
    name: person.participant.name,
    photoUrl: person.participant.photoUrl,
    team: person.participant.team,
    tags: shared,
    // The SAME row the board renders, carried across rather than recomputed:
    // a parallel computation is what would let /rank and /profile drift.
    standing: {
      position: entry.position,
      band: entry.band,
      bond: entry.bond,
      friction: entry.friction,
    },
  };
}
