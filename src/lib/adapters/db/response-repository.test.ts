import { describe, it } from "vitest";

/**
 * neon-http ResponseRepository (issue #4, docs/domain.md §7): `save(r, opts?)`
 * is one db.batch() that upserts on (participant_id, position) and, when
 * `opts.completedAt` is given, sets participants.quiz_completed_at in the same
 * round trip. Integration tests, guarded by ./test-db.ts; they build their own
 * "it-<runId>" room and delete it on teardown.
 */

describe("createResponseRepository", () => {
  // TODO: un-skip when src/lib/adapters/db/response-repository.ts exists.
  // Blocked on: createResponseRepository, createParticipantRepository,
  // ./test-db.ts and the 0000_intake migration.
  it.skip("AC-6 · save upserts on (participant, position), rejects most equal to least and byParticipant is ordered by position", () => {});

  // TODO: un-skip when save() accepts { completedAt }.
  // Blocked on: createResponseRepository with the batched quiz_completed_at
  // update, createParticipantRepository, ./test-db.ts and the migration.
  it.skip("AC-12 · the 15th save with completedAt lands the response and quiz_completed_at together or not at all", () => {});
});
