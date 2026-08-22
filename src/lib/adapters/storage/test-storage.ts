import type { PhotoStore } from "@/lib/ports/photo-store";
import { createNeonObjectStoragePhotoStore } from "./neon-object-storage-photo-store";

/**
 * The object-storage integration-test guard (issue #25), mirroring
 * `adapters/db/test-db.ts`.
 *
 * The suites under `src/lib/adapters/storage/` need a branch whose `photos`
 * bucket exists. When `AWS_ENDPOINT_URL_S3` is unset they skip with a visible
 * notice naming that variable -- a laptop that never ran `neon deploy` still
 * runs the rest of the suite -- unless `DB_REQUIRED=1`, which is what CI sets,
 * and then a missing bucket is a loud failure carrying the same notice.
 *
 * One variable decides it, the same way `integrationDb()` keys on
 * `DATABASE_URL`: the endpoint is what `neon env pull` writes alongside the
 * branch credentials, so a checkout that has it has all four.
 */
export type EnvLike = Record<string, string | undefined>;

export type IntegrationStorage =
  | { mode: "run"; store: PhotoStore; endpoint: string }
  | { mode: "skip"; notice: string };

const SKIP_NOTICE =
  "AWS_ENDPOINT_URL_S3 is not set, so the object-storage integration tests " +
  "are skipped. Run `neon deploy` and `neon env pull` on the branch this " +
  "checkout is linked to (docs/storage.md) to run them, or set STORAGE_REQUIRED=1 " +
  "to make a missing bucket a failure.";

const REQUIRED_NOTICE =
  "STORAGE_REQUIRED is set but AWS_ENDPOINT_URL_S3 is not. Set it only where " +
  "the branch's photos bucket has been provisioned (neon deploy) and its " +
  "AWS_* credentials pulled; a silent skip there would be a green build over " +
  "tests that uploaded nothing. DB_REQUIRED deliberately does NOT cover " +
  "storage: the CI branch has a database but no bucket.";

/**
 * Reads the environment (never a module-scope snapshot of it) and decides
 * whether the suite can run. Building the store opens no connection -- an
 * `S3Client` is inert until a command is sent.
 */
export function integrationStorage(
  env: EnvLike = process.env
): IntegrationStorage {
  const endpoint = env.AWS_ENDPOINT_URL_S3;
  if (endpoint) {
    return {
      mode: "run",
      store: createNeonObjectStoragePhotoStore(),
      endpoint,
    };
  }

  const required = env.STORAGE_REQUIRED;
  if (required && required !== "0" && required !== "false") {
    throw new Error(REQUIRED_NOTICE);
  }
  return { mode: "skip", notice: SKIP_NOTICE };
}
