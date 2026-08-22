import { describe, it } from "vitest";

/**
 * `scoreParticipant` use case (issue #7): checks the passed `Room` against
 * `INSTRUMENT.version` first (docs/domain.md §5 frozen-structure invariant,
 * §10.1(b) -- the version names the shared structure, not the scenarios),
 * reads the participant's responses through
 * `ResponseRepository.byParticipant`, then *that participant's* stored blocks
 * through `GeneratedBlockRepository.byParticipant` (docs/domain.md D16: the
 * form is per person, read from `generated_blocks`, never from the
 * `INSTRUMENT` constant), builds `itemParametersOf(blocks)`, runs
 * `estimateLatents(responses, items)` on the responses unchanged, and writes
 * the four `StoredLatent` rows through
 * `LatentRepository.replaceForParticipant` with `computedAt = deps.now()`.
 * Zero responses fetch no blocks and write nothing; a version mismatch, a
 * response at a position with no stored block, or an invalid response set
 * rejects before any write.
 *
 * All four tests use inline in-memory fakes of ResponseRepository,
 * GeneratedBlockRepository and LatentRepository that record every call, a
 * `Room` literal as the input (never a RoomRepository lookup) and a fixed
 * `now` -- no adapter import, so the biome.json hexagon rule holds. The fake
 * blocks are `INSTRUMENT.blocks` wrapped as `StoredBlock[]` (source
 * "fallback"), or a prefix of them for AC-11 -- the one place the constant is
 * convenient, because it is a valid 15-block form; the use case itself never
 * reads it for parameters.
 */

describe("scoreParticipant", () => {
  // TODO: un-skip when scoreParticipant exists.
  // Blocked on: src/lib/use-cases/score-participant.ts and
  // src/lib/ports/latent-repository.ts (LatentRepository). ResponseRepository,
  // GeneratedBlockRepository, the Room type and INSTRUMENT.version exist.
  it.skip('AC-6 · resolves { scored: false, reason: "no-responses" } without reading generated_blocks, and writes nothing, when the participant has no responses', () => {});

  // TODO: un-skip when scoreParticipant and estimateLatents exist.
  // Blocked on: src/lib/use-cases/score-participant.ts,
  // src/lib/domain/scoring/estimate.ts (the Error naming the position),
  // items.ts (itemParametersOf over the participant's stored blocks) and
  // src/lib/ports/latent-repository.ts.
  it.skip("AC-7 · rejects with the Error naming position 16 or the duplicated position 3 against the participant's 15 stored blocks, and writes nothing", () => {});

  // TODO: un-skip when scoreParticipant exists.
  // Blocked on: src/lib/use-cases/score-participant.ts and
  // src/lib/ports/latent-repository.ts; the version check runs before
  // responses.byParticipant and generatedBlocks.byParticipant are ever called.
  it.skip('AC-10 · a room at "v0" rejects naming both versions before responses or blocks are read; the same fakes at INSTRUMENT.version score 15 and write four rows', () => {});

  // TODO: un-skip when scoreParticipant and estimateLatents exist.
  // Blocked on: src/lib/use-cases/score-participant.ts,
  // src/lib/domain/scoring/estimate.ts (the Error naming the position with
  // no item parameters), items.ts (itemParametersOf over the ten stored
  // blocks) and src/lib/ports/latent-repository.ts.
  it.skip("AC-11 · a response at position 11 with stored blocks only at 1..10 rejects naming 11, writes nothing and leaves latents.byParticipant(P) empty", () => {});
});
