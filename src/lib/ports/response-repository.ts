/**
 * The response repository port (docs/domain.md §7).
 *
 * `save()` upserts on (participant_id, position). When `completedAt` is given
 * -- `answer-block` passes it on the 15th distinct position -- the SAME
 * db.batch() also sets `participants.quiz_completed_at`: one round trip, so a
 * participant can never have 15 responses and no completion timestamp.
 */
import type { ParticipantId } from "../domain/participant";
import type { BlockResponse } from "../domain/quiz";

export interface ResponseRepository {
  save(response: BlockResponse, opts?: { completedAt: Date }): Promise<void>;
  /** Ordered by ascending position. */
  byParticipant(id: ParticipantId): Promise<BlockResponse[]>;
}
