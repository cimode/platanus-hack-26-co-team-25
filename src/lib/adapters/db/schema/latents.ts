import { sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { participants } from "./participants.ts";

/**
 * `latent_estimates` (docs/domain.md §4, D13): four rows per scored
 * participant, one per pillar. Estimates are stored while rankings are not --
 * they are the avatar, and the timeline reads them.
 *
 * The primary key is `(participant_id, pillar)`, and that is load-bearing
 * rather than incidental: it is the upsert target that makes a second scoring
 * a no-op in row count, which is the safety invariant AC-9 pins.
 *
 * The ABSENCE of a row is a value here (AUDIT.md S15): `engine.ts` reads a
 * missing pillar as unmeasured and imputes PRIOR_MEAN 0.5 / PRIOR_SE 0.6, and
 * computes `bothMeasured` from row presence. A participant who has not
 * finished the quiz must therefore hold NO rows at all, never four near-prior
 * ones -- enforced upstream by `scoreParticipant`'s completion gate.
 */
export const latentEstimates = pgTable(
  "latent_estimates",
  {
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** One of the four pillars. Checked below -- the union has no pgEnum. */
    pillar: text("pillar").notNull(),
    /** Posterior mean on [0,1] -- Person.latents[p].mean. */
    mean: doublePrecision("mean").notNull(),
    /** Posterior SE on [0,1], strictly positive -- Person.latents[p].se. */
    se: doublePrecision("se").notNull(),
    /** The scorer that produced the row, e.g. "map-luce-v1". */
    scorerVersion: text("scorer_version").notNull(),
    /**
     * Written from the use case's `now`, never from a clock inside the
     * adapter: that is what lets "another participant's rows are unchanged in
     * every column including computed_at" be observed at all. Read back by
     * `computedAtFor` for the freshness rule (#10).
     */
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.participantId, t.pillar] }),
    check("latent_estimates_mean_range", sql`${t.mean} between 0 and 1`),
    check("latent_estimates_se_positive", sql`${t.se} > 0`),
    check(
      "latent_estimates_pillar",
      sql`${t.pillar} in ('regulation', 'politeness', 'reliability', 'agency')`
    ),
  ]
);

export const insertLatentEstimate = createInsertSchema(latentEstimates);
