/**
 * generation-claims-repository.ts — Drizzle implementation of the port.
 *
 * Both operations are ONE statement each, on purpose. neon-http has no
 * interactive transactions (`data-access` §2), so a lock that needed "read,
 * then write if free" would be a race by construction. Postgres evaluates an
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE` atomically against the row it
 * conflicts with, and `RETURNING` names the winner: a row back means the
 * insert landed or the conditional update fired, and either way this caller
 * owns the scope.
 */

import { eq, sql } from "drizzle-orm";

import type { GenerationClaims } from "../../ports/generation-claims.ts";
import type { Db } from "./client";
import { quizGenerationClaims } from "./schema/quiz";

/**
 * How long a held claim is trusted before it is assumed dead.
 *
 * A batch is measured at 40–70 s and bounded by `DEADLINE_MS` in
 * `generate-quiz-batch.ts` (200 s), so a live batch always releases before
 * this. An `after()` invocation is capped at the page's `maxDuration` (300 s).
 * A claim still unreleased after 240 s belongs to an invocation that was
 * killed, so the next caller takes it rather than waiting on a ghost.
 *
 * The ordering is load-bearing: DEADLINE_MS < STALE_CLAIM_SECONDS <
 * maxDuration. Below the batch's own deadline and two writers author the same
 * five blocks; above maxDuration and a killed invocation's claim is never
 * retaken.
 */
export const STALE_CLAIM_SECONDS = 240;

/**
 * How long a scope rests after an attempt that FAILED.
 *
 * Without it a failing room is a hot loop: the chain releases `failed`, the
 * wait screen asks again 3 s later, the claim is granted again, and up to nine
 * gateway attempts start — for every participant at once, which is exactly the
 * load that made the batch fail. Twenty seconds turns that into one attempt
 * per participant per twenty seconds and lets the gateway drain.
 *
 * A claim released as `ready` has no cooldown: it means the rows are there,
 * and the next caller re-claims only to write a batch that is genuinely
 * missing (a legacy fallback row, say).
 */
export const FAILED_COOLDOWN_SECONDS = 20;

export function createGenerationClaimsRepository(db: Db): GenerationClaims {
  return {
    async claim(scope) {
      const rows = await db
        .insert(quizGenerationClaims)
        .values({ scope })
        .onConflictDoUpdate({
          target: quizGenerationClaims.scope,
          set: { claimedAt: sql`now()`, finishedAt: null, outcome: null },
          // The row's own columns, not `excluded`: a claim is retaken only
          // when its holder finished or went stale.
          // Three ways in: the holder finished well, the holder failed and its
          // cooldown has passed, or the holder went stale (was killed).
          setWhere: sql`(${quizGenerationClaims.finishedAt} is not null and (${quizGenerationClaims.outcome} is distinct from 'failed' or ${quizGenerationClaims.finishedAt} < now() - make_interval(secs => ${FAILED_COOLDOWN_SECONDS}))) or ${quizGenerationClaims.claimedAt} < now() - make_interval(secs => ${STALE_CLAIM_SECONDS})`,
        })
        .returning({ scope: quizGenerationClaims.scope });
      return rows.length > 0;
    },

    async release(scope, outcome) {
      await db
        .update(quizGenerationClaims)
        .set({ finishedAt: sql`now()`, outcome })
        .where(eq(quizGenerationClaims.scope, scope));
    },
  };
}
