import { describe, it } from "vitest";

/**
 * `quizProgress` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` when `room.instrumentVersion` differs from
 * `INSTRUMENT.version` (docs/domain.md §5 / §10.1(b) -- the structural
 * version) before reading a single response or generated block; then reads
 * progress from the rows alone -- first unanswered position, its batch,
 * answered count, `completed` from `quizCompletedAt` -- obtains *this
 * participant's* block for that position through
 * `ensureQuizBatch({ participantId, batch }, { llm, generatedBlocks })`
 * (docs/domain.md D16: stored `generated_blocks` rows, or authored and stored
 * inline, with the committed constant as the per-position fallback; never
 * the `INSTRUMENT` constant read directly) and returns the public block view
 * (no `pillar`, `keyed`, `focusPillar`, `domain` or `source`) with a
 * deterministic `shownOrder` (docs/domain.md §0, D10).
 *
 * All three tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call), ResponseRepository (recording every read and
 * save), a GeneratedBlockRepository (byBatch, byParticipant, saveBatch over
 * one map keyed by participant id and position, recording every call) and an
 * LlmPort whose `generate` rejects and counts its calls -- no adapter import,
 * so the biome.json hexagon rule holds -- and no database.
 */

describe("quizProgress", () => {
  // TODO: un-skip when quizProgress exists.
  // Blocked on: src/lib/use-cases/quiz-progress.ts (quizProgress,
  // PublicBlock). ensureQuizBatch, the GeneratedBlockRepository and LlmPort
  // ports, shownOrderFor and the ParticipantRepository / RoomRepository /
  // ResponseRepository ports exist.
  it.skip("AC-8 · resumes at the first unanswered position with its batch and count, serving the participant's stored block through generatedBlocks.byBatch without calling generate, serves block 15 pre-marked when all rows exist unmarked, clamps at, keeps shownOrder stable without leaking pillar, keyed, focusPillar, domain or source, and reads the room by id exactly once per resolved participant", () => {});

  // TODO: un-skip when quizProgress exists.
  // Blocked on: src/lib/use-cases/quiz-progress.ts exporting
  // InstrumentVersionMismatchError; the check runs before responses,
  // generatedBlocks or llm.generate are touched.
  it.skip("AC-10 · throws InstrumentVersionMismatchError naming v0 and v1 before any response or generated_blocks read, returns null for an unknown token without reading the room, recovers once the version matches, and throws naming the roomId when byId returns null", () => {});

  // TODO: un-skip when quizProgress and answerBlock exist.
  // Blocked on: src/lib/use-cases/quiz-progress.ts and
  // src/lib/use-cases/answer-block.ts; the inline authoring path is the
  // existing ensureQuizBatch -> generateQuizBatch fallback storing
  // source "fallback" rows through generatedBlocks.saveBatch.
  it.skip("AC-12 · with an empty GeneratedBlockRepository and a rejecting LlmPort, quizProgress authors batch 1 inline as five fallback rows equal to the constant's blocks, answerBlock advances through positions 1..5, and the next quizProgress authors batch 2 the same way -- generate called exactly twice", () => {});
});
