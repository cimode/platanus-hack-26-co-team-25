import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import { INSTRUMENT } from "@/lib/domain/quiz";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createRoomRepository } from "./room-repository";
import { rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http RoomRepository (issue #4, docs/domain.md §7): bySlug, byId, create.
 * Integration test, guarded by ./test-db.ts; it builds its own "it-<runId>"
 * room and deletes it on teardown. It never touches `platanus-hack-26-bogota`.
 *
 * The guard is evaluated inside the test rather than in a `describe.skipIf`
 * so a failure of `integrationDb()` itself is reported against the criterion
 * that needed it, not as a collection error with no AC id attached.
 */

/** Typed through composition's `Deps`, so a `Deps` that never learned about
 * the repositories fails tsc here rather than at the first call site. */
type Repos = Pick<Deps, "rooms">;

function requireDb(ctx: TestContext): Db {
  const guard = integrationDb(process.env);
  if (guard.mode === "skip") {
    console.warn(guard.notice);
    ctx.skip(guard.notice);
  }
  return guard.db;
}

/** A room of this run's own, deleted afterwards -- the cascade does the rest. */
async function itRoom(db: Db, repos: Repos): Promise<Room> {
  const room = await repos.rooms.create({
    slug: `it-${randomUUID().slice(0, 8)}`,
    name: "Integration room",
    instrumentVersion: INSTRUMENT.version,
  });
  onTestFinished(async () => {
    await db.delete(roomsTable).where(eq(roomsTable.id, room.id));
  });
  return room;
}

describe("createRoomRepository", () => {
  it("AC-13 · byId returns the room for its id and null for a random uuid", async (ctx) => {
    const db = requireDb(ctx);
    const repos: Repos = { rooms: createRoomRepository(db) };
    const room = await itRoom(db, repos);
    expect(room.slug).toMatch(/^it-/);

    const found = await repos.rooms.byId(room.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(room.id);
    expect(found?.slug).toBe(room.slug);
    // D2: the room records which instrument it administered.
    expect(found?.instrumentVersion).toBe(INSTRUMENT.version);
    expect(found?.createdAt).toBeInstanceOf(Date);

    // A uuid nobody minted is a miss, not a throw and not somebody else's room.
    expect(await repos.rooms.byId(randomUUID())).toBeNull();
  });
});
