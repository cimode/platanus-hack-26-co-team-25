import {
  birthdateProblem,
  GENDERS,
  type Gender,
  type IsoDate,
  type Participant,
  type SessionToken,
} from "../domain/participant";
import { avatarFor } from "../domain/participant/avatar";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { PhotoStore } from "../ports/photo-store";
import type { RoomRepository } from "../ports/room-repository";

/**
 * The whole of intake's first screen (issue #42, docs/domain.md D18).
 *
 * One screen, one action: photo, name, gender and birthdate arrive together,
 * the row and the credential are born together, and the photo is stored in the
 * same call. There is no per-LENS consent question -- participating is
 * consenting for this version -- so those three flags are written `true` here
 * rather than on a screen of their own.
 *
 * The one authorisation that IS asked for is the treatment of personal data
 * (issue #49): the app stores a real name, a photo, a birthdate and answers
 * for ~100 people and ranks them, and Ley 1581 de 2012 expects that
 * authorisation to be explicit and recorded WITH ITS MOMENT. It is checked
 * first, before any read and long before any write, so a refusal leaves the
 * database exactly as it was.
 *
 * The room arrives as a SLUG, never as an id: `?room=` is in the QR code and
 * therefore attacker-controlled, and a slug has to be resolved against the
 * `rooms` table before anything is written (docs/domain.md D9).
 *
 * Order matters. Everything that can be judged from the payload alone is judged
 * BEFORE a row exists, so a bad birthdate or an unusable file never creates
 * one. The photo is stored after the row because the store namespaces the
 * object by participant id (D11); when the store refuses, the row is left
 * without a `photo_url` and the caller does NOT get a cookie -- so nothing in
 * the flow ever points at it and the person is looking at the same screen
 * (`intakeStepOf` reads a null `photo_url` as "register").
 *
 * `ParticipantRepository.create()` returns the session token beside the
 * participant rather than on it (D4); the caller writes it to the httpOnly
 * cookie and it never appears in a payload.
 */

export type RegisterParticipantReason =
  | "room-not-found"
  | "invalid-name"
  | "invalid-gender"
  | "birthdate-malformed"
  | "birthdate-too-young"
  | "birthdate-too-old"
  | "photo-missing"
  | "photo-unsupported-type"
  | "photo-too-large"
  | "photo"
  /** The data-treatment box was not ticked (issue #49, Ley 1581 de 2012). */
  | "data-consent";

export class RegisterParticipantError extends Error {
  readonly reason: RegisterParticipantReason;
  /**
   * Set only on `reason: "photo"` -- the row exists, the store refused, and
   * the credential is what a test needs to prove the flow resumes on the
   * registration screen rather than in the quiz (AC-4).
   */
  readonly sessionToken?: SessionToken;

  constructor(reason: RegisterParticipantReason, sessionToken?: SessionToken) {
    super(reason);
    this.name = "RegisterParticipantError";
    this.reason = reason;
    this.sessionToken = sessionToken;
  }
}

export interface RegisterPhoto {
  bytes: Uint8Array;
  contentType: string;
}

export interface RegisterParticipantInput {
  roomSlug: string;
  name: string;
  gender: string;
  birthdate: IsoDate;
  photo: RegisterPhoto | null;
  /**
   * True only when the person ticked the data-treatment box (issue #49).
   * A boolean rather than a timestamp: the screen reports a tick, and the
   * moment is the use case's to mint, so a client cannot backdate it.
   */
  dataConsent: boolean;
  /** Injected so the age rules are testable on any day of the year (AC-3). */
  today?: Date;
}

export interface RegisterParticipantResult {
  participant: Participant;
  sessionToken: SessionToken;
}

export interface RegisterParticipantDeps {
  participants: ParticipantRepository;
  rooms: RoomRepository;
  photos: PhotoStore;
}

/** The `participants_name_length` check, in the language the screen speaks. */
const MAX_NAME = 80;

/**
 * What a phone camera produces and what a room view can render. Anything else
 * -- a PDF renamed, an SVG carrying script, a HEIC no browser here decodes --
 * is refused rather than stored and discovered at projection time.
 */
const ALLOWED_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * One mebibyte, and it has to fire HERE, because only here does the refusal
 * become a sentence on the registration screen. Next's own Server Action body
 * limit is raised above it in `next.config.ts` on purpose: were the two equal,
 * an oversized photo would produce the framework's 413 error page instead of
 * this branch.
 */
const MAX_BYTES = 1024 * 1024;

/** D18: participating is consenting; nothing on any screen says so. */
const IMPLIED_CONSENT = {
  romantic: true,
  business: true,
  friendship: true,
} as const;

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

  // Before anything else that could write: Ley 1581 de 2012 wants an explicit
  // authorisation, so a registration without one never reaches a table.
  if (!input.dataConsent) {
    throw new RegisterParticipantError("data-consent");
  }

  if (!GENDERS.includes(input.gender as Gender)) {
    throw new RegisterParticipantError("invalid-gender");
  }
  const gender = input.gender as Gender;

  const problem = birthdateProblem(input.birthdate, input.today ?? new Date());
  if (problem === "malformed") {
    throw new RegisterParticipantError("birthdate-malformed");
  }
  if (problem === "too-young") {
    throw new RegisterParticipantError("birthdate-too-young");
  }
  if (problem === "too-old") {
    throw new RegisterParticipantError("birthdate-too-old");
  }

  // The payload is judged before any row is written: a 4 MB PDF should not buy
  // a participant nobody can see.
  const photo = input.photo;
  if (!photo || photo.bytes.byteLength === 0) {
    throw new RegisterParticipantError("photo-missing");
  }
  if (!ALLOWED_TYPES.includes(photo.contentType)) {
    throw new RegisterParticipantError("photo-unsupported-type");
  }
  if (photo.bytes.byteLength > MAX_BYTES) {
    throw new RegisterParticipantError("photo-too-large");
  }

  const room = await deps.rooms.bySlug(input.roomSlug);
  if (!room) throw new RegisterParticipantError("room-not-found");

  const created = await deps.participants.create({
    roomId: room.id,
    name,
    gender,
    birthdate: input.birthdate,
    // The body is decided here, once, and stored: every screen reads the row.
    avatar: avatarFor(gender, `${name}|${input.birthdate}`),
    consent: { ...IMPLIED_CONSENT },
    // The moment, not just the fact (issue #49): habeas data asks when the
    // authorisation was given, and `today` keeps it testable.
    dataConsentAt: input.today ?? new Date(),
  });

  let url: string;
  try {
    // The id namespaces the object; the store decides the URL (D11).
    ({ url } = await deps.photos.put({
      participantId: created.participant.id,
      bytes: photo.bytes,
      contentType: photo.contentType,
    }));
  } catch {
    // The row stays, without a photo and without a cookie pointing at it: the
    // person sees the registration screen again, and nothing in the flow can
    // reach the half-written row.
    throw new RegisterParticipantError("photo", created.sessionToken);
  }

  await deps.participants.setPhoto(created.participant.id, url);

  return {
    participant: { ...created.participant, photoUrl: url },
    sessionToken: created.sessionToken,
  };
}
