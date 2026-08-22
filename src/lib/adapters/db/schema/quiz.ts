/**
 * quiz.ts — storage for per-participant generated blocks.
 *
 * Normative sources:
 *   docs/domain.md   D15 each participant gets their own generated form
 *   data-access §3   uuid pk default uuidv7(), never a serial
 *   data-access §4   validators are derived, never hand-written
 *
 * Under D15 the instrument is authored live, per person, so the blocks a
 * participant answered are not derivable from anything in the repo — they exist
 * only here. That makes this table the record of what each person was actually
 * asked, which scoring and any later audit both depend on.
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

import { participants } from "./participants.ts";

import type { Option } from "../../../domain/quiz/index.ts";
import type { BlockSource } from "../../../ports/generated-block-repository.ts";

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
    /** 1..15. */
    position: smallint("position").notNull(),
    /** 1..3. */
    batch: smallint("batch").notNull(),
    focusPillar: text("focus_pillar").notNull(),
    /** Scenario flavour only -- never reaches the scoring model. */
    domain: text("domain").notNull(),
    scenario: text("scenario").notNull(),
    options: jsonb("options").$type<Option[]>().notNull(),
    source: text("source").$type<BlockSource>().notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A participant has exactly one block per position; regenerating is an
    // upsert, never a second row. This is also what makes a resumed generation
    // idempotent after a crashed run.
    unique("generated_blocks_participant_position").on(
      table.participantId,
      table.position
    ),
    // The quiz reads one batch at a time.
    index("generated_blocks_participant_batch").on(
      table.participantId,
      table.batch
    ),
  ]
);

export const insertGeneratedBlock = createInsertSchema(generatedBlocks);
export const selectGeneratedBlock = createSelectSchema(generatedBlocks);
