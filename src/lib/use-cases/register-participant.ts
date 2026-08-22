import type { Participant, SessionToken } from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { RoomRepository } from "../ports/room-repository";

/**
 * Step 1 of intake (issue #6): the row and the credential are born together.
 *
 * The room arrives as a SLUG, never as an id: `?room=` is in the QR code and
 * therefore attacker-controlled, and a slug has to be resolved against the
 * `rooms` table before anything is written, which an id handed straight to an
 * insert would not be (docs/domain.md D9).
 *
 * `ParticipantRepository.create()` returns the session token beside the
 * participant rather than on it (D4); the caller writes it to the httpOnly
 * cookie and it never appears in a payload.
 */

export type RegisterParticipantReason = "room-not-found" | "invalid-name";

export class RegisterParticipantError extends Error {
  readonly reason: RegisterParticipantReason;

  constructor(reason: RegisterParticipantReason) {
    super(reason);
    this.name = "RegisterParticipantError";
    this.reason = reason;
  }
}

export interface RegisterParticipantInput {
  roomSlug: string;
  name: string;
  team?: string | null;
  track?: string | null;
}

export interface RegisterParticipantResult {
  participant: Participant;
  sessionToken: SessionToken;
}

export interface RegisterParticipantDeps {
  participants: ParticipantRepository;
  rooms: RoomRepository;
}

/** The `participants_name_length` check, in the language the screen speaks. */
const MAX_NAME = 80;

export async function registerParticipant(
  input: RegisterParticipantInput,
  deps: RegisterParticipantDeps
): Promise<RegisterParticipantResult> {
  // Trimmed here as well as in the action's zod schema: the check constraint
  // counts characters, and " " is a name the database would accept.
  const name = input.name.trim();
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new RegisterParticipantError("invalid-name");
  }

  const room = await deps.rooms.bySlug(input.roomSlug);
  if (!room) throw new RegisterParticipantError("room-not-found");

  return deps.participants.create({
    roomId: room.id,
    name,
    team: blankToNull(input.team),
    track: blankToNull(input.track),
  });
}

/** Optional fields: an empty box is "not answered", not an empty string. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
