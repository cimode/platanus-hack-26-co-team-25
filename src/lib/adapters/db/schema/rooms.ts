import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

/**
 * `rooms` (docs/domain.md §3, D9): the isolation boundary between the demo's
 * real responses and anything automated. `instrument_version` records which
 * instrument the room administered, so an edited instrument needs a new room.
 */
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  instrumentVersion: text("instrument_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Derived, never hand-written (data-access skill hard rule 6). */
export const insertRoom = createInsertSchema(rooms);
