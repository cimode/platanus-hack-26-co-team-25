/**
 * score-participant.ts — the step between the quiz and the ranking
 * (issue #30; docs/domain.md §0, §4, D13).
 *
 * `quiz_responses → latent_estimates → ranked`. This is the middle arrow: the
 * participant's own answers, scored against the participant's own form, written
 * once as four rows. Estimates are stored while rankings are not (D13) — they
 * are the avatar, and the timeline reads them.
 *
 * The order of work is fixed, and every step of it is load-bearing:
 *
 *   1. `room.instrumentVersion !== INSTRUMENT.version` rejects with an Error
 *      naming BOTH versions, before any read (docs/domain.md §5). A room that
 *      administered another structure is not a room this build can score, and
 *      reading from it first would bill a round trip to reach the same Error.
 *   2. `quizCompletedAt === null` returns { scored: false, reason:
 *      "quiz-incomplete" } having read NOTHING. The absent row is the signal:
 *      `engine.ts` reads a missing pillar as unmeasured and imputes PRIOR_MEAN
 *      0.5 / PRIOR_SE 0.6, and computes `bothMeasured` from row PRESENCE rather
 *      than from evidence — so four near-prior rows written for a half-answered
 *      quiz would arm `flags.bothHighAgency` and the `pursueWithdraw` surface
 *      that engine.ts states must never fire at zero data, and would destroy
 *      the degraded mode AUDIT.md S15 depends on.
 *   3. `responses.byParticipant(participantId)`; zero responses => { scored:
 *      false, reason: "no-responses" }, blocks not fetched, nothing written.
 *   4. `generatedBlocks.byParticipant(participantId)` =>
 *      `itemParametersOfBlocks(stored.map((s) => s.block))` — NEVER
 *      `itemParametersOf`, which is the wrapper over the committed
 *      `Instrument` (items.ts:120) and would compile here while silently
 *      scoring every participant against the fallback form (D16), which is not
 *      what most people answered.
 *   5. `estimateLatents(responses, items)` on the responses unchanged; any
 *      validation Error propagates uncaught and unwrapped, and because the
 *      write is step 6 nothing reaches `latents`.
 *   6. `latents.replaceForParticipant(participantId, rows)` — four rows, one
 *      per pillar, `computedAt = deps.now()`. The id written is the id read.
 *
 * Nothing here re-scores on its own: `LatentRepository.computedAtFor` is the
 * freshness read, and #10 decides when a stale posterior must be recomputed.
 */

import type { ParticipantId } from "../domain/participant/participant";
import { INSTRUMENT, PILLARS } from "../domain/quiz/index.ts";
import { estimateLatents, itemParametersOfBlocks } from "../domain/scoring";
import type { GeneratedBlockRepository } from "../ports/generated-block-repository";
import type {
  LatentRepository,
  StoredLatent,
} from "../ports/latent-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { Room } from "../ports/room-repository";

export interface ScoreParticipantInput {
  participantId: ParticipantId;
  room: Room;
  /** Null until block 15 lands. The completion gate, step 2 above. */
  quizCompletedAt: Date | null;
}

export interface ScoreParticipantDeps {
  responses: ResponseRepository;
  generatedBlocks: GeneratedBlockRepository;
  latents: LatentRepository;
  now: () => Date;
}

export type ScoreParticipantResult =
  | { scored: true; responsesUsed: number }
  | { scored: false; reason: "quiz-incomplete" | "no-responses" };

export async function scoreParticipant(
  input: ScoreParticipantInput,
  deps: ScoreParticipantDeps
): Promise<ScoreParticipantResult> {
  const { participantId, room, quizCompletedAt } = input;

  // 1. Frozen structure. Both versions in the message, because "instrument
  //    mismatch" alone leaves whoever reads the log guessing which side moved.
  if (room.instrumentVersion !== INSTRUMENT.version) {
    throw new Error(
      `scoring: room "${room.slug}" administered instrument ` +
        `"${room.instrumentVersion}", but this build scores ` +
        `"${INSTRUMENT.version}" — a form with another structure cannot be ` +
        `scored against these item parameters`
    );
  }

  // 2. The completion gate, before either repository is touched.
  if (quizCompletedAt === null) {
    return { scored: false, reason: "quiz-incomplete" };
  }

  // 3. No answers, no posterior — and no second round trip to discover it.
  const responses = await deps.responses.byParticipant(participantId);
  if (responses.length === 0) {
    return { scored: false, reason: "no-responses" };
  }

  // 4. THIS participant's form (D16), never the committed constant. `source`
  //    is irrelevant to the maths: generated and fallback blocks carry the
  //    same pillar/keying structure, which is all the likelihood reads.
  const stored = await deps.generatedBlocks.byParticipant(participantId);
  const items = itemParametersOfBlocks(stored.map((s) => s.block));

  // 5. Responses pass through unchanged: `estimateLatents` either throws or
  //    consumes every one of them, so `responsesUsed` below is exact rather
  //    than an approximation of what was scored.
  const { estimates, scorerVersion } = estimateLatents(responses, items);

  // 6. One clock reading for all four rows — `deps.now()`, never a clock in
  //    the adapter — so a participant's four rows always share a computed_at
  //    and #10's freshness comparison is against one instant, not four.
  //    `scorerVersion` is the estimator's own label (SCORER_VERSION): taking
  //    it from the result is what keeps the stamp attached to the run that
  //    produced these numbers.
  const computedAt = deps.now();
  const rows: StoredLatent[] = PILLARS.map((pillar) => ({
    pillar,
    mean: estimates[pillar].mean,
    se: estimates[pillar].se,
    scorerVersion,
    computedAt,
  }));
  await deps.latents.replaceForParticipant(participantId, rows);

  return { scored: true, responsesUsed: responses.length };
}
