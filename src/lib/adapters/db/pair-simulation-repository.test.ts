import { eq } from "drizzle-orm";
import { describe, expect, it, type TestContext } from "vitest";
import type { Db } from "./client.ts";
import { createPairSimulationRepository } from "./pair-simulation-repository.ts";
import { createParticipantRepository } from "./participant-repository.ts";
import { createRoomRepository } from "./room-repository.ts";
import { pairSimulations, participants } from "./schema/index.ts";
import { integrationDb } from "./test-db.ts";

const integration = integrationDb();

function requireDb(ctx: TestContext): Db {
  if (integration.mode === "skip") {
    ctx.skip(integration.notice);
  }
  return integration.db;
}

describe("pair-simulation-repository", () => {
  it("AC-4 (#34) · deleting a participant cascades the cached row away", async (ctx) => {
    const db = requireDb(ctx);
    const rooms = createRoomRepository(db);
    const participantsRepo = createParticipantRepository(db);
    const repo = createPairSimulationRepository(db);

    const room = await rooms.create({
      slug: `pair-cache-${Date.now()}`,
      name: "Pair cache room",
      instrumentVersion: "map-luce-v1",
    });

    const lo = (
      await participantsRepo.create({
        roomId: room.id,
        name: "Lo",
        gender: "F",
        birthdate: "1996-05-04",
        avatar: "avatar3",
        consent: { romantic: true, business: true, friendship: true },
      })
    ).participant;
    const hi = (
      await participantsRepo.create({
        roomId: room.id,
        name: "Hi",
        gender: "M",
        birthdate: "1994-03-12",
        avatar: "avatar1",
        consent: { romantic: true, business: true, friendship: true },
      })
    ).participant;
    const [loId, hiId] = [lo.id, hi.id].sort();
    const now = new Date();

    await repo.save({
      lens: "romantic",
      participantLo: loId,
      participantHi: hiId,
      life: {
        lens: "romantic",
        subject: { id: loId, name: lo.name, avatar: "avatar1", photoUrl: null },
        other: {
          id: hiId,
          name: hi.name,
          photoUrl: hi.photoUrl,
          avatar: "avatar3",
        },
        horizonYears: 10,
        ending: { outcome: "together" },
        events: [{ year: 1, kind: "milestone", text: "Se cruzan." }],
      },
      scorerVersion: "map-luce-v1",
      loComputedAt: now,
      hiComputedAt: now,
    });

    expect(await repo.byPair("romantic", loId, hiId)).not.toBeNull();

    await db.delete(participants).where(eq(participants.id, loId));

    expect(await repo.byPair("romantic", loId, hiId)).toBeNull();
    const remaining = await db.select().from(pairSimulations);
    expect(remaining.some((row) => row.participantLo === loId)).toBe(false);

    await db.delete(participants).where(eq(participants.roomId, room.id));
  });
});

if (integration.mode === "skip") {
  describe(integration.notice, () => {
    it("skipped without DATABASE_URL", () => {
      expect(true).toBe(true);
    });
  });
}
