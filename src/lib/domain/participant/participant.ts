/**
 * The participant aggregate (docs/domain.md §2, §3, D4, D6).
 *
 * `Participant` is the subject's own full view. `RoomMember` is the ONLY shape
 * another participant may ever see -- exactly `id`, `name`, `photoUrl`, pinned
 * by a type-level test (docs/domain.md §5). `SessionToken` is a branded string
 * that is deliberately NOT a field of `Participant`: the credential lives in
 * `participant_sessions` (D4), so no select, relation or serialiser can leak it.
 */

import type { Gender } from "./gates";

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

/**
 * An ISO `YYYY-MM-DD` calendar day, the shape the `date` column round-trips and
 * the shape `<input type="date">` submits. Not a `Date`: a birthdate has no
 * time and no zone, and turning it into an instant is how "born on the 1st"
 * becomes "born on the 31st" for anyone west of UTC.
 */
export type IsoDate = string;

/**
 * What `create()` is given (D18). Identity -- name, gender, birthdate -- and the
 * three consents arrive together, because the MVP asks for them on one screen
 * and participating IS consenting. Photo and declared values still come later.
 */
export interface NewParticipant {
  roomId: RoomId;
  name: string;
  gender: Gender;
  birthdate: IsoDate;
  consent: Consent;
  /**
   * The instant the person ticked the data-treatment box (issue #49). Optional
   * here and null in the row when absent, so a fixture or a repair script can
   * still write a participant; the registration use case always passes one,
   * because that is the only path a person walks.
   */
  dataConsentAt?: Date | null;
  team?: string | null;
  track?: string | null;
}

/** The subject's own full view. Never returned for anybody else. */
export interface Participant {
  id: ParticipantId;
  roomId: RoomId;
  name: string;
  /** Null only for rows registered before D18; below the floor until re-asked. */
  gender: Gender | null;
  birthdate: IsoDate | null;
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consent: Consent;
  /**
   * WHEN the treatment of personal data was authorised (issue #49). Null only
   * for rows written before the box existed; a registration cannot produce one.
   */
  dataConsentAt: Date | null;
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

/** The youngest and oldest a registration may claim (D18). */
export const MIN_AGE = 18;
export const MAX_AGE = 100;

/** Why a submitted birthdate is not one. */
export type BirthdateProblem = "malformed" | "too-young" | "too-old";

/** `YYYY-MM-DD`, and a real day -- 2026-02-30 parses and is not February. */
function parseIsoDate(
  value: string
): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/**
 * Whole years lived on `today`, or null when `birthdate` is not a date.
 *
 * `today` is a parameter rather than a `new Date()` inside: an age function
 * that reads the clock is a function whose birthday cases can only be tested on
 * the right day of the year (AC-3).
 */
export function ageOn(birthdate: IsoDate, today: Date): number | null {
  const born = parseIsoDate(birthdate);
  if (!born) return null;

  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();

  let age = y - born.y;
  // The birthday has not come round yet this year.
  if (m < born.m || (m === born.m && d < born.d)) age -= 1;
  return age;
}

/** `null` when the birthdate is usable, otherwise why it is not (D18). */
export function birthdateProblem(
  birthdate: IsoDate,
  today: Date
): BirthdateProblem | null {
  const age = ageOn(birthdate, today);
  if (age === null) return "malformed";
  if (age < MIN_AGE) return "too-young";
  if (age > MAX_AGE) return "too-old";
  return null;
}

/**
 * The engine's romantic age band, derived rather than asked (D18):
 * 18-24 -> 0, 25-31 -> 1, 32-39 -> 2, 40+ -> 3.
 *
 * A malformed or below-floor birthdate clamps to 0 rather than throwing --
 * `meetsFloor` is what keeps such a row out of a ranking, and this function is
 * downstream of it.
 */
export function ageBandOf(birthdate: IsoDate, today: Date): DeclaredBand {
  const age = ageOn(birthdate, today) ?? 0;
  if (age <= 24) return 0;
  if (age <= 31) return 1;
  if (age <= 39) return 2;
  return 3;
}
