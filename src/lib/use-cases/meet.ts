/**
 * The meet loop's three use cases: propose, respond, read the inbox.
 *
 * AUTHORISATION RUNS THROUGH THE VIEWER'S OWN RANKING, exactly the way
 * `simulatePair` does it. You may ask to meet someone only if they are an entry
 * in YOUR ranking under the lens you are asking through — which already folds
 * in the §0 floor, both consents, the lens gates and "that is you". Nothing
 * here re-derives those rules; re-deriving them is how two surfaces drift.
 *
 * The refusal is a single `false` for every cause, for the same reason
 * `prepareProfile` returns a single `null`: a caller who can tell "not
 * consented" from "no such person" can enumerate the room.
 */
import type { MeetInbox, MeetPlaceId, MeetTimeId } from "../domain/meet/meet";
import { isMeetPlace, isMeetTime } from "../domain/meet/meet";
import type { Lens } from "../domain/participant";
import type { MeetRepository } from "../ports/meet-repository";
import type { PrepareResultsDeps } from "./prepare-results";
import { rankSubjectRoom } from "./prepare-results";

export interface MeetDeps extends PrepareResultsDeps {
  meets: MeetRepository;
}

export interface ProposeMeetInput {
  viewerId: string;
  otherId: string;
  lens: Lens;
  place: unknown;
  time: unknown;
}

/**
 * Ask one person to meet.
 *
 * `place` and `time` arrive as `unknown` on purpose: a Server Action is a
 * public HTTP endpoint reachable without ever rendering the form, so the two
 * closed sets are checked HERE rather than trusted from the select elements
 * that happen to produce them.
 */
export async function proposeMeet(
  input: ProposeMeetInput,
  deps: MeetDeps
): Promise<boolean> {
  const { viewerId, otherId, lens } = input;

  if (otherId === viewerId) return false;
  if (!(isMeetPlace(input.place) && isMeetTime(input.time))) return false;

  // The same gate `/simulate` uses. If they are not in your ranking under this
  // lens, there is nothing to ask about.
  const { room } = await rankSubjectRoom(viewerId, lens, deps);
  if (room.status !== "ranked") return false;
  if (!room.entries.some((entry) => entry.id === otherId)) return false;

  await deps.meets.propose({
    lens,
    fromParticipant: viewerId,
    toParticipant: otherId,
    place: input.place as MeetPlaceId,
    time: input.time as MeetTimeId,
  });

  return true;
}

/**
 * Accept or decline.
 *
 * No ranking read at all, and that is correct rather than an oversight: the
 * request already exists and is addressed to this viewer, so the question
 * "may they answer it" is answered by the row itself. The repository puts the
 * recipient id in the WHERE clause, so a request belonging to someone else
 * matches nothing.
 */
export async function respondToMeet(
  requestId: string,
  viewerId: string,
  accept: boolean,
  deps: Pick<MeetDeps, "meets">
): Promise<boolean> {
  return deps.meets.respond(
    requestId,
    viewerId,
    accept ? "accepted" : "declined"
  );
}

/** Everything `/encuentros` renders for one viewer, in one call. */
export async function meetInbox(
  viewerId: string,
  deps: Pick<MeetDeps, "meets">
): Promise<MeetInbox> {
  const [received, sent] = await Promise.all([
    deps.meets.received(viewerId),
    deps.meets.sent(viewerId),
  ]);
  return { received, sent };
}
