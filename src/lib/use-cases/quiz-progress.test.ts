import { describe, it } from "vitest";

/**
 * `quizProgress` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` when `room.instrumentVersion` differs from
 * `INSTRUMENT.version` (docs/domain.md D2 / §5) before reading a single
 * response; then reads progress from the rows alone -- first unanswered
 * position, its batch, answered count, `completed` from `quizCompletedAt` --
 * and returns the public block view (no `pillar`, no `keyed`) with a
 * deterministic `shownOrder` (docs/domain.md §0, D10).
 *
 * Both tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call) and ResponseRepository (recording every read and
 * save) -- no adapter import, so the biome.json hexagon rule holds -- and no
 * database.
 */

describe("quizProgress", () => {
  // TODO: un-skip when quizProgress exists.
  // Blocked on: src/lib/use-cases/quiz-progress.ts, INSTRUMENT in
  // src/lib/domain/quiz and shownOrderFor in
  // src/lib/domain/quiz/shown-order.ts, and the ParticipantRepository /
  // RoomRepository / ResponseRepository ports (#4).
  it.skip("AC-8 · resumes at the first unanswered position with its batch and count, serves block 15 pre-marked when all rows exist unmarked, clamps at, keeps shownOrder stable without leaking pillar or keyed, and reads the room by id exactly once per resolved participant", () => {});

  // TODO: un-skip when quizProgress exists.
  // Blocked on: src/lib/use-cases/quiz-progress.ts exporting
  // InstrumentVersionMismatchError, INSTRUMENT in src/lib/domain/quiz and the
  // RoomRepository port (#4).
  it.skip("AC-10 · throws InstrumentVersionMismatchError naming v0 and v1 before any response read, returns null for an unknown token without reading the room, recovers once the version matches, and throws naming the roomId when byId returns null", () => {});
});
