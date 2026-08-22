import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PhotoUpload } from "@/lib/ports/photo-store";

/**
 * The Neon Object Storage `PhotoStore` (issue #25, docs/domain.md D11 as
 * amended 2026-08-22): `@aws-sdk/client-s3` over the branch's `photos` bucket
 * (`public_read`, declared in `neon.ts`), path-style, credentials from the
 * standard `AWS_*` chain. It replaces the Vercel Blob adapter; the fake stays
 * for tests.
 *
 * AC-1 … AC-3 are integration tests against a real branch bucket, guarded by
 * `./test-storage.ts` the way `adapters/db/test-db.ts` guards the database
 * suites: skip with a notice when `AWS_ENDPOINT_URL_S3` is unset, fail under
 * `DB_REQUIRED=1`. Evaluate the guard inside each test rather than in a
 * `describe.skipIf`, so a guard failure is reported against its AC id. They
 * upload under `photos/test-<run>/` and delete what they created.
 *
 * AC-4 is `kind: safety`, so it runs today (docs/testing.md): it reads the
 * adapter sources and asserts nothing in this directory can mint a URL that
 * carries a credential or a signature. When the adapter lands, extend it with
 * the URL-shape half -- `/\/photos\/<participantId>\/[0-9a-f]{16,}\./` over a
 * real `put()` result.
 */

const STORAGE_DIR = new URL("./", import.meta.url);

/** Every adapter module in this directory; the test files are excluded. */
function adapterSources(): Array<{ file: string; code: string }> {
  return readdirSync(STORAGE_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({
      file,
      code: readFileSync(new URL(file, STORAGE_DIR), "utf8"),
    }));
}

describe("createNeonObjectStoragePhotoStore", () => {
  // TODO: un-skip when createNeonObjectStoragePhotoStore exists.
  // Blocked on: src/lib/adapters/storage/neon-object-storage-photo-store.ts
  // (@aws-sdk/client-s3, forcePathStyle: true), ./test-storage.ts (the
  // AWS_ENDPOINT_URL_S3 guard) and a branch whose photos bucket exists
  // (`neon.ts` + `neon deploy`, credentials pulled into .env).
  it.skip('AC-1 · put({ participantId, bytes: a 2 KB JPEG, contentType: "image/jpeg" }) resolves with a url; an unauthenticated GET of it returns 200, content-type image/jpeg and the same bytes; the key starts with photos/<participantId>/', () => {});

  // TODO: un-skip when createNeonObjectStoragePhotoStore exists.
  // Blocked on: the adapter and ./test-storage.ts, as AC-1.
  it.skip("AC-2 · put() twice for the same participant with different bytes yields two different urls that each fetch their own bytes, and the earlier object is still retrievable (a re-upload never overwrites)", () => {});

  // TODO: un-skip when createNeonObjectStoragePhotoStore exists.
  // Blocked on: the adapter and ./test-storage.ts; the test builds its own
  // client with AWS_SECRET_ACCESS_KEY set to a wrong value, then lists the
  // key with the real credentials to prove nothing was written.
  it.skip("AC-3 · with AWS_SECRET_ACCESS_KEY wrong, put() rejects with an error naming the photos bucket and the failing operation, and no object with that key exists afterwards", () => {});

  // kind: safety -- never skipped (docs/testing.md). Vacuous until the Neon
  // adapter exists, and it stays true as the feature lands.
  it("AC-4 · a stored photo url carries no AWS_ACCESS_KEY_ID, no X-Amz- query parameter and no participant name: no adapter interpolates a credential or imports a presigner, and the port exposes no name to build one from", () => {
    const sources = adapterSources();
    // Never empty: the fake and whatever else lives here are held to the
    // same rule as the production adapter.
    expect(sources.length).toBeGreaterThan(0);
    for (const { file, code } of sources) {
      // A presigned URL is the only way an S3 url grows an `X-Amz-Signature`;
      // `public_read` + an unguessable key is the exposure model D11 accepted,
      // so no adapter may sign.
      expect(code, file).not.toMatch(/X-Amz/);
      expect(code, file).not.toMatch(/s3-request-presigner/);
      // A credential interpolated into a string is a credential in a url or in
      // an error message -- both end up in a page or a log.
      expect(code, file).not.toMatch(
        /\$\{[^}]*AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)/
      );
    }
    // The port hands an adapter an id, bytes and a content type -- there is no
    // name for a key or a url to be derived from.
    expectTypeOf<PhotoUpload>().not.toHaveProperty("name");
  });
});

describe("integrationStorage (test-storage.ts)", () => {
  // TODO: un-skip when integrationStorage exists.
  // Blocked on: src/lib/adapters/storage/test-storage.ts, mirroring
  // adapters/db/test-db.ts -- { mode: "skip", notice } naming
  // AWS_ENDPOINT_URL_S3 when it is unset, a throw with the same notice under
  // DB_REQUIRED=1, { mode: "run" } otherwise. Test it the way
  // test-db.test.ts does: pass the environment in as an argument.
  it.skip("AC-7 · with AWS_ENDPOINT_URL_S3 unset, the suite skips AC-1 … AC-4 with a visible notice naming the missing variable; with DB_REQUIRED=1 it fails them with the same notice", () => {});
});
