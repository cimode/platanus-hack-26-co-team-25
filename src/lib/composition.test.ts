import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "./adapters/db/client";
import { PHOTOS_BUCKET } from "./adapters/storage/neon-object-storage-photo-store";
import { serverDeps } from "./composition";
import type { ParticipantId } from "./domain/participant";
import type { PhotoStore } from "./ports/photo-store";

/**
 * The composition root's `photos` member (issue #25, docs/domain.md D11 as
 * amended 2026-08-22): the Neon Object Storage adapter when
 * `AWS_ENDPOINT_URL_S3` is set, the fake otherwise. `BLOB_READ_WRITE_TOKEN`
 * is no longer read anywhere once the Vercel Blob adapter is gone.
 *
 * Reading `.photos` must open no database connection: every database member
 * of `serverDeps()` is a getter over `getDb()`, and `photos` is not one of
 * them -- asserted by dropping `DATABASE_URL` (and the memoised handle) for
 * the read, so that a `.photos` that reached for the database would throw
 * while `.db` still does. Mutate the environment with `delete` and restore it
 * in `afterEach`, as `adapters/db/client.test.ts` does: `= undefined` coerces
 * to the string "undefined".
 *
 * Telling the adapters apart without a network: the Neon adapter carries the
 * `bucket` it writes to, and the fake's `put` returns a `data:` url with no
 * request at all.
 */

const EXAMPLE_ENDPOINT =
  "https://br-example.storage.c-4.us-east-2.aws.neon.tech";

const VERCEL_BLOB_ADAPTER = new URL(
  "./adapters/storage/vercel-blob-photo-store.ts",
  import.meta.url
);
const COMPOSITION_SOURCE = new URL("./composition.ts", import.meta.url);

const saved = {
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  token: process.env.BLOB_READ_WRITE_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
};

afterEach(() => {
  for (const [name, value] of [
    ["AWS_ENDPOINT_URL_S3", saved.endpoint],
    ["BLOB_READ_WRITE_TOKEN", saved.token],
    ["DATABASE_URL", saved.databaseUrl],
  ] as const) {
    delete process.env[name];
    if (value !== undefined) process.env[name] = value;
  }
  resetDb();
});

/** What the composition root hands out, plus the marker the Neon adapter adds. */
type SelectedStore = PhotoStore & { bucket?: string };

describe("serverDeps().photos", () => {
  it("AC-5 · with AWS_ENDPOINT_URL_S3 set it is the Neon Object Storage adapter (its put targets the photos bucket), and reading it opens no database connection", () => {
    process.env.AWS_ENDPOINT_URL_S3 = EXAMPLE_ENDPOINT;
    // No database at all for the duration of this test: `getDb()` memoises, so
    // the cached handle goes too, or a previous suite's connection would make
    // the assertion below vacuous.
    delete process.env.DATABASE_URL;
    resetDb();

    const deps = serverDeps();
    const photos: SelectedStore = deps.photos;

    expect(photos.bucket).toBe(PHOTOS_BUCKET);
    expect(typeof photos.put).toBe("function");

    // The control: in this same environment a database-backed member does
    // throw, so `.photos` resolving proves it never reached for one.
    expect(() => deps.db).toThrowError(/DATABASE_URL/);
    expect(() => deps.participants).toThrowError(/DATABASE_URL/);
  });

  it("AC-6 · with AWS_ENDPOINT_URL_S3 unset and BLOB_READ_WRITE_TOKEN set to any value it is the fake photo store -- the Vercel Blob adapter no longer exists and the token is ignored", async () => {
    delete process.env.AWS_ENDPOINT_URL_S3;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_ignored";

    // The token cannot be honoured by an adapter that is gone, and nothing may
    // read it any more (issue #25: production silently used the fake because
    // this variable was never set on Vercel).
    expect(existsSync(VERCEL_BLOB_ADAPTER)).toBe(false);
    expect(readFileSync(COMPOSITION_SOURCE, "utf8")).not.toContain(
      "BLOB_READ_WRITE_TOKEN"
    );

    const photos: SelectedStore = serverDeps().photos;
    expect(photos.bucket).toBeUndefined();

    // The fake answers from the bytes it was handed, with no request at all.
    const stored = await photos.put({
      participantId: "ac6-participant" as ParticipantId,
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      contentType: "image/jpeg",
    });
    expect(stored.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});
