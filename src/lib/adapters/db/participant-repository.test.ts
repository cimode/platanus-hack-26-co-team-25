import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import type {
  DeclaredProfile,
  RomanticGate,
  SessionToken,
} from "@/lib/domain/participant";
import { INSTRUMENT } from "@/lib/domain/quiz";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createParticipantRepository } from "./participant-repository";
import { createRoomRepository } from "./room-repository";
import { rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http ParticipantRepository (issue #4, docs/domain.md §7). Integration
 * tests: they run only when DATABASE_URL points at a migrated branch (the
 * `integrationDb()` guard from ./test-db skips with a notice when it is unset
 * and throws under DB_REQUIRED=1), build their own room "it-<runId>" through
 * RoomRepository.create() and delete it on teardown -- the cascade removes
 * everything beneath it. They never touch `platanus-hack-26-bogota`.
 *
 * The guard is evaluated inside each test rather than in a `describe.skipIf`
 * so a failure of `integrationDb()` itself is reported against the criterion
 * that needed it, not as a collection error with no AC id attached.
 */

/** Typed through composition's `Deps`, so a `Deps` that never learned about
 * the repositories fails tsc here rather than at the first call site. */
type Repos = Pick<Deps, "participants" | "rooms">;

const PHOTO = "https://blob.example/ana.jpg";
const AT = new Date("2026-08-22T18:30:00.000Z");

const DECLARED: DeclaredProfile = {
  moneyPosture: 2,
  rootedness: 1,
  familyGravity: 0,
  capacityHoursBand: 3,
  distanceBand: 1,
  chronotype: 2,
  tags: ["tango", "ramen"],
  acquaintances: [],
};

const ROMANTIC_GATE: RomanticGate = {
  gender: "F",
  interestedIn: ["M", "NB"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};

/** Nothing a room view renders may carry any of these (PILLARS.md §2 A8). */
const LEAKS = [
  "consent",
  "interested",
  "gender",
  "single",
  "wants",
  "money",
  "declared",
  "session",
  "token",
];

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
    participants: createParticipantRepository(db),
    rooms: createRoomRepository(db),
  };
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

describe("createParticipantRepository", () => {
  it("AC-4 · a participant round-trips through create, setPhoto, setConsent, saveDeclared, upsertRomanticGate, markQuizCompleted and bySessionToken", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);

    const created = await repos.participants.create({
      roomId: room.id,
      name: "Ana Ramírez",
      team: "t-7",
      track: "fintech",
    });

    // AUDIT.md S16 / CONTEXT.md §7.3: a fresh row is opted out of everything.
    expect(created.participant.consent).toEqual({
      romantic: false,
      business: false,
      friendship: false,
    });
    expect(created.participant.photoUrl).toBeNull();
    expect(created.participant.declaredAt).toBeNull();
    expect(created.participant.roomId).toBe(room.id);
    expect(created.participant.team).toBe("t-7");
    expect(created.participant.track).toBe("fintech");

    // D4: the credential travels beside the participant, never on it.
    expect(created.sessionToken).toBeTruthy();
    expect(created.participant).not.toHaveProperty("sessionToken");
    expect(JSON.stringify(created.participant)).not.toContain(
      created.sessionToken
    );

    // Two other people in the same room to point the acquaintance list at.
    const beto = await repos.participants.create({
      roomId: room.id,
      name: "Beto",
    });
    const carla = await repos.participants.create({
      roomId: room.id,
      name: "Carla",
    });
    const known = [beto.participant.id, carla.participant.id];

    const id = created.participant.id;
    await repos.participants.setPhoto(id, PHOTO);
    await repos.participants.setConsent(id, {
      romantic: true,
      business: false,
      friendship: true,
    });
    await repos.participants.saveDeclared(id, {
      ...DECLARED,
      acquaintances: known,
    });
    await repos.participants.upsertRomanticGate(id, ROMANTIC_GATE);
    await repos.participants.markQuizCompleted(id, AT);

    const ana = await repos.participants.bySessionToken(created.sessionToken);
    expect(ana).not.toBeNull();
    expect(ana?.id).toBe(id);
    expect(ana?.photoUrl).toBe(PHOTO);
    expect(ana?.consent).toEqual({
      romantic: true,
      business: false,
      friendship: true,
    });
    // D6: stored as the band that was tapped, never as the engine's fraction.
    expect(ana?.declared.moneyPosture).toBe(2);
    expect(ana?.declared.rootedness).toBe(1);
    expect(ana?.declared.familyGravity).toBe(0);
    expect(ana?.declared.capacityHoursBand).toBe(3);
    expect(ana?.declared.distanceBand).toBe(1);
    expect(ana?.declared.chronotype).toBe(2);
    expect(ana?.declared.tags).toEqual(["tango", "ramen"]);
    expect(ana?.declaredAt).toBeInstanceOf(Date);
    expect(ana?.quizCompletedAt?.getTime()).toBe(AT.getTime());

    for (const lens of ["romantic", "friendship"] as const) {
      const rankable = await repos.participants.byRoomForRanking(room.id, lens);
      expect(
        rankable.map((r) => r.participant.id),
        lens
      ).toEqual([id]);
      expect(rankable[0].romanticGate, lens).toEqual(ROMANTIC_GATE);
      expect(rankable[0].businessGate, lens).toBeUndefined();
      expect([...rankable[0].acquaintances].sort(), lens).toEqual(
        [...known].sort()
      );
    }
    // Ana never consented to the business lens, so she is not rankable under
    // it -- the floor is applied inside the repository (AUDIT.md S15).
    expect(
      await repos.participants.byRoomForRanking(room.id, "business")
    ).toEqual([]);

    // One band short of the declared round leaves declared_at null, so the
    // §0 floor keeps this row out of every ranking.
    const dani = await repos.participants.create({
      roomId: room.id,
      name: "Dani",
    });
    await repos.participants.setPhoto(dani.participant.id, PHOTO);
    await repos.participants.saveDeclared(dani.participant.id, {
      ...DECLARED,
      chronotype: null,
    });
    const partial = await repos.participants.bySessionToken(dani.sessionToken);
    expect(partial?.declaredAt).toBeNull();

    // A token nobody minted is a miss, not a throw.
    expect(
      await repos.participants.bySessionToken(randomUUID() as SessionToken)
    ).toBeNull();

    const bySlug = await repos.rooms.bySlug(room.slug);
    expect(bySlug?.id).toBe(room.id);
    expect(bySlug?.instrumentVersion).toBe("v1");
    // D9: a slug identifies one room; the second create is rejected, not a
    // silent second room automation could wander into.
    await expect(
      repos.rooms.create({
        slug: room.slug,
        name: "Duplicate room",
        instrumentVersion: INSTRUMENT.version,
      })
    ).rejects.toThrow();
  });

  it("AC-5 · byRoom returns RoomMembers only and byRoomForRanking applies the floor inside the adapter", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const create = (name: string) =>
      repos.participants.create({ roomId: room.id, name });

    // A: photo, friendship consent, all six bands -- above the floor.
    const a = await create("Ana");
    await repos.participants.setPhoto(
      a.participant.id,
      "https://blob.example/a.jpg"
    );
    await repos.participants.setConsent(a.participant.id, {
      romantic: false,
      business: false,
      friendship: true,
    });
    await repos.participants.saveDeclared(a.participant.id, DECLARED);

    // B: photo and consent, but quit during the declared round.
    const b = await create("Beto");
    await repos.participants.setPhoto(
      b.participant.id,
      "https://blob.example/b.jpg"
    );
    await repos.participants.setConsent(b.participant.id, {
      romantic: false,
      business: false,
      friendship: true,
    });

    // C: bands and consent, no photo.
    const c = await create("Carla");
    await repos.participants.setConsent(c.participant.id, {
      romantic: false,
      business: false,
      friendship: true,
    });
    await repos.participants.saveDeclared(c.participant.id, DECLARED);

    // D: photo and bands, no consent to any lens.
    const d = await create("Dani");
    await repos.participants.setPhoto(
      d.participant.id,
      "https://blob.example/d.jpg"
    );
    await repos.participants.saveDeclared(d.participant.id, DECLARED);

    const members = await repos.participants.byRoom(room.id);
    expect(members).toHaveLength(4);
    for (const member of members) {
      expect(Object.keys(member).sort(), member.name).toEqual([
        "id",
        "name",
        "photoUrl",
      ]);
    }
    const byId = new Map(members.map((member) => [member.id, member]));
    expect(byId.get(a.participant.id)?.photoUrl).toBe(
      "https://blob.example/a.jpg"
    );
    expect(byId.get(b.participant.id)?.photoUrl).toBe(
      "https://blob.example/b.jpg"
    );
    expect(byId.get(d.participant.id)?.photoUrl).toBe(
      "https://blob.example/d.jpg"
    );
    expect(byId.get(c.participant.id)?.photoUrl).toBeNull();

    // The floor is applied inside the repository, with no filtering here:
    // B is declared-incomplete, C has no photo, D consented to nothing.
    const friendship = await repos.participants.byRoomForRanking(
      room.id,
      "friendship"
    );
    expect(friendship.map((r) => r.participant.id)).toEqual([a.participant.id]);
    // Nobody in the room has both romantic consent and a romantic gate row.
    expect(
      await repos.participants.byRoomForRanking(room.id, "romantic")
    ).toEqual([]);

    const json = JSON.stringify(members);
    for (const leak of LEAKS) {
      expect(json).not.toContain(leak);
    }
  });
});
