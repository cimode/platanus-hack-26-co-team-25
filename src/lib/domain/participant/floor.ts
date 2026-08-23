/**
 * The floor, stated once (docs/domain.md §0, AUDIT.md S15).
 *
 * A participant is rankable under a lens only when ALL of: `photoUrl` is not
 * null, gender and birthdate are known, `consent[lens]`, and `declaredAt` is
 * not null. Anyone below it is suppressed with a reason, never ranked.
 * `byRoomForRanking(roomId, lens)` applies this inside the repository, so no
 * caller can ever hold a below-floor row (§5).
 *
 * D18 took the gate-row clause out: the MVP asks no gate questions at all, and
 * the engine's gate inputs are derived from `mvp-defaults.ts` instead. The
 * identity clause replaces it -- a row registered before D18 has no gender and
 * no birthdate, so it cannot be given a romantic gate and stays below the floor
 * until it re-registers.
 */
import type { BusinessGate, Lens, RomanticGate } from "./gates";
import type { Participant, ParticipantId } from "./participant";

/** Why a participant is below the floor. */
export type FloorReason =
  | "no-photo"
  | "no-identity"
  | "no-consent"
  | "declared-incomplete";

/** A participant plus everything a ranking read needs, gates included. */
export interface RankableParticipant {
  participant: Participant;
  romanticGate?: RomanticGate;
  businessGate?: BusinessGate;
  acquaintances: ParticipantId[];
}

/**
 * The first rule the participant fails under `lens`, or null when rankable.
 *
 * The order is the order the flow asks in -- registration (photo, identity)
 * then the declared round (§0 as amended by D18) -- so the reason a screen
 * shows is the step to go back to.
 */
export function floorReason(
  p: RankableParticipant,
  lens: Lens
): FloorReason | null {
  const { participant } = p;
  if (participant.photoUrl === null) return "no-photo";
  if (!participant.consent[lens]) return "no-consent";
  if (participant.gender === null || participant.birthdate === null) {
    return "no-identity";
  }
  if (participant.declaredAt === null) return "declared-incomplete";
  return null;
}

/** `floorReason(p, lens) === null`, said the way callers read it. */
export function meetsFloor(p: RankableParticipant, lens: Lens): boolean {
  return floorReason(p, lens) === null;
}
