/**
 * Where the four latent posteriors come from.
 *
 * This is the seam, and the only one: latent estimates are the single value
 * the UI change is permitted to fabricate. Ordering, band, drivers, friction
 * and floor outcomes are NOT fabricated -- they are produced by running the
 * already-shipped pure functions (`meetsFloor`, `rankRoom`, `bandOf`) over
 * these posteriors.
 *
 * Deliberately NOT `latent-repository.ts`: that filename belongs to issue #7,
 * which persists estimates (`replaceForParticipant`) as well as reading them.
 * This port only reads, so the fixture and #7's repository can coexist and the
 * swap is one line in `src/lib/composition.ts`.
 */
import type { LatentEstimate, LatentName } from "../domain/matching/engine";
// SINGULAR `participant/` -- the intake aggregate. `participants/` is the demo
// roster and has no latents.
import type { ParticipantId } from "../domain/participant/participant";

/**
 * One person's posteriors. `Partial` on purpose: a missing pillar is the
 * engine's documented degraded mode (PRIOR_MEAN 0.5 / PRIOR_SE 0.6, AUDIT.md
 * S15), which is not the same thing as a posterior of zero.
 */
export type LatentPosteriors = Partial<Record<LatentName, LatentEstimate>>;

export interface LatentSource {
  /**
   * One call for the whole room. #7's repository answers this in one query;
   * the fixture derives it deterministically. Ids with no posteriors at all
   * MAY be absent from the map.
   */
  byParticipants(
    ids: readonly ParticipantId[]
  ): Promise<ReadonlyMap<ParticipantId, LatentPosteriors>>;
}
