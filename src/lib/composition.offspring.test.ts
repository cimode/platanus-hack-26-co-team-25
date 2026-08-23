import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "./adapters/db/client";
import { serverDeps } from "./composition";

/**
 * The composition root's `offspring` member (CONTEXT.md §3 step 6): the OpenAI
 * studio when `OPENAI_API_KEY` is set, the fake otherwise — the same
 * one-variable switch `photos` uses.
 *
 * Reading `.offspring` must open no database connection: it is a getter that
 * builds an adapter and nothing more, so the read is exercised with
 * `DATABASE_URL` dropped (and the memoised handle reset), and a database-backed
 * member is used as the control — it throws in the same environment, proving
 * `.offspring` never reached for one. The environment is mutated with `delete`
 * and restored in `afterEach`, as `adapters/db/client.test.ts` does.
 */

const saved = {
  key: process.env.OPENAI_API_KEY,
  databaseUrl: process.env.DATABASE_URL,
};

afterEach(() => {
  for (const [name, value] of [
    ["OPENAI_API_KEY", saved.key],
    ["DATABASE_URL", saved.databaseUrl],
  ] as const) {
    delete process.env[name];
    if (value !== undefined) process.env[name] = value;
  }
  resetDb();
});

describe("serverDeps().offspring", () => {
  it("is a studio with an imagine() function and opens no database connection", () => {
    process.env.OPENAI_API_KEY = "sk-test-ignored";
    delete process.env.DATABASE_URL;
    resetDb();

    const deps = serverDeps();
    expect(typeof deps.offspring.imagine).toBe("function");

    // The control: a database-backed member throws in this same environment.
    expect(() => deps.db).toThrowError(/DATABASE_URL/);
  });

  it("still resolves to a studio when OPENAI_API_KEY is absent (the fake)", () => {
    delete process.env.OPENAI_API_KEY;

    const deps = serverDeps();
    expect(typeof deps.offspring.imagine).toBe("function");
  });
});
