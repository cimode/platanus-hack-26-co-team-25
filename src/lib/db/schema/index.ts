/**
 * The schema barrel. Every table, enum and relation is re-exported from here,
 * because this is the single entry point `drizzle.config.ts` follows and the
 * single object handed to `drizzle(client, { schema })`.
 *
 * As the domain lands, add one file per aggregate -- `participants.ts`,
 * `quiz.ts`, `matches.ts` -- and re-export it below. Keep tables in the file
 * that owns them; keep this file nothing but re-exports.
 *
 * Two conventions worth agreeing on before the first table exists:
 *
 *   1. Derive validators, never hand-write them. `drizzle-zod` turns a table
 *      into zod 4 schemas, which is the same library `LlmPort` already
 *      validates model output with:
 *
 *        import { createInsertSchema, createSelectSchema } from "drizzle-zod";
 *        export const insertParticipant = createInsertSchema(participants);
 *
 *      A hand-written zod schema next to a table is a schema that will drift.
 *
 *   2. Relations changed shape across drizzle versions. Read
 *      `node_modules/drizzle-orm/relations.d.ts` before writing `relations()`
 *      rather than working from memory -- same discipline AGENTS.md demands
 *      for Next.
 */

// No tables yet -- the domain model is still being settled. `drizzle-kit push`
// against an empty schema is a no-op rather than an error, so this is safe to
// commit as-is.
export {};
