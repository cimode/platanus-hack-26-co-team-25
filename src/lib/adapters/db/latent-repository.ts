/**
 * latent-repository.ts — Drizzle implementation of the `LatentRepository` port.
 *
 * Rules this obeys (`data-access`):
 *   §1  returns the domain's `LatentPosteriors`, never Drizzle rows
 *   §2  never `db.transaction()` — it throws on the neon-http driver
 *   §5  selects the columns it needs; `select *` is billed egress on Neon
 *
 * `replaceForParticipant` is ONE multi-row `insert ... on conflict do update`
 * on the composite primary key `(participant_id, pillar)`, for the same reason
 * `generated-block-repository.ts:88-112` gives: a single statement is already
 * atomic, and it is one HTTP round trip on neon-http instead of the driver
 * replaying four. Hence no `db.batch()` of single-row statements here, and
 * certainly no transaction.
 *
 * The adapter reads NO clock. `computedAt` arrives from the use case's `now`,
 * which is what makes "another participant's rows are unchanged in every column
 * including computed_at" an observable property rather than a hope: a clock in
 * here would rewrite timestamps on every retry and nobody could tell a re-score
 * apart from an untouched row.
 */

import { eq, inArray, max, sql } from "drizzle-orm";

import type { ParticipantId } from "../../domain/participant/participant.ts";
import type { Pillar } from "../../domain/quiz/index.ts";
import type {
  LatentPosteriors,
  LatentRepository,
} from "../../ports/latent-repository.ts";
import type { Db } from "./client.ts";
import { latentEstimates } from "./schema/index.ts";

/**
 * What a posterior is made of, and nothing else: no `scorer_version`, no
 * `computed_at`. `LatentSource` exposes `{ mean, se }` per pillar, so anything
 * further read here is egress paid for a value that cannot leave the adapter.
 */
const POSTERIOR_COLUMNS = {
  participantId: latentEstimates.participantId,
  pillar: latentEstimates.pillar,
  mean: latentEstimates.mean,
  se: latentEstimates.se,
};

interface PosteriorRow {
  participantId: string;
  pillar: string;
  mean: number;
  se: number;
}

/** A missing pillar stays missing — that absence is the engine's degraded mode. */
function toPosteriors(rows: readonly PosteriorRow[]): LatentPosteriors {
  const posteriors: LatentPosteriors = {};
  for (const row of rows) {
    posteriors[row.pillar as Pillar] = { mean: row.mean, se: row.se };
  }
  return posteriors;
}

export function createLatentRepository(db: Db): LatentRepository {
  return {
    async replaceForParticipant(id, rows) {
      if (rows.length === 0) return;

      await db
        .insert(latentEstimates)
        .values(
          rows.map((row) => ({
            participantId: id,
            pillar: row.pillar,
            mean: row.mean,
            se: row.se,
            scorerVersion: row.scorerVersion,
            computedAt: row.computedAt,
          }))
        )
        // Re-scoring overwrites the participant's four rows in place: the
        // composite primary key is the upsert target, so a second run is a
        // no-op in row count and a stale posterior can never survive beside a
        // fresh one.
        .onConflictDoUpdate({
          target: [latentEstimates.participantId, latentEstimates.pillar],
          // `excluded` is the row that was proposed. Naming the table's own
          // columns here would set each column to the value it already has,
          // which is a silent no-op rather than an overwrite.
          set: {
            mean: sql`excluded.mean`,
            se: sql`excluded.se`,
            scorerVersion: sql`excluded.scorer_version`,
            computedAt: sql`excluded.computed_at`,
          },
        });
    },

    async byParticipant(id) {
      const rows = await db
        .select(POSTERIOR_COLUMNS)
        .from(latentEstimates)
        .where(eq(latentEstimates.participantId, id));
      return toPosteriors(rows);
    },

    async byParticipants(ids) {
      const map = new Map<ParticipantId, LatentPosteriors>();
      // `inArray` with an empty list is a query asking for nothing; skip the
      // round trip. Ids with no rows are simply absent from the map, which is
      // exactly what `LatentSource` permits.
      if (ids.length === 0) return map;

      // One query for the whole room (data-access §5: no N+1), grouped in
      // memory rather than one SELECT per participant.
      const rows = await db
        .select(POSTERIOR_COLUMNS)
        .from(latentEstimates)
        .where(inArray(latentEstimates.participantId, [...ids]));

      const byParticipantId = new Map<ParticipantId, PosteriorRow[]>();
      for (const row of rows) {
        const bucket = byParticipantId.get(row.participantId);
        if (bucket) bucket.push(row);
        else byParticipantId.set(row.participantId, [row]);
      }
      for (const [participantId, group] of byParticipantId) {
        map.set(participantId, toPosteriors(group));
      }
      return map;
    },

    async computedAtFor(id) {
      // The freshness read #10 needs, and the only reason `computed_at` leaves
      // the adapter. `max()` carries the column's own decoder, so this is a
      // Date; the four rows of one run share an instant anyway, so the maximum
      // is that run's stamp.
      const [row] = await db
        .select({ computedAt: max(latentEstimates.computedAt) })
        .from(latentEstimates)
        .where(eq(latentEstimates.participantId, id));
      return row?.computedAt ?? null;
    },
  };
}
