import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { optionKey } from "./enums.ts";
import { participants } from "./participants.ts";

/**
 * `quiz_responses` (docs/domain.md §3): one row per (participant, block). A
 * participant answers a block once; re-answering through the back affordance is
 * an update, not a second row. The keys refer to the room's instrument version.
 *
 * The row is also self-describing (D15's surviving half, read under D16): it
 * carries the scenario and the two option texts it answered, resolved at write
 * time from THAT participant's `generated_blocks(participant_id, position)`
 * row -- never from the fallback constant, which under D16 is not what most
 * people were shown. Without these columns an answer's question is unreadable
 * in SQL, and a regenerated block would silently rewrite history.
 *
 * `pillar` and `keyed` stay inside `generated_blocks.options` (§10.1): an
 * answer row carrying them would put the scoring key in front of anyone reading
 * the data.
 */
export const quizResponses = pgTable(
  "quiz_responses",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    mostKey: optionKey("most_key").notNull(),
    /** Null under the single-pick fallback. */
    leastKey: optionKey("least_key"),
    shownOrder: text("shown_order").notNull(),
    /**
     * The STRUCTURAL version (D16): 15 positions, the 4/4/4/3 rotation, four
     * pillars once each, one reversed on the focus pillar. Not the scenarios --
     * those vary per participant and are captured below.
     */
    instrumentVersion: text("instrument_version").notNull(),
    /** This participant's block-`position` scenario, as it was answered. */
    scenario: text("scenario").notNull(),
    /** The text of the option `most_key` named, in that block. */
    mostText: text("most_text").notNull(),
    /** Null exactly when `least_key` is (the single-pick fallback). */
    leastText: text("least_text"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("quiz_responses_participant_position").on(
      t.participantId,
      t.position
    ),
    check("quiz_responses_position", sql`${t.position} between 1 and 15`),
    check(
      "quiz_responses_least_not_most",
      sql`${t.leastKey} is null or ${t.leastKey} <> ${t.mostKey}`
    ),
    check("quiz_responses_shown_order", sql`length(${t.shownOrder}) = 4`),
    // A key with no text (or a text with no key) is a half-resolved write: the
    // row would claim an answer whose question cannot be read back.
    check(
      "quiz_responses_least_text_with_key",
      sql`(${t.leastKey} is null) = (${t.leastText} is null)`
    ),
  ]
);

export const insertQuizResponse = createInsertSchema(quizResponses);
