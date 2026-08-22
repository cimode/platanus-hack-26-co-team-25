import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  smallint,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { gender } from "./enums.ts";
import { participants } from "./participants.ts";

/**
 * `romantic_gates` (docs/domain.md §3, D5): one row means the participant
 * answered the romantic gates. No row means they were never asked -- asking is
 * itself a disclosure event (PILLARS.md A8), so gender and orientation are
 * asked only of people who consented to this lens.
 */
export const romanticGates = pgTable(
  "romantic_gates",
  {
    participantId: uuid("participant_id")
      .primaryKey()
      .references(() => participants.id, { onDelete: "cascade" }),
    gender: gender("gender").notNull(),
    interestedIn: gender("interested_in").array().notNull(),
    single: boolean("single").notNull(),
    ageBand: smallint("age_band").notNull(),
    /** Desire only; timing was cut (AUDIT.md S11). */
    wantsKids: boolean("wants_kids").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "romantic_gates_interested_in_nonempty",
      sql`cardinality(${t.interestedIn}) >= 1`
    ),
    check("romantic_gates_age_band", sql`${t.ageBand} between 0 and 3`),
  ]
);

export const insertRomanticGate = createInsertSchema(romanticGates);

/** `business_gates` (docs/domain.md §3, D5): risk and exit are 0..2 bands. */
export const businessGates = pgTable(
  "business_gates",
  {
    participantId: uuid("participant_id")
      .primaryKey()
      .references(() => participants.id, { onDelete: "cascade" }),
    riskPosture: smallint("risk_posture").notNull(),
    exitHorizon: smallint("exit_horizon").notNull(),
    redlinesOk: boolean("redlines_ok").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("business_gates_risk_posture", sql`${t.riskPosture} between 0 and 2`),
    check("business_gates_exit_horizon", sql`${t.exitHorizon} between 0 and 2`),
  ]
);

export const insertBusinessGate = createInsertSchema(businessGates);
