/**
 * The participant aggregate (docs/domain.md §2, §3, D4, D6).
 *
 * `Participant` is the subject's own full view. `RoomMember` is the ONLY shape
 * another participant may ever see -- exactly `id`, `name`, `photoUrl`, pinned
 * by a type-level test (docs/domain.md §5). `SessionToken` is a branded string
 * that is deliberately NOT a field of `Participant`: the credential lives in
 * `participant_sessions` (D4), so no select, relation or serialiser can leak it.
 */

/** Ids are uuids (D7); aliased for readability, not branded. */
export type ParticipantId = string;
export type RoomId = string;

/**
 * The session credential. Branded so it cannot be passed where a plain id is
 * expected, and never a property of `Participant` (D4).
 */
export type SessionToken = string & { readonly __brand: "SessionToken" };

/** Per-lens consent. Romantic is opt-OUT by default (CONTEXT.md §7.3). */
export interface Consent {
  romantic: boolean;
  business: boolean;
  friendship: boolean;
}

/** Nobody is opted in by a default. */
export const DEFAULT_CONSENT: Consent = {
  romantic: false,
  business: false,
  friendship: false,
};

/** Declared values are stored as the band that was tapped, never as a float (D6). */
export type DeclaredBand = 0 | 1 | 2 | 3;

/**
 * The declared round: six bands, the tag picks and the capped acquaintance
 * list. A band is null until the screen that asks for it is answered.
 */
export interface DeclaredProfile {
  moneyPosture: DeclaredBand | null;
  rootedness: DeclaredBand | null;
  familyGravity: DeclaredBand | null;
  capacityHoursBand: DeclaredBand | null;
  distanceBand: DeclaredBand | null;
  chronotype: DeclaredBand | null;
  tags: string[];
  /** At most 5 (docs/domain.md §3); the cap is enforced in the use case. */
  acquaintances: ParticipantId[];
}

/** What `create()` is given. Consent, photo and declared values come later. */
export interface NewParticipant {
  roomId: RoomId;
  name: string;
  team?: string | null;
  track?: string | null;
}

/** The subject's own full view. Never returned for anybody else. */
export interface Participant {
  id: ParticipantId;
  roomId: RoomId;
  name: string;
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consent: Consent;
  declared: DeclaredProfile;
  declaredAt: Date | null;
  quizCompletedAt: Date | null;
  createdAt: Date;
}

/**
 * What other participants may see of one another -- and nothing else.
 * Widening this type fails `tsc` (docs/domain.md §5, AC-8).
 */
export interface RoomMember {
  id: ParticipantId;
  name: string;
  photoUrl: string | null;
}

/** The six bands the declared round asks for; all six or nothing (§0). */
export const DECLARED_BAND_KEYS = [
  "moneyPosture",
  "rootedness",
  "familyGravity",
  "capacityHoursBand",
  "distanceBand",
  "chronotype",
] as const;

/** The top of every declared band; `bandToUnit` divides by it. */
export const MAX_DECLARED_BAND = 3;

/**
 * Strip a participant down to what a room view may render.
 *
 * Written as an explicit literal rather than a rest-destructure: a new column
 * on `Participant` then cannot arrive here by accident, and the type-level test
 * in participant.test.ts pins the other direction.
 */
export function toRoomMember(participant: Participant): RoomMember {
  return {
    id: participant.id,
    name: participant.name,
    photoUrl: participant.photoUrl,
  };
}

/** True only when all six declared bands are present. */
export function isDeclaredComplete(declared: DeclaredProfile): boolean {
  return DECLARED_BAND_KEYS.every((key) => declared[key] !== null);
}

/** band / 3 -- the D6 map from the tapped band to the engine's 0..1 float. */
export function bandToUnit(band: DeclaredBand): number {
  return band / MAX_DECLARED_BAND;
}
