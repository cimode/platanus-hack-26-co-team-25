/**
 * generated-block-repository.ts — Drizzle implementation of the port.
 *
 * Rules this obeys (`data-access`):
 *   §1  returns domain `Block`s, never Drizzle rows
 *   §2  never `db.transaction()` — it throws on the neon-http driver
 *   §5  selects the columns it needs; `select *` is billed egress on Neon
 */

import { and, asc, eq, sql } from "drizzle-orm";

import type { Block, Option } from "../../domain/quiz/index.ts";
import type {
  BlockSource,
  GeneratedBlockRepository,
  StoredBlock,
} from "../../ports/generated-block-repository.ts";
import type { Db } from "./client";
import { generatedBlocks } from "./schema/quiz";

/** The five columns a `Block` is rebuilt from, and nothing else. */
const COLUMNS = {
  position: generatedBlocks.position,
  batch: generatedBlocks.batch,
  focusPillar: generatedBlocks.focusPillar,
  domain: generatedBlocks.domain,
  scenario: generatedBlocks.scenario,
  options: generatedBlocks.options,
  source: generatedBlocks.source,
};

interface Row {
  position: number;
  batch: number;
  focusPillar: string;
  domain: string;
  scenario: string;
  options: Option[];
  source: BlockSource;
}

function toStored(row: Row): StoredBlock {
  return {
    block: {
      position: row.position,
      batch: row.batch,
      focusPillar: row.focusPillar as Block["focusPillar"],
      domain: row.domain,
      scenario: row.scenario,
      options: row.options,
    },
    source: row.source,
  };
}

export function createGeneratedBlockRepository(
  db: Db
): GeneratedBlockRepository {
  return {
    async byBatch(participantId, batch) {
      const rows = await db
        .select(COLUMNS)
        .from(generatedBlocks)
        .where(
          and(
            eq(generatedBlocks.participantId, participantId),
            eq(generatedBlocks.batch, batch)
          )
        )
        .orderBy(asc(generatedBlocks.position));
      return rows.map(toStored);
    },

    async byParticipant(participantId) {
      const rows = await db
        .select(COLUMNS)
        .from(generatedBlocks)
        .where(eq(generatedBlocks.participantId, participantId))
        .orderBy(asc(generatedBlocks.position));
      return rows.map(toStored);
    },

    async saveBatch(participantId, blocks) {
      if (blocks.length === 0) return;
      // One multi-row INSERT rather than a batch of five: a single statement is
      // already atomic, and it is one HTTP round trip on neon-http instead of
      // the driver replaying five.
      await db
        .insert(generatedBlocks)
        .values(
          blocks.map(({ block, source }) => ({
            participantId,
            position: block.position,
            batch: block.batch,
            focusPillar: block.focusPillar,
            domain: block.domain,
            scenario: block.scenario,
            options: block.options,
            source,
          }))
        )
        // A retried batch must not violate the unique index, so the conflict
        // is an update -- but only over a row nobody authored for this person.
        //
        // `setWhere` is the guard, and it is not defensive coding: a claim can
        // be taken over (a killed invocation), so two writers can hold the
        // same batch, and the loser's write would otherwise replace a block
        // that is already ON SOMEONE'S SCREEN. The response row denormalises
        // the question text when the tap lands, so the participant's answer
        // would be recorded against a question they never read. An existing
        // generated row is therefore final; only the legacy `fallback` rows
        // -- the committed instrument, never written for this person -- are
        // replaced (docs/domain.md D20).
        .onConflictDoUpdate({
          target: [generatedBlocks.participantId, generatedBlocks.position],
          // `excluded` is the row that was proposed. Naming the table's own
          // columns here would set each column to the value it already has,
          // which is a silent no-op rather than an overwrite.
          set: {
            batch: sql`excluded.batch`,
            focusPillar: sql`excluded.focus_pillar`,
            domain: sql`excluded.domain`,
            scenario: sql`excluded.scenario`,
            options: sql`excluded.options`,
            source: sql`excluded.source`,
          },
          setWhere: sql`${generatedBlocks.source} = 'fallback'`,
        });
    },
  };
}
