import { describe, it } from "vitest";

/**
 * neon-http RoomRepository (issue #4, docs/domain.md §7): bySlug, byId, create.
 * Integration test, guarded by ./test-db.ts; it builds its own "it-<runId>"
 * room and deletes it on teardown. It never touches `platanus-hack-26-bogota`.
 */

describe("createRoomRepository", () => {
  // TODO: un-skip when src/lib/adapters/db/room-repository.ts exists.
  // Blocked on: createRoomRepository, ./test-db.ts and the 0000_intake
  // migration applied to the branch DATABASE_URL points at.
  it.skip("AC-13 · byId returns the room for its id and null for a random uuid", () => {});
});
