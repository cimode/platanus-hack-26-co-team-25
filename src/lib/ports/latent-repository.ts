/**
 * latent-repository.ts — where a participant's four posteriors are written and
 * read (issue #30; docs/domain.md §4, D13).
 *
 * The read half is deliberately the SAME shape as `latent-source.ts`:
 * `LatentPosteriors` is imported rather than redeclared, so `LatentRepository`
 * structurally satisfies `LatentSource` and swapping the fixture for the
 * repository in `src/lib/composition.ts` is one line.
 *
 * `computedAtFor` is the freshness read #10 needs (nothing in the system
 * re-scores, so a posterior computed before a late edit would otherwise stand
 * forever) and is the only reason `computed_at` leaves the adapter.
 *
 * SKELETON (stage 1): types only. The Drizzle implementation lives in
 * `src/lib/adapters/db/latent-repository.ts`.
 */
import type { ParticipantId } from "../domain/participant/participant";
import type { Pillar } from "../domain/quiz/instrument";
import type { LatentPosteriors } from "./latent-source";

export type { LatentPosteriors };

/** One stored row. `computedAt` comes from the caller's clock, never the adapter's. */
export interface StoredLatent {
  pillar: Pillar;
  /** Posterior mean on [0,1] — what `Person.latents[p].mean` consumes. */
  mean: number;
  /** Posterior SE on [0,1], strictly positive. */
  se: number;
  /** The scorer that produced this row, e.g. "map-luce-v1". */
  scorerVersion: string;
  computedAt: Date;
}

export interface LatentRepository {
  /**
   * The participant's four rows, upserted on `(participant_id, pillar)`, so a
   * second scoring is a no-op in row count.
   */
  replaceForParticipant(
    id: ParticipantId,
    rows: readonly StoredLatent[]
  ): Promise<void>;
  /** Only `mean` and `se` leave the adapter here — a missing pillar is the engine's degraded mode. */
  byParticipant(id: ParticipantId): Promise<LatentPosteriors>;
  /** One query for a whole room. Satisfies `LatentSource.byParticipants`. */
  byParticipants(
    ids: readonly ParticipantId[]
  ): Promise<ReadonlyMap<ParticipantId, LatentPosteriors>>;
  /** The newest `computed_at` this participant holds, or null when unscored. */
  computedAtFor(id: ParticipantId): Promise<Date | null>;
}
