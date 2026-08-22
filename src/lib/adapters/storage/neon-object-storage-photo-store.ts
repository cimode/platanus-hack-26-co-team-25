import { randomBytes } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ParticipantId } from "@/lib/domain/participant";
import type {
  PhotoStore,
  PhotoUpload,
  StoredPhoto,
} from "@/lib/ports/photo-store";

/**
 * The production `PhotoStore` (issue #25, docs/domain.md D11 as amended
 * 2026-08-22): Neon Object Storage, S3-compatible, branch-scoped.
 *
 * Neon speaks the S3 API with **path-style addressing only**, so the client
 * carries `forcePathStyle: true` and nothing else: credentials, endpoint and
 * region resolve from the AWS-standard chain (`AWS_ACCESS_KEY_ID`,
 * `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`) that
 * `neon env pull` writes into `.env` -- see `docs/storage.md`. Resolution is
 * lazy, so constructing a store opens no socket and a misconfigured
 * deployment fails on the request rather than at import time.
 *
 * The bucket is `public_read` (declared in `neon.ts`), which is what lets the
 * URL sit in `participants.photo_url` behind a plain `<img src>` with no
 * credential, no signature and no expiry. That is the exposure model D11
 * already accepted for Vercel Blob, and it holds only because the key carries
 * 128 bits of randomness: a URL never follows from a participant id.
 *
 *   - `photoObjectKey()` is the only place a key is minted.
 *   - `photoObjectUrl()` is the only place a URL is built.
 *   - the store carries the `bucket` it writes to, which is how
 *     `composition.test.ts` tells it apart from the fake without touching the
 *     network (AC-5).
 */

/** Declared in `neon.ts` as `public_read`, provisioned per branch. */
export const PHOTOS_BUCKET = "photos";

/**
 * The `PhotoStore` this adapter returns, widened with the bucket it writes to
 * so the composition root's choice is observable without an upload.
 */
export interface NeonObjectStoragePhotoStore extends PhotoStore {
  readonly bucket: string;
}

/**
 * The extension a key ends in, per content type the use case admits
 * (`set-photo.ts`: JPEG, PNG, WebP). It is cosmetic -- the object's own
 * `Content-Type` is what a browser honours -- but a key ending in `.jpg`
 * survives being copied into a filename, a CDN log or a bug report.
 */
const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `photos/<participantId>/<32 random hex>.<ext from the content type>`. */
export function photoObjectKey(
  participantId: ParticipantId,
  contentType: string
): string {
  const extension = EXTENSIONS[contentType] ?? "bin";
  // 16 bytes = 32 hex characters. The randomness is the security property
  // (AC-4): without it the object's URL would follow from an id that appears
  // in other payloads. A fresh value per call is also why a re-upload never
  // overwrites the object the row currently points at (AC-2).
  const random = randomBytes(16).toString("hex");
  return `${PHOTOS_BUCKET}/${participantId}/${random}.${extension}`;
}

/**
 * The object's public URL, built in exactly one place. `endpoint` defaults to
 * `AWS_ENDPOINT_URL_S3`; path-style addressing puts the bucket in the path,
 * which is what Neon requires -- so the URL is `<endpoint>/<bucket>/<key>`
 * with no query string at all.
 */
export function photoObjectUrl(
  key: string,
  endpoint = process.env.AWS_ENDPOINT_URL_S3
): string {
  if (!endpoint) {
    throw new Error(
      "AWS_ENDPOINT_URL_S3 is not set, so the public URL of an object in the " +
        `${PHOTOS_BUCKET} bucket cannot be built. Run \`neon deploy\` and ` +
        "`neon env pull` on the linked branch (docs/storage.md)."
    );
  }
  return `${endpoint.replace(/\/+$/, "")}/${PHOTOS_BUCKET}/${key}`;
}

/**
 * Credentials, endpoint and region come from the standard AWS env chain, so
 * this takes no arguments -- `src/lib/composition.ts` decides whether to build
 * it at all.
 */
export function createNeonObjectStoragePhotoStore(): NeonObjectStoragePhotoStore {
  const client = new S3Client({ forcePathStyle: true });

  return {
    bucket: PHOTOS_BUCKET,

    async put(upload: PhotoUpload): Promise<StoredPhoto> {
      const key = photoObjectKey(upload.participantId, upload.contentType);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: PHOTOS_BUCKET,
            Key: key,
            // `.slice()` copies into a plain ArrayBuffer-backed view: a
            // Uint8Array may be backed by a SharedArrayBuffer, which the SDK's
            // body type rejects. A photo is <= 1 MiB, so the copy is free.
            Body: upload.bytes.slice(),
            ContentType: upload.contentType,
          })
        );
      } catch (cause) {
        // The SDK's own message names neither the bucket nor the operation:
        // a bare `SignatureDoesNotMatch` in a log says nothing about which of
        // the branch's services is misconfigured. The credential itself is
        // never interpolated -- this string ends up in that same log.
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `PutObject into the ${PHOTOS_BUCKET} bucket failed for key ${key}: ${reason}`,
          { cause }
        );
      }
      return { url: photoObjectUrl(key) };
    },
  };
}
