import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import { formFor, INSTRUMENT } from "@/lib/domain/quiz";
import type { StoredBlock } from "@/lib/ports/generated-block-repository";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createGeneratedBlockRepository } from "./generated-block-repository";
import { createParticipantRepository } from "./participant-repository";
import { createResponseRepository } from "./response-repository";
import { createRoomRepository } from "./room-repository";
import { rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * neon-http `GeneratedBlockRepository`, and specifically what its upsert
 * refuses to do.
 *
 * A form is assigned more than once by design: registration writes it, and a
 * read that finds a row missing writes it again. `saveBatch` therefore has to
 * be safe to repeat, and its `ON CONFLICT DO UPDATE ... WHERE` is what makes
 * it so. Two rows must survive a re-assignment untouched:
 *
 *   - a row somebody has already answered, whatever its source. The answer row
 *     keeps the question text, but the SCORER reads the pillar and the keying
 *     from here, so swapping the block would score an answer against an item
 *     nobody was shown.
 *   - a `generated` row, from the evenings when the form was authored live.
 *
 * Only an unanswered `fallback` row -- the old committed instrument, never
 * written for this person -- is replaced. That is what lets `quizProgress`
 * heal a legacy participant's form without rewriting the blocks behind their
 * existing answers.
 *
 * Integration test, guarded by ./test-db.ts; it builds its own "it-<runId>"
 * room and deletes it on teardown, and the cascade takes the rest.
 */

type Repos = Pick<
  Deps,
  "generatedBlocks" | "participants" | "responses" | "rooms"
>;

const ANSWERED_AT = new Date("2026-08-23T19:00:00.000Z");

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
    generatedBlocks: createGeneratedBlockRepository(db),
    participants: createParticipantRepository(db),
    responses: createResponseRepository(db),
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

/** The legacy shape: the committed instrument, stored as nobody's own form. */
function fallbackForm(): StoredBlock[] {
  return INSTRUMENT.blocks.map((block) => ({
    block,
    source: "fallback" as const,
  }));
}

/** What `assignQuizForm` writes: this participant's twelve bank blocks. */
function bankForm(participantId: string): StoredBlock[] {
  return formFor(participantId).map((block) => ({
    block,
    source: "bank" as const,
  }));
}

describe("createGeneratedBlockRepository", () => {
  it("re-assigning a form replaces only the unanswered fallback rows, leaves an answered one alone, and is a no-op the second time", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const { participant } = await repos.participants.create({
      roomId: room.id,
      gender: "F",
      birthdate: "1996-05-04",
      avatar: "avatar3",
      consent: { romantic: true, business: true, friendship: true },
      name: "Ana",
    });

    // A participant from before the bank: the committed instrument, stored.
    await repos.generatedBlocks.saveBatch(participant.id, fallbackForm());
    await repos.responses.save({
      participantId: participant.id,
      position: 1,
      mostKey: "a",
      leastKey: "b",
      shownOrder: "abcd",
      answeredAt: ANSWERED_AT,
    });

    const form = bankForm(participant.id);
    await repos.generatedBlocks.saveBatch(participant.id, form);

    const after = await repos.generatedBlocks.byParticipant(participant.id);
    expect(after).toHaveLength(form.length);

    // Position 1 is the question their answer refers to: untouched.
    const first = after.find((row) => row.block.position === 1);
    expect(first?.source).toBe("fallback");
    expect(first?.block.scenario).toBe(INSTRUMENT.blocks[0].scenario);

    // Every other position now carries this participant's bank block.
    for (const stored of form.slice(1)) {
      const row = after.find(
        (candidate) => candidate.block.position === stored.block.position
      );
      expect(row?.source).toBe("bank");
      expect(row?.block.scenario).toBe(stored.block.scenario);
      expect(row?.block.focusPillar).toBe(stored.block.focusPillar);
    }

    // Assigning again changes nothing: `formFor` is deterministic, so the
    // second write proposes exactly the rows that are already there.
    await repos.generatedBlocks.saveBatch(participant.id, form);
    expect(await repos.generatedBlocks.byParticipant(participant.id)).toEqual(
      after
    );

    // And the batch index still answers with four blocks per batch.
    const batchTwo = await repos.generatedBlocks.byBatch(participant.id, 2);
    expect(batchTwo.map((row) => row.block.position)).toEqual([5, 6, 7, 8]);
  });
});
