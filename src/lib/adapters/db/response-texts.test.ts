import { describe, it } from "vitest";

/**
 * Resolved answer texts on quiz_responses (issue #13, docs/domain.md D15, §3):
 * `ResponseRepository.save` resolves scenario, most_text and least_text from
 * INSTRUMENT at write time and stores them with the keys, while
 * `byParticipant` keeps returning keys only. Integration tests, guarded by
 * ./test-db.ts; they build their own "it-<runId>" room and delete it on
 * teardown. Kept apart from response-repository.test.ts so the two issues
 * never collide on one file.
 */

describe("createResponseRepository (resolved texts)", () => {
  // TODO: un-skip when save() stores the resolved texts.
  // Blocked on: the four new quiz_responses columns (schema/responses.ts and
  // the 0001_instruments migration), createResponseRepository,
  // createParticipantRepository, createRoomRepository and ./test-db.ts from
  // #4.
  it.skip("AC-3 · save stores instrument_version, block 3's scenario and the texts of options c and b, and byParticipant still returns keys only", () => {});

  // TODO: un-skip when save() handles a null leastKey.
  // Blocked on: the new quiz_responses columns, createResponseRepository,
  // createParticipantRepository, createRoomRepository and ./test-db.ts from
  // #4.
  it.skip("AC-4 · save with leastKey null stores most_text and leaves least_text null", () => {});

  // TODO: un-skip when a re-answer updates the texts with the keys.
  // Blocked on: the new quiz_responses columns, createResponseRepository,
  // createParticipantRepository, createRoomRepository and ./test-db.ts from
  // #4.
  it.skip("AC-5 · a re-answer keeps one row for (participant, 3) and its most_text and least_text become option a's and option d's texts", () => {});
});
