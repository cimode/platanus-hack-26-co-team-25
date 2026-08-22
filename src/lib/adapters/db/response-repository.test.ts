import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import type { BlockResponse } from "@/lib/domain/quiz";
import { INSTRUMENT } from "@/lib/domain/quiz";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createParticipantRepository } from "./participant-repository";
import { createResponseRepository } from "./response-repository";
import { createRoomRepository } from "./room-repository";
import { rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http ResponseRepository (issue #4, docs/domain.md §7): `save(r, opts?)`
 * is one db.batch() that upserts on (participant_id, position) and, when
 * `opts.completedAt` is given, sets participants.quiz_completed_at in the same
 * round trip. Integration tests, guarded by ./test-db.ts; they build their own
 * "it-<runId>" room and delete it on teardown.
 *
 * The guard is evaluated inside each test rather than in a `describe.skipIf`
 * so a failure of `integrationDb()` itself is reported against the criterion
 * that needed it, not as a collection error with no AC id attached.
 */

/** Typed through composition's `Deps`, so a `Deps` that never learned about
 * the repositories fails tsc here rather than at the first call site. */
type Repos = Pick<Deps, "participants" | "responses" | "rooms">;

const AT = new Date("2026-08-22T19:15:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T19:00:00.000Z");

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
    responses: createResponseRepository(db),
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

function answer(
  participantId: string,
  overrides: Partial<BlockResponse> = {}
): BlockResponse {
  return {
    participantId,
    position: 1,
    mostKey: "a",
    leastKey: "b",
    shownOrder: "abcd",
    answeredAt: ANSWERED_AT,
    ...overrides,
  };
}

describe("createResponseRepository", () => {
  it("AC-6 · save upserts on (participant, position), rejects most equal to least and byParticipant is ordered by position", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const { participant } = await repos.participants.create({
      roomId: room.id,
      name: "Ana",
    });

    await repos.responses.save(
      answer(participant.id, {
        position: 7,
        mostKey: "a",
        leastKey: "c",
        shownOrder: "cbad",
      })
    );
    // The back affordance: answering block 7 again updates the row, and the
    // single-pick fallback clears leastKey rather than leaving the old one.
    await repos.responses.save(
      answer(participant.id, {
        position: 7,
        mostKey: "b",
        leastKey: null,
        shownOrder: "dacb",
      })
    );
    await repos.responses.save(answer(participant.id, { position: 3 }));
    await repos.responses.save(answer(participant.id, { position: 1 }));

    // most === least is refused, so no ranking is ever built on a response
    // that says the same option is both the best and the worst fit.
    await expect(
      repos.responses.save(
        answer(participant.id, {
          position: 8,
          mostKey: "d",
          leastKey: "d",
          shownOrder: "abcd",
        })
      )
    ).rejects.toThrow();

    const saved = await repos.responses.byParticipant(participant.id);
    expect(saved.map((r) => r.position)).toEqual([1, 3, 7]);
    const seven = saved.find((r) => r.position === 7);
    expect(seven?.mostKey).toBe("b");
    expect(seven?.leastKey).toBeNull();
    expect(seven?.shownOrder).toBe("dacb");
    expect(seven?.participantId).toBe(participant.id);

    const other = await repos.participants.create({
      roomId: room.id,
      name: "Beto",
    });
    expect(await repos.responses.byParticipant(other.participant.id)).toEqual(
      []
    );
  });

  it("AC-12 · the 15th save with completedAt lands the response and quiz_completed_at together or not at all", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);

    const first = await repos.participants.create({
      roomId: room.id,
      name: "Ana",
    });
    for (let position = 1; position <= 14; position++) {
      await repos.responses.save(answer(first.participant.id, { position }));
    }
    // save() without opts never touches participants.quiz_completed_at.
    const beforeCompletion = await repos.participants.bySessionToken(
      first.sessionToken
    );
    expect(beforeCompletion?.quizCompletedAt).toBeNull();

    await repos.responses.save(
      answer(first.participant.id, {
        position: 15,
        mostKey: "a",
        leastKey: "b",
        shownOrder: "abcd",
      }),
      { completedAt: AT }
    );

    const completed = await repos.participants.bySessionToken(
      first.sessionToken
    );
    expect(completed?.quizCompletedAt?.getTime()).toBe(AT.getTime());
    expect(
      (await repos.responses.byParticipant(first.participant.id)).map(
        (r) => r.position
      )
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    // A second participant whose 15th block is invalid: the batch is rejected
    // whole, so the room can never hold someone with 15 responses and no
    // completion timestamp -- nor a timestamp with only 14 responses.
    const second = await repos.participants.create({
      roomId: room.id,
      name: "Beto",
    });
    for (let position = 1; position <= 14; position++) {
      await repos.responses.save(answer(second.participant.id, { position }));
    }
    await expect(
      repos.responses.save(
        answer(second.participant.id, {
          position: 15,
          mostKey: "a",
          leastKey: "a",
          shownOrder: "abcd",
        }),
        { completedAt: AT }
      )
    ).rejects.toThrow();

    const rows = await repos.responses.byParticipant(second.participant.id);
    expect(rows).toHaveLength(14);
    expect(rows.some((r) => r.position === 15)).toBe(false);
    const stillOpen = await repos.participants.bySessionToken(
      second.sessionToken
    );
    expect(stillOpen?.quizCompletedAt).toBeNull();

    // One round trip, not two: the response and the timestamp go in the same
    // db.batch(), and markQuizCompleted() is never called from the adapter
    // (docs/domain.md §7). db.transaction() throws on neon-http (data-access
    // §2), so it may not appear either. Comments are stripped first, so this
    // reads the adapter's code and not its prose.
    const code = readFileSync(
      new URL("./response-repository.ts", import.meta.url),
      "utf8"
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).toMatch(/\.batch\(/);
    expect(code).not.toMatch(/markQuizCompleted\(/);
    expect(code).not.toMatch(/\.transaction\(/);
  });
});
