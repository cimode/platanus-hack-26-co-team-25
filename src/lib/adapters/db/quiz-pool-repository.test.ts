import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import type { Block } from "@/lib/domain/quiz";
import { INSTRUMENT, validateBlock } from "@/lib/domain/quiz";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createGeneratedBlockRepository } from "./generated-block-repository";
import { createParticipantRepository } from "./participant-repository";
import { createQuizPoolRepository } from "./quiz-pool-repository";
import { createRoomRepository } from "./room-repository";
import { rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http `QuizPoolRepository`. Integration tests, guarded by ./test-db.ts;
 * they build their own "it-<runId>" room and delete it on teardown -- the
 * cascade takes the sets and the participants with it.
 *
 * Adoption is the part worth a database: it is one guarded UPDATE, and the
 * contract is that two registrations racing for the last set cannot both
 * receive it.
 */

type Repos = Pick<Deps, "pool" | "generatedBlocks" | "participants" | "rooms">;

function requireDb(ctx: TestContext): Db {
  const guard = integrationDb(process.env);
  if (guard.mode === "skip") {
    console.warn(guard.notice);
    ctx.skip(guard.notice);
  }
  return guard.db;
}

function repositories(db: Db): Repos {
  return {
    pool: createQuizPoolRepository(db),
    generatedBlocks: createGeneratedBlockRepository(db),
    participants: createParticipantRepository(db),
    rooms: createRoomRepository(db),
  };
}

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

/** A batch-1 set whose scenarios carry `tag`, built from the instrument's structure. */
function setTagged(tag: string): Block[] {
  return INSTRUMENT.blocks.slice(0, 5).map((block) => {
    validateBlock(block);
    return { ...block, scenario: `${tag} ${block.position}` };
  });
}

async function newParticipant(repos: Repos, roomId: string, name: string) {
  const { participant } = await repos.participants.create({
    roomId,
    gender: "F",
    birthdate: "1996-05-04",
    avatar: "avatar3",
    consent: { romantic: true, business: true, friendship: true },
    name,
  });
  return participant;
}

describe("createQuizPoolRepository", () => {
  it("adopts the oldest unclaimed set once, then the next, then nothing", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const ana = await newParticipant(repos, room.id, "Ana");
    const beto = await newParticipant(repos, room.id, "Beto");

    await repos.pool.add(room.id, setTagged("first"));
    await repos.pool.add(room.id, setTagged("second"));
    expect(await repos.pool.unclaimedCount(room.id)).toBe(2);

    const adopted = await repos.pool.adopt(room.id, ana.id);
    expect(adopted?.map((b) => b.scenario)).toEqual([
      "first 1",
      "first 2",
      "first 3",
      "first 4",
      "first 5",
    ]);
    expect(await repos.pool.unclaimedCount(room.id)).toBe(1);

    const next = await repos.pool.adopt(room.id, beto.id);
    expect(next?.[0].scenario).toBe("second 1");
    expect(await repos.pool.unclaimedCount(room.id)).toBe(0);

    expect(await repos.pool.adopt(room.id, ana.id)).toBeNull();

    // Another room's pool is not this room's.
    const other = await itRoom(db, repos);
    await repos.pool.add(other.id, setTagged("elsewhere"));
    expect(await repos.pool.unclaimedCount(room.id)).toBe(0);
    expect(await repos.pool.adopt(room.id, ana.id)).toBeNull();
  });

  it("hands the last set to exactly one of several racing adopters", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const racers = await Promise.all(
      ["A", "B", "C", "D"].map((name) => newParticipant(repos, room.id, name))
    );
    await repos.pool.add(room.id, setTagged("only"));

    const results = await Promise.all(
      racers.map((p) => repos.pool.adopt(room.id, p.id))
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await repos.pool.unclaimedCount(room.id)).toBe(0);
  });

  it("lists the room's newest scenarios first, across participants' blocks and pool sets, skipping fallbacks and honouring the limit", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const ana = await newParticipant(repos, room.id, "Ana");

    await repos.generatedBlocks.saveBatch(
      ana.id,
      INSTRUMENT.blocks.slice(0, 5).map((block) => ({
        block: { ...block, scenario: `ana ${block.position}` },
        source: "generated" as const,
      }))
    );
    await repos.generatedBlocks.saveBatch(
      ana.id,
      INSTRUMENT.blocks.slice(5, 10).map((block) => ({
        block,
        source: "fallback" as const,
      }))
    );
    await repos.pool.add(room.id, setTagged("pooled"));

    const recent = await repos.pool.recentScenarios(room.id, 40);
    expect(recent).toHaveLength(10);
    // The pool set was written last, so it comes first.
    expect(recent.slice(0, 5)).toEqual([
      "pooled 1",
      "pooled 2",
      "pooled 3",
      "pooled 4",
      "pooled 5",
    ]);
    expect(recent.slice(5)).toEqual(
      expect.arrayContaining(["ana 1", "ana 2", "ana 3", "ana 4", "ana 5"])
    );
    for (const block of INSTRUMENT.blocks.slice(5, 10)) {
      expect(recent).not.toContain(block.scenario);
    }

    expect(await repos.pool.recentScenarios(room.id, 3)).toHaveLength(3);
    expect(await repos.pool.recentScenarios(room.id, 0)).toEqual([]);

    // Nothing from another room.
    const other = await itRoom(db, repos);
    expect(await repos.pool.recentScenarios(other.id, 40)).toEqual([]);
  });
});
