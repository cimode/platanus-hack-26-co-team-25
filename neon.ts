import { defineConfig } from "@neon/config/v1";

/**
 * Neon infrastructure-as-code for this project (issue #25, docs/storage.md).
 *
 * One bucket, `photos`, holding every participant's intake photo
 * (docs/domain.md D11 as amended 2026-08-22). `public_read` is deliberate: the
 * URL is stored in `participants.photo_url` and rendered with a plain
 * `<img src>`, so it must be fetchable with no credential and no signature.
 * The exposure model is the one D11 already accepted for Vercel Blob --
 * unguessable keys, embedded only in pages their viewer is authorised to see.
 *
 * Buckets are branch-scoped. `neon deploy` (alias of `neon config apply`)
 * provisions them on the linked branch; `neon checkout` applies this policy as
 * it creates a new branch, so a preview/CI branch comes up with `photos`
 * already there and copy-on-write objects inherited from its parent.
 */
export default defineConfig({
  preview: {
    buckets: {
      photos: { access: "public_read" },
    },
  },
});
