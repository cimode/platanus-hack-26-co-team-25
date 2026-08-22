import { describe, it } from "vitest";

/**
 * The integration-test guard (issue #4, docs/domain.md §8): `integrationDb()`
 * returns { mode: "run", db } when DATABASE_URL is set, { mode: "skip",
 * notice } when unset, and throws when unset with DB_REQUIRED=1 -- a missing
 * database skips locally and fails loudly in CI. Alongside it,
 * drizzle.config.ts must load without DATABASE_URL so `db:generate` and
 * `db:check` run with no database (D8).
 */

describe("integrationDb", () => {
  // TODO: un-skip when src/lib/adapters/db/test-db.ts exists.
  // Blocked on: integrationDb(env) and drizzle.config.ts no longer throwing
  // when DATABASE_URL is unset (dbCredentials optional).
  it.skip("AC-9 · skips, throws or runs by environment, and drizzle.config.ts loads without DATABASE_URL", () => {});
});
