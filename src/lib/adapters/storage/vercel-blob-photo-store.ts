import { put } from "@vercel/blob";
import type {
  PhotoStore,
  PhotoUpload,
  StoredPhoto,
} from "@/lib/ports/photo-store";

/**
 * The production `PhotoStore` (docs/domain.md D11): Vercel Blob, CDN-served,
 * no Postgres egress for a room view that loads a hundred faces.
 *
 * `addRandomSuffix: true` is the security property, not a convenience: the
 * object lives under `photos/<participantId>`, so without the suffix the URL
 * would be derivable from an id that appears in other payloads. With it, the
 * URL is unguessable and is only ever embedded in a page its viewer is
 * authorised to see.
 *
 * The bytes are wrapped in a `Blob` rather than passed as a `Uint8Array`: the
 * SDK's `PutBody` takes a `Blob`, and wrapping keeps the content type attached
 * to the body instead of relying on the pathname's extension.
 */
export function createVercelBlobPhotoStore(token?: string): PhotoStore {
  return {
    async put(upload: PhotoUpload): Promise<StoredPhoto> {
      const result = await put(
        `photos/${upload.participantId}`,
        // `.slice()` copies into a plain ArrayBuffer, which is what `BlobPart`
        // accepts -- a Uint8Array may be backed by a SharedArrayBuffer and the
        // type says so. A photo is <= 1 MiB, so the copy is free.
        new Blob([upload.bytes.slice()], { type: upload.contentType }),
        {
          access: "public",
          addRandomSuffix: true,
          contentType: upload.contentType,
          token,
        }
      );
      return { url: result.url };
    },
  };
}
