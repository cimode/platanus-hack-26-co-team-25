import { and, asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { ParticipantId } from "@/lib/domain/participant";
import type { BlockResponse, Option, OptionKey } from "@/lib/domain/quiz";
import { INSTRUMENT, validateResponse } from "@/lib/domain/quiz";
import type { ResponseRepository } from "@/lib/ports/response-repository";
import type { Db } from "./client.ts";
import {
  generatedBlocks,
  participants,
  quizResponses,
} from "./schema/index.ts";

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
 *
 * `save()` also denormalises the question onto the answer row (D15's surviving
 * half): `scenario`, `most_text` and `least_text` come from THAT participant's
 * `generated_blocks(participant_id, position)` row, read here in the adapter
 * because it is the same handle and the resolution is a storage concern -- the
 * domain type stays keys-only (§10.1). The read cannot join the write: a
 * `db.batch()` is non-interactive (data-access §3), so nothing inside it can
 * consume another statement's rows.
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

/** What the answer row records about the question, beside the keys. */
interface ResolvedTexts {
  instrumentVersion: string;
  scenario: string;
  mostText: string;
  leastText: string | null;
}

function textOf(
  options: Option[],
  key: OptionKey,
  response: BlockResponse
): string {
  const option = options.find((candidate) => candidate.key === key);
  if (!option) {
    throw new Error(
      `response: participant ${response.participantId} block at position ` +
        `${response.position} offers no option "${key}" -- it cannot have ` +
        `been answered with one`
    );
  }
  return option.text;
}

/**
 * The question this answer answers, read from the participant's own generated
 * block. Missing block, or a key that block never offered, is a bug in the
 * caller and not a degraded mode: writing the answer anyway would leave a row
 * whose question nothing can recover.
 */
async function resolveTexts(
  db: Db,
  response: BlockResponse
): Promise<ResolvedTexts> {
  const [block] = await db
    .select({
      scenario: generatedBlocks.scenario,
      options: generatedBlocks.options,
    })
    .from(generatedBlocks)
    .where(
      and(
        eq(generatedBlocks.participantId, response.participantId),
        eq(generatedBlocks.position, response.position)
      )
    )
    .limit(1);

  if (!block) {
    throw new Error(
      `response: participant ${response.participantId} has no generated block ` +
        `at position ${response.position} -- an answer to a block nobody was ` +
        `shown is a bug, not a degraded mode`
    );
  }

  return {
    // The STRUCTURAL version (D16): what every participant's form shares. The
    // scenarios are per person, and that is what the next two fields carry.
    instrumentVersion: INSTRUMENT.version,
    scenario: block.scenario,
    mostText: textOf(block.options, response.mostKey, response),
    leastText:
      response.leastKey === null
        ? null
        : textOf(block.options, response.leastKey, response),
  };
}

export function createResponseRepository(db: Db): ResponseRepository {
  return {
    async save(
      response: BlockResponse,
      opts?: { completedAt: Date }
    ): Promise<void> {
      // The domain rules first, so a response the check constraints would
      // reject never reaches a batch that also carries the completion stamp.
      validateResponse(response);

      // Resolved before the write, and the write is abandoned when it throws:
      // an answer row without its question is exactly what this issue exists
      // to prevent.
      const texts = await resolveTexts(db, response);

      const answer = {
        mostKey: response.mostKey,
        leastKey: response.leastKey,
        shownOrder: response.shownOrder,
        answeredAt: response.answeredAt,
        // On a re-answer the texts move with the keys, or the row would
        // describe an answer nobody gave.
        ...texts,
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
