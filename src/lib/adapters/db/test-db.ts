import { createDb, type Db } from "./client.ts";

/**
 * The one integration-test guard (docs/domain.md §8).
 *
 * Integration suites under `src/lib/adapters/db/` need a migrated branch. When
 * `DATABASE_URL` is unset they skip with a visible notice -- a laptop without a
 * database still runs the rest of the suite -- unless `DB_REQUIRED=1`, which is
 * what CI sets, and then a missing database is a loud failure rather than a
 * silent skip.
 */
export type EnvLike = Record<string, string | undefined>;

export type IntegrationDb =
  | { mode: "run"; db: Db }
  | { mode: "skip"; notice: string };

const SKIP_NOTICE =
  "DATABASE_URL is not set, so the database integration tests are skipped. " +
  "Point .env at a migrated Neon branch (`neon checkout dev-domain`) to run " +
  "them, or set DB_REQUIRED=1 to make a missing database a failure.";

const REQUIRED_NOTICE =
  "DB_REQUIRED is set but DATABASE_URL is not. CI runs the database " +
  "integration tests against a migrated Neon branch; a silent skip there is a " +
  "green build over tests that never touched a table.";

/**
 * Reads the environment (never a module-scope snapshot of it) and decides
 * whether the suite can run. Building the handle opens no connection --
 * neon-http is stateless until a query runs.
 */
export function integrationDb(env: EnvLike = process.env): IntegrationDb {
  const url = env.DATABASE_URL;
  if (url) return { mode: "run", db: createDb(url) };

  const required = env.DB_REQUIRED;
  if (required && required !== "0" && required !== "false") {
    throw new Error(REQUIRED_NOTICE);
  }
  return { mode: "skip", notice: SKIP_NOTICE };
}
