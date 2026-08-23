/**
 * quiz-pool-repository.ts — Drizzle implementation of the port.
 *
 * Rules this obeys (`data-access`):
 *   §1  returns domain `Block`s, never Drizzle rows
 *   §2  never `db.transaction()` — adoption is one guarded UPDATE instead
 *   §5  selects the columns it needs; `select *` is billed egress on Neon
 */

import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";

import type { Block } from "../../domain/quiz/index.ts";
import type { QuizPoolRepository } from "../../ports/quiz-pool.ts";
import type { Db } from "./client";
import { participants } from "./schema/participants";
import { generatedBlocks, quizPoolSets } from "./schema/quiz";

export function createQuizPoolRepository(db: Db): QuizPoolRepository {
  async function unclaimedCount(roomId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(quizPoolSets)
      .where(
        and(eq(quizPoolSets.roomId, roomId), isNull(quizPoolSets.claimedBy))
      );
    return row?.n ?? 0;
  }

  /**
   * One statement: pick the oldest unclaimed set in a subquery and claim it,
   * guarded on `claimed_by IS NULL` again at the outer level so two callers
   * that picked the same row cannot both update it — the second sees the
   * first's write and matches nothing.
   */
  async function tryAdopt(
    roomId: string,
    participantId: string
  ): Promise<Block[] | null> {
    const oldestUnclaimed = sql`(select ${quizPoolSets.id} from ${quizPoolSets} where ${quizPoolSets.roomId} = ${roomId} and ${quizPoolSets.claimedBy} is null order by ${quizPoolSets.createdAt} asc limit 1)`;
    const rows = await db
      .update(quizPoolSets)
      .set({ claimedBy: participantId, claimedAt: sql`now()` })
      .where(
        and(
          eq(quizPoolSets.id, oldestUnclaimed),
          isNull(quizPoolSets.claimedBy)
        )
      )
      .returning({ blocks: quizPoolSets.blocks });
    return rows[0]?.blocks ?? null;
  }

  return {
    async add(roomId, blocks) {
      await db.insert(quizPoolSets).values({ roomId, blocks });
    },

    async adopt(roomId, participantId) {
      const first = await tryAdopt(roomId, participantId);
      if (first) return first;
      // Zero rows means either an empty pool or a lost race on the set the
      // subquery picked. Only the second deserves another go.
      if ((await unclaimedCount(roomId)) === 0) return null;
      return tryAdopt(roomId, participantId);
    },

    unclaimedCount,

    async recentScenarios(roomId, limit) {
      if (limit <= 0) return [];
      const [blockRows, setRows] = await Promise.all([
        db
          .select({
            scenario: generatedBlocks.scenario,
            createdAt: generatedBlocks.createdAt,
          })
          .from(generatedBlocks)
          .innerJoin(
            participants,
            eq(participants.id, generatedBlocks.participantId)
          )
          // Fallback rows are the committed instrument, the same fifteen for
          // everyone; listing them would crowd the newest real scenarios out.
          .where(
            and(
              eq(participants.roomId, roomId),
              ne(generatedBlocks.source, "fallback")
            )
          )
          .orderBy(desc(generatedBlocks.createdAt))
          .limit(limit),
        db
          .select({
            blocks: quizPoolSets.blocks,
            createdAt: quizPoolSets.createdAt,
          })
          .from(quizPoolSets)
          .where(eq(quizPoolSets.roomId, roomId))
          .orderBy(desc(quizPoolSets.createdAt))
          // A set holds at least five; enough sets to fill the limit on their own.
          .limit(Math.ceil(limit / 5)),
      ]);

      const dated: { scenario: string; at: number }[] = [
        ...blockRows.map((row) => ({
          scenario: row.scenario,
          at: row.createdAt.getTime(),
        })),
        ...setRows.flatMap((row) =>
          row.blocks.map((block) => ({
            scenario: block.scenario,
            at: row.createdAt.getTime(),
          }))
        ),
      ];
      dated.sort((a, b) => b.at - a.at);
      return dated.slice(0, limit).map((entry) => entry.scenario);
    },
  };
}
