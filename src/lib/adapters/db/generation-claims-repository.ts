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
 * A batch is measured at 40–70 s and a whole chain at under four minutes; an
 * `after()` invocation is capped at the page's `maxDuration` (300 s). A claim
 * still unreleased after 200 s belongs to an invocation that was killed or is
 * about to be, so the next caller takes it rather than waiting on a ghost.
 */
export const STALE_CLAIM_SECONDS = 200;

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
          setWhere: sql`${quizGenerationClaims.finishedAt} is not null or ${quizGenerationClaims.claimedAt} < now() - make_interval(secs => ${STALE_CLAIM_SECONDS})`,
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
