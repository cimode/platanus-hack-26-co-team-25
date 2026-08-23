import { afterEach, describe, expect, it } from "vitest";
import { type EnvLike, integrationDb } from "./test-db";

/**
 * The integration-test guard (issue #4, docs/domain.md §8): `integrationDb()`
 * returns { mode: "run", db } when DATABASE_URL is set, { mode: "skip",
 * notice } when unset, and throws when unset with DB_REQUIRED=1 -- a missing
 * database skips locally and fails loudly in CI. Alongside it,
 * drizzle.config.ts must load without DATABASE_URL so `db:generate` and
 * `db:check` run with no database (D8).
 *
 * The environment is passed in rather than read from module scope, so the
 * three cases are three arguments and no test has to mutate `process.env`.
 * The one exception is the config import, which reads the real environment.
 */

const FAKE_URL =
  "postgresql://user:pw@ep-fake-123.us-east-2.aws.neon.tech/dipia?sslmode=require";

const savedUrl = process.env.DATABASE_URL;

afterEach(() => {
  // `delete`, not `= undefined`: assigning undefined to process.env coerces
  // to the literal string "undefined" in Node.
  delete process.env.DATABASE_URL;
  if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
});

describe("integrationDb", () => {
  it("AC-9 · skips, throws or runs by environment, and drizzle.config.ts loads without DATABASE_URL", async () => {
    const unset: EnvLike = {};
    const skipped = integrationDb(unset);
    expect(skipped.mode).toBe("skip");
    if (skipped.mode !== "skip") throw new Error("expected mode skip");
    expect(skipped.notice).toContain("DATABASE_URL");
    expect(skipped.notice).toContain("skipped");

    // CI sets DB_REQUIRED=1: a missing database is a failure, never a silent
    // green run over tests that never touched a table.
    expect(() => integrationDb({ DB_REQUIRED: "1" })).toThrowError(
      /DB_REQUIRED/
    );

    // neon-http is stateless, so building the handle opens no connection --
    // which is what lets this be a unit test over a URL that resolves nowhere.
    const running = integrationDb({ DATABASE_URL: FAKE_URL });
    expect(running.mode).toBe("run");
    if (running.mode !== "run") throw new Error("expected mode run");
    expect(running.db).toBeDefined();
    expect(typeof running.db.select).toBe("function");

    // D8: `db:generate` and `db:check` run with no database at all, so the
    // config may not throw and may not carry credentials it does not have.
    delete process.env.DATABASE_URL;
    const config = (await import("../../../../drizzle.config")).default;
    expect(config.dialect).toBe("postgresql");
    expect(String(config.schema)).toMatch(
      /src\/lib\/adapters\/db\/schema\/index\.ts$/
    );
    expect(config.out).toBe("./drizzle");
    expect(config).not.toHaveProperty("dbCredentials");
  });
});
