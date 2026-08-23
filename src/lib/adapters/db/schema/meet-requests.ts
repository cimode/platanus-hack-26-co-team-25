import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { participants } from "./participants.ts";

/**
 * `meet_requests` — one person asking another to meet, at a named place and a
 * relative time (CONTEXT.md §5 stretch, first half).
 *
 * NOT canonicalised into `(lo, hi)` the way `pair_simulations` is, and the
 * difference matters: a simulated life is symmetric — both members are entitled
 * to the same artifact — while a request has a direction. Who asked is the
 * whole content of the row.
 *
 * The partial unique index is what keeps the button idempotent under a double
 * tap and stops one participant flooding another: at most ONE pending request
 * per ordered pair per lens. Answered rows fall out of the index, so a pair can
 * ask again after a decline — which is deliberate, because the alternative is a
 * single "no" ending a pairing for the rest of the event.
 */
export const meetRequests = pgTable(
  "meet_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lens: text("lens").notNull(),
    fromParticipant: uuid("from_participant")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    toParticipant: uuid("to_participant")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** A `MeetPlaceId`. Closed set, validated in the use case before it lands. */
    place: text("place").notNull(),
    /** A `MeetTimeId` — relative ("min30"), never a wall-clock instant. */
    time: text("time").notNull(),
    /** `pending` | `accepted` | `declined`. */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    // Nobody may ask themselves.
    check(
      "meet_requests_not_self",
      sql`${t.fromParticipant} <> ${t.toParticipant}`
    ),
    check(
      "meet_requests_status",
      sql`${t.status} in ('pending', 'accepted', 'declined')`
    ),
    // One live ask per direction per lens; answered rows leave the index.
    uniqueIndex("meet_requests_one_pending")
      .on(t.lens, t.fromParticipant, t.toParticipant)
      .where(sql`${t.status} = 'pending'`),
    // The inbox read: everything addressed to me, newest first.
    index("meet_requests_to_idx").on(t.toParticipant, t.createdAt),
    // The sent read.
    index("meet_requests_from_idx").on(t.fromParticipant, t.createdAt),
  ]
);

export const insertMeetRequest = createInsertSchema(meetRequests);
