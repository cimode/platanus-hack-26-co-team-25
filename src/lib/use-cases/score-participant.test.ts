import { describe, it } from "vitest";

/**
 * `scoreParticipant` use case (issue #7): checks the passed `Room` against
 * `INSTRUMENT.version` first (docs/domain.md D2, §5 frozen-instrument
 * invariant), reads the participant's responses through
 * `ResponseRepository.byParticipant`, runs `estimateLatents` on them
 * unchanged, and writes the four `StoredLatent` rows through
 * `LatentRepository.replaceForParticipant` with `computedAt = deps.now()`.
 * Zero responses write nothing; a version mismatch or an invalid response
 * set rejects before any write.
 *
 * All three tests use inline in-memory fakes of ResponseRepository and
 * LatentRepository that record every call, a `Room` literal as the input
 * (never a RoomRepository lookup) and a fixed `now` -- no adapter import, so
 * the biome.json hexagon rule holds.
 */

describe("scoreParticipant", () => {
  // TODO: un-skip when scoreParticipant exists.
  // Blocked on: src/lib/use-cases/score-participant.ts,
  // src/lib/ports/latent-repository.ts, ResponseRepository and the Room type
  // (#4), INSTRUMENT.version (#4).
  it.skip('AC-6 · resolves { scored: false, reason: "no-responses" } and writes nothing when the participant has no responses', () => {});

  // TODO: un-skip when scoreParticipant and estimateLatents exist.
  // Blocked on: src/lib/use-cases/score-participant.ts,
  // src/lib/domain/scoring/estimate.ts (the Error naming the position),
  // src/lib/ports/latent-repository.ts, ResponseRepository and the Room type
  // (#4), INSTRUMENT.version (#4).
  it.skip("AC-7 · rejects with the Error naming position 16 or the duplicated position 3, and writes nothing", () => {});

  // TODO: un-skip when scoreParticipant exists.
  // Blocked on: src/lib/use-cases/score-participant.ts,
  // src/lib/ports/latent-repository.ts, ResponseRepository and the Room type
  // (#4), INSTRUMENT.version (#4).
  it.skip('AC-10 · a room at "v0" rejects naming both versions before responses are read; the same fakes at INSTRUMENT.version score 15 and write four rows', () => {});
});
