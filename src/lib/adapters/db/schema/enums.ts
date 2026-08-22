import { pgEnum } from "drizzle-orm/pg-core";

/**
 * The only two enums the database holds (docs/domain.md §3). Keying and lenses
 * are TypeScript unions with no column behind them; pillars ARE stored, as
 * `latent_estimates.pillar` -- a `text` column with a check constraint rather
 * than a pgEnum, because adding a value to an enum type is a migration and
 * `generated_blocks.focus_pillar` already spells the same four names that way.
 */
export const gender = pgEnum("gender", ["M", "F", "NB"]);
export const optionKey = pgEnum("option_key", ["a", "b", "c", "d"]);
