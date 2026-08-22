import type {
  PhotoStore,
  PhotoUpload,
  StoredPhoto,
} from "@/lib/ports/photo-store";

/**
 * The `PhotoStore` used by Playwright and by a local checkout with no
 * `BLOB_READ_WRITE_TOKEN` (docs/domain.md D11).
 *
 * It returns the bytes back as a `data:` URL, so the page renders the photo the
 * participant just took with no network, no credential and nothing to clean up
 * afterwards. `participants.photo_url` is `text`, and a 512 px JPEG is a few
 * tens of kilobytes -- small enough that this is a real dev experience rather
 * than a stub that only works in a unit test.
 *
 * It is deliberately NOT what production uses: a data URL is re-sent with every
 * render and never hits a CDN, which is exactly what D11 chose Blob to avoid.
 */
export function createFakePhotoStore(): PhotoStore {
  return {
    async put(upload: PhotoUpload): Promise<StoredPhoto> {
      const base64 = Buffer.from(upload.bytes).toString("base64");
      return { url: `data:${upload.contentType};base64,${base64}` };
    },
  };
}
