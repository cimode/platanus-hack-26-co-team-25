import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  onTestFinished,
  type TestContext,
} from "vitest";
import type { ParticipantId } from "@/lib/domain/participant";
import type { PhotoUpload } from "@/lib/ports/photo-store";
import {
  createNeonObjectStoragePhotoStore,
  PHOTOS_BUCKET,
  photoObjectKey,
  photoObjectUrl,
} from "./neon-object-storage-photo-store";
import { type EnvLike, integrationStorage } from "./test-storage";

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
 * `STORAGE_REQUIRED=1`. The guard is evaluated inside each test rather than in a
 * `describe.skipIf`, so a guard failure is reported against its AC id. They
 * upload under a `photos/test-<run>-…` prefix and delete what they created.
 *
 * AC-4 is `kind: safety`, so it runs today and never conditionally
 * (docs/testing.md). It needs no network: a key and a url are minted by two
 * pure functions, and the invariant -- no credential, no signature, no name,
 * an unguessable random segment -- is a property of those two plus a source
 * scan of every adapter in this directory.
 */

const STORAGE_DIR = new URL("./", import.meta.url);

/** This run's namespace, so parallel runs never collide on a key. */
const RUN = randomUUID().slice(0, 8);

const EXAMPLE_ENDPOINT =
  "https://br-example.storage.c-4.us-east-2.aws.neon.tech";

/** Correct credentials, captured before any test rewrites the environment. */
const REAL_CREDENTIALS = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
};
const REAL_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3;
const REAL_REGION = process.env.AWS_REGION;

const savedSecret = process.env.AWS_SECRET_ACCESS_KEY;

afterEach(() => {
  // `delete`, not `= undefined`: assigning undefined to process.env coerces to
  // the literal string "undefined" in Node.
  delete process.env.AWS_SECRET_ACCESS_KEY;
  if (savedSecret !== undefined) {
    process.env.AWS_SECRET_ACCESS_KEY = savedSecret;
  }
});

/** Every adapter module in this directory; the test files are excluded. */
function adapterSources(): Array<{ file: string; code: string }> {
  return readdirSync(STORAGE_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({
      file,
      code: readFileSync(new URL(file, STORAGE_DIR), "utf8"),
    }));
}

function requireStorage(ctx: TestContext) {
  const guard = integrationStorage(process.env);
  if (guard.mode === "skip") {
    console.warn(guard.notice);
    ctx.skip(guard.notice);
  }
  return guard;
}

/**
 * A second door into the bucket: the tests verify and clean up through their
 * own client rather than through the adapter under test, so a broken adapter
 * cannot make its own assertions pass.
 */
function verifier(): S3Client {
  return new S3Client({
    forcePathStyle: true,
    credentials: REAL_CREDENTIALS,
    endpoint: REAL_ENDPOINT,
    region: REAL_REGION,
  });
}

/** A participant id of this run's own; the key is namespaced under it. */
function testParticipant(label: string): ParticipantId {
  return `test-${RUN}-${label}` as ParticipantId;
}

/** ~2 KB with a JPEG SOI marker; `seed` makes two uploads differ byte by byte. */
function jpegBytes(seed: number): Uint8Array {
  const bytes = new Uint8Array(2048);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < bytes.length; i += 1) {
    bytes[i] = (i * 31 + seed) % 256;
  }
  return bytes;
}

/** The key an adapter-returned url points at, derived the path-style way. */
function keyOf(url: string, endpoint: string): string {
  const prefix = `${endpoint.replace(/\/$/, "")}/${PHOTOS_BUCKET}/`;
  expect(url.startsWith(prefix), `${url} is not under ${prefix}`).toBe(true);
  return url.slice(prefix.length);
}

/** Deletes an object the test created, whatever the test then asserts. */
function cleanUp(key: string): void {
  onTestFinished(async () => {
    await verifier().send(
      new DeleteObjectCommand({ Bucket: PHOTOS_BUCKET, Key: key })
    );
  });
}

