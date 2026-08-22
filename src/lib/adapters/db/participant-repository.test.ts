import { describe, it } from "vitest";

/**
 * neon-http ParticipantRepository (issue #4, docs/domain.md §7). Integration
 * tests: they run only when DATABASE_URL points at a migrated branch
 * (`describe.skipIf` on `integrationDb()` from ./test-db), build their own
 * room "it-<runId>" through RoomRepository.create() and delete it on teardown
 * -- the cascade removes everything beneath it. They never touch
 * `platanus-hack-26-bogota`.
 */

describe("createParticipantRepository", () => {
  // TODO: un-skip when src/lib/adapters/db/participant-repository.ts exists.
  // Blocked on: createParticipantRepository, createRoomRepository, the
  // integration guard in ./test-db.ts and the 0000_intake migration applied
  // to the branch DATABASE_URL points at.
  it.skip("AC-4 · a participant round-trips through create, setPhoto, setConsent, saveDeclared, upsertRomanticGate, markQuizCompleted and bySessionToken", () => {});

  // TODO: un-skip when byRoom and byRoomForRanking exist.
  // Blocked on: createParticipantRepository with meetsFloor applied inside
  // byRoomForRanking, ./test-db.ts and the migration.
  it.skip("AC-5 · byRoom returns RoomMembers only and byRoomForRanking applies the floor inside the adapter", () => {});
});
