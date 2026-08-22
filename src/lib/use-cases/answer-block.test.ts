import { describe, it } from "vitest";

/**
 * `answerBlock` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` on a version mismatch before anything else
 * (docs/domain.md D2 / §5); validates the keys, most ≠ least, position 1..15
 * and the presence of `leastKey` unless single-pick; recomputes
 * `shownOrderFor`; and writes through `responses.save`, passing
 * `{ completedAt: now }` only on the block-15 write that completes the quiz
 * (docs/domain.md §7 -- `participants.markQuizCompleted` is never called).
 * Reports `{ completed: true }` or `{ nextPosition, advanced }`, with
 * `nextPosition` recomputed from the rows after the write.
 *
 * Both tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call) and ResponseRepository (recording every save
 * with its opts and, when `completedAt` is given, setting the fake
 * participant's `quizCompletedAt` as the adapter's batch does) -- no adapter
 * import, so the biome.json hexagon rule holds -- a fixed `now` and no
 * database.
 */

describe("answerBlock", () => {
  // TODO: un-skip when answerBlock exists.
  // Blocked on: src/lib/use-cases/answer-block.ts, INSTRUMENT and
  // validateResponse in src/lib/domain/quiz, shownOrderFor in
  // src/lib/domain/quiz/shown-order.ts, and the ParticipantRepository /
  // RoomRepository / ResponseRepository ports (#4).
  it.skip("AC-9 · rejects most = least, an invalid key, positions 0 and 16, a missing least and an unknown token without saving; stores least null under single-pick; upserts one row per position with shownOrderFor; reports the recomputed frontier with advanced; and completes block 15 through a single save carrying { completedAt: now } with markQuizCompleted never called", () => {});

  // TODO: un-skip when answerBlock exists.
  // Blocked on: src/lib/use-cases/answer-block.ts, InstrumentVersionMismatchError
  // from src/lib/use-cases/quiz-progress.ts, INSTRUMENT in src/lib/domain/quiz
  // and the RoomRepository port (#4).
  it.skip("AC-11 · throws InstrumentVersionMismatchError naming v0 and v1 after one rooms.byId call, with no response read, no save and no markQuizCompleted; then saves one row at position 3 with no completedAt once the room version matches", () => {});
});
