/**
 * quiz.ts — storage for per-participant generated blocks, the per-room pool of
 * pre-authored first batches, and the claims that serialise generation.
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
import type { Block, Option } from "../../../domain/quiz/index.ts";
import type { BlockSource } from "../../../ports/generated-block-repository.ts";
import { participants } from "./participants.ts";
import { rooms } from "./rooms.ts";

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

/**
 * `quiz_pool_sets` — batch-1 sets authored ahead of any participant, per room.
 *
 * Registration takes a person about a minute and authoring a batch takes
 * 40–70 s, so a participant who registers into a cold room would otherwise
 * meet a wait screen at block 1. Opening the form tops this pool up in the
 * background; registration then *adopts* one set (the oldest unclaimed) into
 * the participant's own `generated_blocks` as batch 1, and batches 2 and 3 are
 * written in the chain behind it.
 *
 * A set is the five blocks as one jsonb value because it is only ever read
 * whole, once, by the adoption statement. `claimed_by` is the adoption: set
 * atomically by one UPDATE guarded on `claimed_by IS NULL`, which is the only
 * way two registrations racing for the same set cannot both win — neon-http
 * gives no interactive transaction to do it any other way.
 */
export const quizPoolSets = pgTable(
  "quiz_pool_sets",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    /** Five `Block`s at positions 1..5, batch 1, each passing `validateBlock`. */
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    /**
     * `set null`, not cascade: a deleted participant takes their copy in
     * `generated_blocks` with them, and the set they adopted stays as the
     * record of what the room's pool produced.
     */
    claimedBy: uuid("claimed_by").references(() => participants.id, {
      onDelete: "set null",
    }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Adoption always wants "the oldest unclaimed set in this room"; the
    // partial index is exactly that query and nothing else.
    index("quiz_pool_sets_room_unclaimed")
      .on(table.roomId, table.createdAt)
      .where(sql`${table.claimedBy} is null`),
  ]
);

export const insertQuizPoolSet = createInsertSchema(quizPoolSets);
export const selectQuizPoolSet = createSelectSchema(quizPoolSets);

/**
 * `quiz_generation_claims` — who is generating what, one row per scope.
 *
 * Generation runs in `after()` on whichever invocation happened to fire it, and
 * the same participant can fire it from several requests (registration, every
 * quiz page load while pending). Without a claim two invocations would author
 * the same batch twice and spend the gateway budget twice. The scope is a
 * string (`participant:<id>:batch:<n>`, `pool:<roomId>:<k>`) rather than two
 * columns because the claim is one INSERT ... ON CONFLICT statement and the
 * primary key is the whole lock.
 *
 * `finished_at` / `outcome` are what make a claim re-claimable: a finished
 * batch may legitimately need regenerating (the rows were fallbacks, or were
 * deleted), and a claim older than the takeover window with no finish is a
 * crashed invocation, not a busy one.
 */
export const quizGenerationClaims = pgTable("quiz_generation_claims", {
  scope: text("scope").primaryKey(),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** `ready` or `failed`; null while the claim is held. */
  outcome: text("outcome").$type<"ready" | "failed">(),
});

export const insertQuizGenerationClaim =
  createInsertSchema(quizGenerationClaims);
