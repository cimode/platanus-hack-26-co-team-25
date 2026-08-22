/**
 * The floor, stated once (docs/domain.md §0, AUDIT.md S15).
 *
 * A participant is rankable under a lens only when ALL of: `photoUrl` is not
 * null, `consent[lens]`, `declaredAt` is not null, and -- for romantic and
 * business -- the lens gate row exists. Anyone below it is suppressed with a
 * reason, never ranked. `byRoomForRanking(roomId, lens)` applies this inside
 * the repository, so no caller can ever hold a below-floor row (§5).
 */
import type { BusinessGate, Lens, RomanticGate } from "./gates";
import type { Participant, ParticipantId } from "./participant";

/** Why a participant is below the floor. */
export type FloorReason =
  | "no-photo"
  | "no-consent"
  | "declared-incomplete"
  | "no-gate";

/** A participant plus everything a ranking read needs, gates included. */
export interface RankableParticipant {
  participant: Participant;
  romanticGate?: RomanticGate;
  businessGate?: BusinessGate;
  acquaintances: ParticipantId[];
}

/** Which gate row a lens requires; friendship asks for none (D5). */
function gateFor(
  p: RankableParticipant,
  lens: Lens
): RomanticGate | BusinessGate | undefined | "not-asked" {
  if (lens === "romantic") return p.romanticGate;
  if (lens === "business") return p.businessGate;
  return "not-asked";
}

/**
 * The first rule the participant fails under `lens`, or null when rankable.
 *
 * The order is the order the flow asks in -- photo, consent, declared round,
 * lens gates (§0) -- so the reason a screen shows is the step to go back to.
 */
export function floorReason(
  p: RankableParticipant,
  lens: Lens
): FloorReason | null {
  const { participant } = p;
  if (participant.photoUrl === null) return "no-photo";
  if (!participant.consent[lens]) return "no-consent";
  if (participant.declaredAt === null) return "declared-incomplete";
  if (gateFor(p, lens) === undefined) return "no-gate";
  return null;
}

/** `floorReason(p, lens) === null`, said the way callers read it. */
export function meetsFloor(p: RankableParticipant, lens: Lens): boolean {
  return floorReason(p, lens) === null;
}
