import { afterEach, describe, expect, it } from "vitest";
import { createDb, getDb, resetDb } from "./client";

const FAKE_URL =
  "postgresql://user:pw@ep-fake-123.us-east-2.aws.neon.tech/dipia?sslmode=require";

afterEach(() => {
  resetDb();
  // `delete`, not `= undefined`: assigning undefined to process.env
  // coerces to the literal string "undefined" in Node.
  delete process.env.DATABASE_URL;
});

describe("createDb", () => {
  it("builds a handle without opening a connection", () => {
    // neon-http is stateless: no socket is opened until a query runs, which is
    // what lets this be a unit test rather than an integration test.
    expect(() => createDb(FAKE_URL)).not.toThrow();
  });
});

describe("getDb", () => {
  it("explains itself when DATABASE_URL is missing", () => {
    // The message matters more than the throw. A bare "undefined is not a
    // string" at hour 30 costs someone ten minutes.
    expect(() => getDb()).toThrowError(/DATABASE_URL is not set/);
  });

  it("memoises the handle across calls", () => {
    process.env.DATABASE_URL = FAKE_URL;
    expect(getDb()).toBe(getDb());
  });

  it("picks up a new URL after resetDb", () => {
    process.env.DATABASE_URL = FAKE_URL;
    const first = getDb();
    resetDb();
    expect(getDb()).not.toBe(first);
  });
});
