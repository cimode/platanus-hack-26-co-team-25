/**
 * The schema barrel. Every table, enum and relation is re-exported from here,
 * because this is the single entry point `drizzle.config.ts` follows and the
 * single object handed to `drizzle(client, { schema })`.
 *
 * One file per aggregate; keep tables in the file that owns them and keep this
 * file nothing but re-exports.
 *
 * Two conventions:
 *
 *   1. Derive validators, never hand-write them. `drizzle-zod` turns a table
 *      into zod 4 schemas, which is the same library `LlmPort` already
 *      validates model output with. Every table exports its `insertX` beside
 *      it (data-access skill hard rule 6).
 *
 *   2. Relations changed shape across drizzle versions. Read
 *      `node_modules/drizzle-orm/relations.d.ts` before writing `relations()`
 *      rather than working from memory -- same discipline AGENTS.md demands
 *      for Next.
 */
export * from "./enums.ts";
export * from "./gates.ts";
export * from "./latents.ts";
export * from "./meet-requests.ts";
export * from "./pair-simulations.ts";
export * from "./participants.ts";
export * from "./quiz.ts";
export * from "./responses.ts";
export * from "./rooms.ts";
