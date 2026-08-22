import { describe, it } from "vitest";

/**
 * The composition root's `photos` member (issue #25, docs/domain.md D11 as
 * amended 2026-08-22): the Neon Object Storage adapter when
 * `AWS_ENDPOINT_URL_S3` is set, the fake otherwise. `BLOB_READ_WRITE_TOKEN`
 * is no longer read anywhere once the Vercel Blob adapter is gone.
 *
 * Reading `.photos` must open no database connection: every database member
 * of `serverDeps()` is a getter over `getDb()`, and `photos` is not one of
 * them -- assert it by leaving `DATABASE_URL` unset for the read. Mutate the
 * environment with `delete` and restore it in `afterEach`, as
 * `adapters/db/client.test.ts` does: `= undefined` coerces to the string
 * "undefined".
 *
 * Telling the adapters apart without a network: the fake's `put` returns a
 * `data:` url synchronously; the Neon adapter's `put` goes through an
 * `S3Client`, so AC-5 asserts on its shape (a `put` that targets the photos
 * bucket -- e.g. via a `bucket` property the adapter exposes, or by injecting
 * the client) rather than on a real upload.
 */
describe("serverDeps().photos", () => {
  // TODO: un-skip when createNeonObjectStoragePhotoStore exists and
  // composition.ts selects it by AWS_ENDPOINT_URL_S3.
  // Blocked on: src/lib/adapters/storage/neon-object-storage-photo-store.ts;
  // serverDeps() and the fake store already exist.
  it.skip("AC-5 · with AWS_ENDPOINT_URL_S3 set it is the Neon Object Storage adapter (its put targets the photos bucket), and reading it opens no database connection", () => {});

  // TODO: un-skip when composition.ts stops reading BLOB_READ_WRITE_TOKEN.
  // Blocked on: removing src/lib/adapters/storage/vercel-blob-photo-store.ts
  // and the @vercel/blob dependency. Verified 2026-08-22: with the token set
  // and the endpoint unset, `.photos` is today the Vercel Blob adapter and
  // `put` calls the Vercel API ("This store does not exist"), so this cannot
  // run yet. With both unset it is already the fake, and no database opens.
  it.skip("AC-6 · with AWS_ENDPOINT_URL_S3 unset and BLOB_READ_WRITE_TOKEN set to any value it is the fake photo store -- the Vercel Blob adapter no longer exists and the token is ignored", () => {});
});
