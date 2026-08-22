import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { rooms } from "./rooms.ts";

/**
 * `participants` (docs/domain.md §3): a row that fills in left to right over
 * ~8 minutes. There is deliberately NO status / step / progress column --
 * progress is read from the rows themselves (§0, §5), so the database can never
 * claim a state the data does not support.
 *
 * Consent is opt-OUT by default on all three lenses (CONTEXT.md §7.3): the
 * romantic lens ranks real people in public, so nobody is opted in by a default.
 */
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Null until uploaded; part of the §0 floor. */
    photoUrl: text("photo_url"),
    team: text("team"),
    track: text("track"),
    consentRomantic: boolean("consent_romantic").notNull().default(false),
    consentBusiness: boolean("consent_business").notNull().default(false),
    consentFriendship: boolean("consent_friendship").notNull().default(false),
    moneyPosture: smallint("money_posture"),
    rootedness: smallint("rootedness"),
    familyGravity: smallint("family_gravity"),
    capacityHoursBand: smallint("capacity_hours_band"),
    distanceBand: smallint("distance_band"),
    chronotype: smallint("chronotype"),
    tags: text("tags").array().notNull().default([]),
    /** Set when the declared round is complete; part of the §0 floor. */
    declaredAt: timestamp("declared_at", { withTimezone: true }),
    /** Set on block 15; also the arrival-cohort timestamp (PILLARS.md §2). */
    quizCompletedAt: timestamp("quiz_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("participants_room_id_idx").on(t.roomId),
    check("participants_name_length", sql`length(${t.name}) between 1 and 80`),
    check(
      "participants_money_posture_band",
      sql`${t.moneyPosture} is null or ${t.moneyPosture} between 0 and 3`
    ),
    check(
      "participants_rootedness_band",
      sql`${t.rootedness} is null or ${t.rootedness} between 0 and 3`
    ),
    check(
      "participants_family_gravity_band",
      sql`${t.familyGravity} is null or ${t.familyGravity} between 0 and 3`
    ),
    check(
      "participants_capacity_hours_band",
      sql`${t.capacityHoursBand} is null or ${t.capacityHoursBand} between 0 and 3`
    ),
    check(
      "participants_distance_band",
      sql`${t.distanceBand} is null or ${t.distanceBand} between 0 and 3`
    ),
    check(
      "participants_chronotype_band",
      sql`${t.chronotype} is null or ${t.chronotype} between 0 and 3`
    ),
    check("participants_tags_cap", sql`cardinality(${t.tags}) <= 12`),
    check(
      "participants_declared_complete",
      sql`${t.declaredAt} is null or (
        ${t.moneyPosture} is not null and
        ${t.rootedness} is not null and
        ${t.familyGravity} is not null and
        ${t.capacityHoursBand} is not null and
        ${t.distanceBand} is not null and
        ${t.chronotype} is not null
      )`
    ),
  ]
);

export const insertParticipant = createInsertSchema(participants);

/**
 * `participant_sessions` (docs/domain.md §3, D4): the credential, kept out of
 * the aggregate. Its own table means no read of `participants` can return it
 * structurally -- not by convention.
 */
export const participantSessions = pgTable("participant_sessions", {
  token: uuid("token").primaryKey().default(sql`gen_random_uuid()`),
  participantId: uuid("participant_id")
    .notNull()
    .unique()
    .references(() => participants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertParticipantSession = createInsertSchema(participantSessions);

/**
 * `acquaintances` (docs/domain.md §3): the capped declared list backing
 * PILLARS.md §2 Structural Proximity. The cap of 5 is enforced in the use case.
 */
export const acquaintances = pgTable(
  "acquaintances",
  {
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    knowsId: uuid("knows_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.knowsId] }),
    check("acquaintances_not_self", sql`${t.participantId} <> ${t.knowsId}`),
  ]
);

export const insertAcquaintance = createInsertSchema(acquaintances);
