import { asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { ParticipantId } from "@/lib/domain/participant";
import type { BlockResponse } from "@/lib/domain/quiz";
import { validateResponse } from "@/lib/domain/quiz";
import type { ResponseRepository } from "@/lib/ports/response-repository";
import type { Db } from "./client.ts";
import { participants, quizResponses } from "./schema/index.ts";

/**
 * neon-http `ResponseRepository` (docs/domain.md §7).
 *
 * `save()` upserts on (participant_id, position). When `completedAt` is given
 * -- `answer-block` passes it on the 15th distinct position -- the SAME
 * `db.batch()` also sets `participants.quiz_completed_at`, so the response and
 * the completion timestamp land together or not at all: one round trip, and no
 * participant can hold fifteen responses with no completion timestamp.
 *
 * `db.transaction()` is not an option here -- it throws on neon-http
 * (data-access skill §2) -- and a second write through the participant
 * repository would reintroduce exactly the half-written state this avoids.
 */

const RESPONSE_COLUMNS = {
  participantId: quizResponses.participantId,
  position: quizResponses.position,
  mostKey: quizResponses.mostKey,
  leastKey: quizResponses.leastKey,
  shownOrder: quizResponses.shownOrder,
  answeredAt: quizResponses.answeredAt,
};

/** A non-empty tuple of statements is what `db.batch()` accepts. */
type Batchable = readonly [BatchItem<"pg">, ...BatchItem<"pg">[]];

export function createResponseRepository(db: Db): ResponseRepository {
  return {
    async save(
      response: BlockResponse,
      opts?: { completedAt: Date }
    ): Promise<void> {
      // The domain rules first, so a response the check constraints would
      // reject never reaches a batch that also carries the completion stamp.
      validateResponse(response);

      const answer = {
        mostKey: response.mostKey,
        leastKey: response.leastKey,
        shownOrder: response.shownOrder,
        answeredAt: response.answeredAt,
      };

      // The back affordance: answering a block again updates its row rather
      // than adding a second one (docs/domain.md §3).
      const upsert = db
        .insert(quizResponses)
        .values({
          participantId: response.participantId,
          position: response.position,
          ...answer,
        })
        .onConflictDoUpdate({
          target: [quizResponses.participantId, quizResponses.position],
          set: answer,
        });

      if (!opts) {
        // The per-block upsert is the unit of write (docs/domain.md §7): one
        // statement, one round trip, no transaction wrapper around it. It must
        // not touch `quiz_completed_at` -- fourteen answered blocks are not a
        // finished quiz.
        await upsert;
        return;
      }

      const statements: Batchable = [
        upsert,
        db
          .update(participants)
          .set({ quizCompletedAt: opts.completedAt })
          .where(eq(participants.id, response.participantId)),
      ];
      await db.batch(statements);
    },

    async byParticipant(id: ParticipantId): Promise<BlockResponse[]> {
      const rows = await db
        .select(RESPONSE_COLUMNS)
        .from(quizResponses)
        .where(eq(quizResponses.participantId, id))
        .orderBy(asc(quizResponses.position));

      return rows.map((row) => ({
        participantId: row.participantId,
        position: row.position,
        mostKey: row.mostKey,
        leastKey: row.leastKey,
        shownOrder: row.shownOrder,
        answeredAt: row.answeredAt,
      }));
    },
  };
}
