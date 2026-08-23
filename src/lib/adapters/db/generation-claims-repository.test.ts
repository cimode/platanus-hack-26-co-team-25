import { randomUUID } from "node:crypto";
import { eq, like, sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import type { Db } from "./client";
import {
  createGenerationClaimsRepository,
  FAILED_COOLDOWN_SECONDS,
} from "./generation-claims-repository";
import { quizGenerationClaims } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http `GenerationClaims`: one INSERT ... ON CONFLICT per claim, one
 * UPDATE per release. Integration tests, guarded by ./test-db.ts; every scope
 * carries this run's id and is deleted on teardown.
 *
 * What is asserted is the lock's contract, not its SQL: a held scope is lost
 * by a second caller, a scope released as `ready` is won again (a finished
 * batch can need regenerating), a scope released as `failed` rests for its
 * cooldown first, a stale scope is taken over, and two callers racing for a
 * free scope produce exactly one winner.
 */

type Repos = Pick<Deps, "claims">;

function requireDb(ctx: TestContext): Db {
  const guard = integrationDb(process.env);
  if (guard.mode === "skip") {
    console.warn(guard.notice);
    ctx.skip(guard.notice);
  }
  return guard.db;
}

function repositories(db: Db): Repos {
  return { claims: createGenerationClaimsRepository(db) };
}

/** A scope prefix of this run's own; teardown deletes everything under it. */
function runScope(db: Db): (name: string) => string {
  const prefix = `it-${randomUUID().slice(0, 8)}`;
  onTestFinished(async () => {
    await db
      .delete(quizGenerationClaims)
      .where(like(quizGenerationClaims.scope, `${prefix}%`));
  });
  return (name) => `${prefix}:${name}`;
}

describe("createGenerationClaimsRepository", () => {
  it("wins a free scope, loses a held one, and wins it again once released", async (ctx) => {
    const db = requireDb(ctx);
    const { claims } = repositories(db);
    const scope = runScope(db)("participant:x:batch:1");

    expect(await claims.claim(scope)).toBe(true);
    // Held: the same statement from anyone else matches nothing.
    expect(await claims.claim(scope)).toBe(false);

    await claims.release(scope, "ready");
    const [row] = await db
      .select({
        outcome: quizGenerationClaims.outcome,
        finishedAt: quizGenerationClaims.finishedAt,
      })
      .from(quizGenerationClaims)
      .where(eq(quizGenerationClaims.scope, scope));
    expect(row?.outcome).toBe("ready");
    expect(row?.finishedAt).not.toBeNull();

    // Re-claimable, and re-claiming clears the previous outcome.
    expect(await claims.claim(scope)).toBe(true);
    const [held] = await db
      .select({
        outcome: quizGenerationClaims.outcome,
        finishedAt: quizGenerationClaims.finishedAt,
      })
      .from(quizGenerationClaims)
      .where(eq(quizGenerationClaims.scope, scope));
    expect(held?.outcome).toBeNull();
    expect(held?.finishedAt).toBeNull();

    // A failed attempt rests: the wait screen asks again within seconds, and
    // re-arming immediately is how a failing room becomes a retry storm.
    await claims.release(scope, "failed");
    expect(await claims.claim(scope)).toBe(false);

    // Once the cooldown has passed, the next caller may try again.
    await db
      .update(quizGenerationClaims)
      .set({
        finishedAt: sql`now() - make_interval(secs => ${FAILED_COOLDOWN_SECONDS + 5})`,
      })
      .where(eq(quizGenerationClaims.scope, scope));
    expect(await claims.claim(scope)).toBe(true);
  });

  it("takes over a claim whose holder went stale", async (ctx) => {
    const db = requireDb(ctx);
    const { claims } = repositories(db);
    const scope = runScope(db)("pool:room:0");

    expect(await claims.claim(scope)).toBe(true);
    expect(await claims.claim(scope)).toBe(false);

    // The holder died 5 minutes ago without releasing.
    await db
      .update(quizGenerationClaims)
      .set({ claimedAt: sql`now() - interval '300 seconds'` })
      .where(eq(quizGenerationClaims.scope, scope));

    expect(await claims.claim(scope)).toBe(true);
    // ... and the takeover refreshed the timestamp, so it is held again.
    expect(await claims.claim(scope)).toBe(false);
  });

  it("gives exactly one winner to concurrent callers", async (ctx) => {
    const db = requireDb(ctx);
    const { claims } = repositories(db);
    const scope = runScope(db)("participant:y:batch:2");

    const results = await Promise.all(
      Array.from({ length: 4 }, () => claims.claim(scope))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
