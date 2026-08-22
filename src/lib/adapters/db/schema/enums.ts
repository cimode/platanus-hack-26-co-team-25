import { pgEnum } from "drizzle-orm/pg-core";

/**
 * The only two enums the database holds (docs/domain.md §3). Pillars, keying
 * and lenses are TypeScript unions -- nothing stores them.
 */
export const gender = pgEnum("gender", ["M", "F", "NB"]);
export const optionKey = pgEnum("option_key", ["a", "b", "c", "d"]);
