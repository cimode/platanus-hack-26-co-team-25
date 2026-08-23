import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { participants } from "./participants.ts";

/**
 * `pair_simulations` (issue #34): one cached narrative per canonical pair and
 * lens. Rankings stay ephemeral (D13); a generated life is an expensive artifact
 * both members are entitled to see identically.
 */
export const pairSimulations = pgTable(
  "pair_simulations",
  {
    lens: text("lens").notNull(),
    participantLo: uuid("participant_lo")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    participantHi: uuid("participant_hi")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** Canonical `SimulatedLife` — `subject` is always `participant_lo`. */
    life: jsonb("life").notNull(),
    scorerVersion: text("scorer_version").notNull(),
    loComputedAt: timestamp("lo_computed_at", { withTimezone: true }).notNull(),
    hiComputedAt: timestamp("hi_computed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.lens, t.participantLo, t.participantHi],
    }),
    check(
      "pair_simulations_order",
      sql`${t.participantLo} < ${t.participantHi}`
    ),
  ]
);

export const insertPairSimulation = createInsertSchema(pairSimulations);
