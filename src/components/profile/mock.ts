import { mockBio } from "@/components/profile/bio";
import type { RankCandidate } from "@/components/rank/mock";
import { TAGS } from "@/lib/domain/participant/tags";
import type { PersonProfile } from "@/lib/domain/reveal/profile";
import type { RankedRoom } from "@/lib/domain/reveal/rank";

/**
 * Fixture data for screen 1d.
 *
 * MOCK, with the same expiry as the ranking's: **issue #10's `ProfilePort.byId`
 * deletes this file.** Colocated with the screen that paints it for the same
 * reason (R10) -- a fixture behind a port looks like a swap that has already
 * been designed.
 *
 * It takes the `RankedRoom` screen 1c already built rather than re-ranking.
 * That is the load-bearing decision here: `standing` is where this person sits
 * in THIS viewer's ranking, so deriving it a second way -- a second hash, a
 * second band rule -- would let the ranking and the profile drift apart about
 * the same pair. One source, one answer.
 */

/**
 * FNV-1a. Third copy in this codebase (`domain/room/layout.ts` places sprites
 * with it, `components/rank/mock.ts` orders with it) and deliberately so: two
 * of the three are fixtures that #10 deletes, and exporting it from a shared
 * module would outlive them.
 */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** How many interests one person carries. Five of thirty, so overlap is real but not guaranteed. */
const TAG_WINDOW = 5;

/**
 * The interests a person is pretending to have declared.
 *
 * A contiguous WINDOW over `TAGS`, not five independent picks. Independent
 * picks make almost every pair overlap somewhere, and AC-PROF-3's "nothing in
 * common yet" state would then have no subject in the whole roster -- a
 * designed empty state nobody could ever see is a designed empty state nobody
 * maintains.
 *
 * Exported because the fixture's own test needs to compute the intersection
 * INDEPENDENTLY. A test that re-derived this hash would only prove two copies
 * agree; comparing against the shared vocabulary proves the property.
 */
export function mockTagsFor(id: string): readonly string[] {
  const start = hash(`tags:${id}`) % TAGS.length;
  return Array.from(
    { length: TAG_WINDOW },
    (_, i) => TAGS[(start + i) % TAGS.length]
  );
}

/**
 * What screen 1d paints: the shared contract plus the one thing the contract
 * does not carry.
 *
 * `bio` is NOT on `PersonProfile` and must not become so. Issue #10 produces a
 * ranking, not prose; the bio comes from an AI step over intake's declared data
 * and has its own source. Composing them here -- a view type beside the screen
 * -- is the same rule R9/R13 settled: contract if someone else implements it,
 * otherwise view.
 */
export interface ProfileView extends PersonProfile {
  readonly bio: string;
}

/**
 * One person, as this viewer is allowed to see them.
 *
 * Every suppression cause returns the SAME `null`: unknown id, the viewer
 * themselves, and anyone absent from the viewer's ranking under this lens. The
 * caller renders one `notFound()` and cannot leak which it was -- if the four
 * causes were distinguishable, the 404 becomes an oracle for who is in the room
 * (AC-PROF-2).
 */
export function mockProfile(
  personId: string,
  room: RankedRoom,
  candidates: readonly RankCandidate[]
): ProfileView | null {
  if (room.status !== "ranked") return null;
  if (personId === room.viewer.id) return null;

  const entry = room.entries.find((candidate) => candidate.id === personId);
  const source = candidates.find((candidate) => candidate.id === personId);
  if (!(entry && source)) return null;

  // Intersected HERE, in the fixture, never in the component. The screen must
  // not be able to present the other person's private interests as common
  // ground even by accident, and the way to guarantee that is to never send
  // them (AC-PROF-3).
  const mine = new Set(mockTagsFor(room.viewer.id));
  const theirs = mockTagsFor(personId);
  const shared = theirs.filter((tag) => mine.has(tag));

  return {
    // Written from THEIR tags, not the shared ones: a bio is a person
    // describing themselves, and trimming it to what you happen to have in
    // common would be describing them as a function of you.
    bio: mockBio(personId, theirs),
    id: entry.id,
    name: entry.name,
    photoUrl: entry.photoUrl,
    team: source.team ?? null,
    tags: shared,
    standing: {
      position: entry.position,
      band: entry.band,
      bond: entry.bond,
      friction: entry.friction,
    },
  };
}
