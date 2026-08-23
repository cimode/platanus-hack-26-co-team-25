/**
 * quiz.ts — the twelve blocks each participant was actually shown.
 *
 * Normative sources:
 *   docs/domain.md   D15 every answer row carries its question
 *   data-access §3   uuid pk default uuidv7(), never a serial
 *   data-access §4   validators are derived, never hand-written
 *
 * A form is no longer authored: `formFor(participantId)` deals twelve of the
 * four hundred committed bank blocks, so it could in principle be recomputed on
 * every read and this table could be nothing. It is not nothing, for two
 * reasons that both outlive the bank as it stands today:
 *
 *   - `response-repository` denormalises the scenario and the chosen option
 *     texts onto the answer row from `(participant_id, position)` (D15). Edit a
 *     bank block after an evening and, without these rows, every answer already
 *     given would start describing a question nobody was asked.
 *   - `score-participant` reads its item parameters from the blocks a person
 *     was shown, not from whatever the bank holds when the scorer runs.
 *
 * `options` is jsonb rather than a child table on purpose: the four options are
 * written, read and scored as a unit, nothing ever filters on one, and the shape
 * is already pinned by `validateBlock()` before a row is written.
 */

import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Option } from "../../../domain/quiz/index.ts";
import type { BlockSource } from "../../../ports/generated-block-repository.ts";
import { participants } from "./participants.ts";

export const generatedBlocks = pgTable(
  "generated_blocks",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    /**
     * Cascades: "delete me" must take a participant's blocks with them, not
     * leave the questions they were asked behind.
     */
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** 1..12. */
    position: smallint("position").notNull(),
    /** 1..3 — `batchOf(position)`, four positions each. */
    batch: smallint("batch").notNull(),
    focusPillar: text("focus_pillar").notNull(),
    /** Scenario flavour only -- never reaches the scoring model. */
    domain: text("domain").notNull(),
    scenario: text("scenario").notNull(),
    options: jsonb("options").$type<Option[]>().notNull(),
    /** `bank` for everything written now; see the port for the two legacy values. */
    source: text("source").$type<BlockSource>().notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A participant has exactly one block per position; assigning the form
    // again is an upsert, never a second row. That is what makes the read path
    // able to heal a missing row without risking a duplicate.
    unique("generated_blocks_participant_position").on(
      table.participantId,
      table.position
    ),
    // The quiz reads one batch at a time, four blocks per query.
    index("generated_blocks_participant_batch").on(
      table.participantId,
      table.batch
    ),
  ]
);

export const insertGeneratedBlock = createInsertSchema(generatedBlocks);
export const selectGeneratedBlock = createSelectSchema(generatedBlocks);
