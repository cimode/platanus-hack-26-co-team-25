import { describe, it } from "vitest";

/**
 * `answerBlock` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` on a version mismatch before anything else
 * (docs/domain.md §5 / §10.1(b)); checks position 1..15; loads *this
 * participant's* block at `position` from
 * `generatedBlocks.byBatch(participantId, batchOf(position))` and rejects,
 * naming the participant id and the position, when no stored block has that
 * position (docs/domain.md D16 -- a write never authors: `ensureQuizBatch`
 * and `saveBatch` are never called here); validates `mostKey` and `leastKey`
 * against that block's option keys, most ≠ least and the presence of
 * `leastKey` unless single-pick; recomputes `shownOrderFor`; and writes
 * through `responses.save`, passing `{ completedAt: now }` only on the
 * block-15 write that completes the quiz (docs/domain.md §7 --
 * `participants.markQuizCompleted` is never called). Reports
 * `{ completed: true }` or `{ nextPosition, advanced }`, with `nextPosition`
 * recomputed from the rows after the write.
 *
 * Both tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call), ResponseRepository (recording every save with
 * its opts and, when `completedAt` is given, setting the fake participant's
 * `quizCompletedAt` as the adapter's batch does) and a GeneratedBlockRepository
 * seeded with the participant's 15 blocks (recording every call) -- no
 * adapter import, so the biome.json hexagon rule holds -- a fixed `now` and
 * no database.
 */

describe("answerBlock", () => {
  // TODO: un-skip when answerBlock exists.
  // Blocked on: src/lib/use-cases/answer-block.ts. validateResponse and
  // batchOf in src/lib/domain/quiz, shownOrderFor in
  // src/lib/domain/quiz/shown-order.ts, and the ParticipantRepository /
  // RoomRepository / ResponseRepository / GeneratedBlockRepository ports exist.
  it.skip("AC-9 · rejects most = least, a key the participant's block lacks, positions 0 and 16, a missing least, a position with no stored block and an unknown token without saving; stores least null under single-pick; upserts one row per position with shownOrderFor; reports the recomputed frontier with advanced; and completes block 15 through a single save carrying { completedAt: now } with saveBatch and markQuizCompleted never called", () => {});

  // TODO: un-skip when answerBlock exists.
  // Blocked on: src/lib/use-cases/answer-block.ts and
  // InstrumentVersionMismatchError from src/lib/use-cases/quiz-progress.ts;
  // the check runs before responses or generatedBlocks are touched.
  it.skip("AC-11 · throws InstrumentVersionMismatchError naming v0 and v1 after one rooms.byId call, with no response read, no generatedBlocks call, no save and no markQuizCompleted; then saves one row at position 3 with no completedAt after exactly one generatedBlocks.byBatch call for batch 1 once the room version matches", () => {});
});
