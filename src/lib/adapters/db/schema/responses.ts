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
  ]
);

export const insertQuizResponse = createInsertSchema(quizResponses);
