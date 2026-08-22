import type { Participant } from "../domain/participants/participant";
import { type Placement, placeInRoom } from "../domain/room/layout";
import type { ParticipantsPort } from "../ports/participants";

export interface Room {
  /** Whoever the demo is impersonating. Absent if the cookie is stale or unset. */
  readonly me: Participant | null;
  /** Everyone else, already placed on the floor, back to front. */
  readonly others: readonly Placement[];
}

/**
 * The room as one person sees it.
 *
 * You are never in your own room: the point of the screen is choosing someone
 * to connect with, and a sprite of yourself is noise you cannot act on. So the
 * impersonated participant is filtered out before placement rather than after,
 * which also keeps the grid from reserving a cell nobody stands in.
 */
export async function enterRoom(
  meId: string | undefined,
  deps: { roster: ParticipantsPort }
): Promise<Room> {
  const roster = await deps.roster.list();
  const me = roster.find((person) => person.id === meId) ?? null;
  const others = roster.filter((person) => person.id !== me?.id);

  return { me, others: placeInRoom(others) };
}
