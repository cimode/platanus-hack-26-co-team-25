import type { SessionToken } from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { PhotoStore } from "../ports/photo-store";

/**
 * Step 2 of intake (issue #6): attach a photo to the participant behind the
 * session cookie.
 *
 * The client re-encodes to <= 512 px JPEG before submitting, and none of that
 * is trusted: a Server Action is a public HTTP endpoint, so the ceiling
 * (`image/jpeg | image/png | image/webp`, <= 1 MiB) is enforced here regardless
 * of what the browser did. Nothing reaches the `PhotoStore` until it passes.
 *
 * Rejection carries a `reason` rather than a sentence: the copy shown to the
 * participant ("That file isn't a photo we can use") belongs to the screen, not
 * to the use case.
 */

export type SetPhotoReason = "no-session" | "unsupported-type" | "too-large";

export class SetPhotoError extends Error {
  readonly reason: SetPhotoReason;

  constructor(reason: SetPhotoReason) {
    super(reason);
    this.name = "SetPhotoError";
    this.reason = reason;
  }
}

export interface SetPhotoInput {
  /** From the httpOnly `hookai_session` cookie, resolved inside the action. */
  sessionToken: SessionToken;
  bytes: Uint8Array;
  contentType: string;
}

export interface SetPhotoResult {
  photoUrl: string;
}

export interface SetPhotoDeps {
  participants: ParticipantRepository;
  photos: PhotoStore;
}

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
 * One mebibyte: many times over what a 512 px JPEG needs, and small enough that
 * a hundred of them are a rounding error on Blob.
 *
 * This is THE ceiling, and it has to fire HERE, because only here does the
 * refusal become a sentence on step 2. Next's own Server Action body limit
 * defaults to the same 1 MB and is applied to the raw multipart body before any
 * action runs, so leaving them equal means an oversized photo produces the
 * framework's 413 error page instead of this branch. `next.config.ts` raises
 * the framework limit above this number on purpose; the two must not match.
 */
const MAX_BYTES = 1024 * 1024;

export async function setPhoto(
  input: SetPhotoInput,
  deps: SetPhotoDeps
): Promise<SetPhotoResult> {
  // The payload is judged before the session is looked up: a 4 MB PDF should
  // not buy a database round trip, and neither ordering changes what a
  // legitimate submission sees.
  if (!ALLOWED_TYPES.includes(input.contentType)) {
    throw new SetPhotoError("unsupported-type");
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new SetPhotoError("too-large");
  }

  const participant = await deps.participants.bySessionToken(
    input.sessionToken
  );
  if (!participant) throw new SetPhotoError("no-session");

  // The id namespaces the object; the store decides the URL (D11: unguessable).
  const { url } = await deps.photos.put({
    participantId: participant.id,
    bytes: input.bytes,
    contentType: input.contentType,
  });

  await deps.participants.setPhoto(participant.id, url);

  return { photoUrl: url };
}