describe("createNeonObjectStoragePhotoStore", () => {
  it('AC-1 · put({ participantId, bytes: a 2 KB JPEG, contentType: "image/jpeg" }) resolves with a url; an unauthenticated GET of it returns 200, content-type image/jpeg and the same bytes; the key starts with photos/<participantId>/', async (ctx) => {
    const { store, endpoint } = requireStorage(ctx);
    const participantId = testParticipant("ac1");
    const bytes = jpegBytes(7);

    const stored = await store.put({
      participantId,
      bytes,
      contentType: "image/jpeg",
    });

    const key = keyOf(stored.url, endpoint);
    cleanUp(key);
    expect(key.startsWith(`photos/${participantId}/`)).toBe(true);

    // `fetch` sends no Authorization header and no signature: this is the
    // `public_read` guarantee the `<img src>` in the room view depends on.
    const response = await fetch(stored.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("AC-2 · put() twice for the same participant with different bytes yields two different urls that each fetch their own bytes, and the earlier object is still retrievable (a re-upload never overwrites)", async (ctx) => {
    const { store, endpoint } = requireStorage(ctx);
    const participantId = testParticipant("ac2");
    const first = jpegBytes(11);
    const second = jpegBytes(200);
    expect(first).not.toEqual(second);

    const one = await store.put({
      participantId,
      bytes: first,
      contentType: "image/jpeg",
    });
    cleanUp(keyOf(one.url, endpoint));

    const two = await store.put({
      participantId,
      bytes: second,
      contentType: "image/jpeg",
    });
    cleanUp(keyOf(two.url, endpoint));

    expect(two.url).not.toBe(one.url);

    // The earlier object survives the re-upload: `set-photo` decides which url
    // the row keeps, storage never silently rewrites one.
    const earlier = await fetch(one.url);
    expect(earlier.status).toBe(200);
    expect(new Uint8Array(await earlier.arrayBuffer())).toEqual(first);

    const later = await fetch(two.url);
    expect(later.status).toBe(200);
    expect(new Uint8Array(await later.arrayBuffer())).toEqual(second);
  });

  it("AC-3 · with AWS_SECRET_ACCESS_KEY wrong, put() rejects with an error naming the photos bucket and the failing operation, and no object with that key exists afterwards", async (ctx) => {
    requireStorage(ctx);
    const participantId = testParticipant("ac3");

    // The store is built after the environment is rewritten, so it resolves
    // the wrong secret through the standard AWS chain exactly as a
    // misconfigured deployment would.
    process.env.AWS_SECRET_ACCESS_KEY = "nsk_live_wrong_secret_for_ac3";
    const store = createNeonObjectStoragePhotoStore();

    const rejection = await store
      .put({ participantId, bytes: jpegBytes(3), contentType: "image/jpeg" })
      .then(
        () => null,
        (error: unknown) => error
      );

    expect(rejection, "put() resolved with a wrong secret").toBeInstanceOf(
      Error
    );
    const message = (rejection as Error).message;
    expect(message).toContain(PHOTOS_BUCKET);
    expect(message).toMatch(/put/i);

    // A failed write leaves nothing behind -- checked through the verifier's
    // correct credentials, not through the store that just failed.
    const listed = await verifier().send(
      new ListObjectsV2Command({
        Bucket: PHOTOS_BUCKET,
        Prefix: `photos/${participantId}/`,
      })
    );
    expect(listed.Contents ?? []).toEqual([]);
  });

  // kind: safety -- never skipped and never conditional (docs/testing.md).
  it("AC-4 · a stored photo url carries no AWS_ACCESS_KEY_ID, no X-Amz- query parameter and no participant name, and the segment after the participant id is at least 16 hex characters", () => {
    const sources = adapterSources();
    // Never empty: the fake and whatever else lives here are held to the same
    // rule as the production adapter.
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

    const participantId = testParticipant("ac4");
    const key = photoObjectKey(participantId, "image/jpeg");
    const segments = key.split("/");
    expect(segments).toHaveLength(3);
    expect(segments.slice(0, 2)).toEqual(["photos", participantId]);
    // >= 16 hex characters of randomness, and never the same twice: a url
    // cannot be derived from the participant id alone.
    expect(segments[2]).toMatch(/^[0-9a-f]{16,}\.(jpg|jpeg)$/);
    expect(photoObjectKey(participantId, "image/jpeg")).not.toBe(key);

    const url = photoObjectUrl(key, EXAMPLE_ENDPOINT);
    expect(url).toBe(`${EXAMPLE_ENDPOINT}/${PHOTOS_BUCKET}/${key}`);
    // No query string at all: no `X-Amz-*`, no access key id, nothing that
    // expires or that a log would be wrong to keep.
    expect(url).not.toContain("?");
    expect(url).not.toMatch(/X-Amz/i);
    // Neon branch credentials are `nak_live_*` / `nsk_live_*`; a url is
    // never allowed to carry one, whatever the environment holds.
    expect(url).not.toMatch(/nak_live_|nsk_live_/);
  });
});

describe("integrationStorage (test-storage.ts)", () => {
  it("AC-7 · with AWS_ENDPOINT_URL_S3 unset, the suite skips AC-1 … AC-4 with a visible notice naming the missing variable; with DB_REQUIRED=1 it fails them with the same notice", () => {
    const unset: EnvLike = {};
    const skipped = integrationStorage(unset);
    expect(skipped.mode).toBe("skip");
    if (skipped.mode !== "skip") throw new Error("expected mode skip");
    expect(skipped.notice).toContain("AWS_ENDPOINT_URL_S3");
    expect(skipped.notice).toMatch(/skip/i);

    // STORAGE_REQUIRED=1 (set only where the bucket exists): a missing bucket is a failure carrying the same
    // notice, never a silent green run over tests that uploaded nothing.
    let thrown: unknown;
    try {
      integrationStorage({ STORAGE_REQUIRED: "1" });
    } catch (error) {
      thrown = error;
    }
    expect(
      thrown,
      "STORAGE_REQUIRED=1 with no endpoint did not throw"
    ).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("AWS_ENDPOINT_URL_S3");
    expect((thrown as Error).message).toContain("STORAGE_REQUIRED");

    // An `S3Client` is inert until a command is sent, which is what lets this
    // be a unit test over an endpoint that resolves nowhere.
    const running = integrationStorage({
      AWS_ACCESS_KEY_ID: "nak_live_example",
      AWS_ENDPOINT_URL_S3: EXAMPLE_ENDPOINT,
      AWS_REGION: "us-east-2",
      AWS_SECRET_ACCESS_KEY: "nsk_live_example",
    });
    expect(running.mode).toBe("run");
    if (running.mode !== "run") throw new Error("expected mode run");
    expect(typeof running.store.put).toBe("function");
    expect(running.endpoint).toBe(EXAMPLE_ENDPOINT);
  });
});
