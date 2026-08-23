import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { Deps } from "@/lib/composition";
import type { Block, BlockResponse, OptionKey } from "@/lib/domain/quiz";
import { INSTRUMENT, validateBlock } from "@/lib/domain/quiz";
import type { StoredBlock } from "@/lib/ports/generated-block-repository";
import type { Room } from "@/lib/ports/room-repository";
import type { Db } from "./client";
import { createGeneratedBlockRepository } from "./generated-block-repository";
import { createParticipantRepository } from "./participant-repository";
import { createResponseRepository } from "./response-repository";
import { createRoomRepository } from "./room-repository";
import { quizResponses, rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * Resolved answer texts on quiz_responses (issue #13, docs/domain.md D15/D16,
 * §3): under D16 each participant answers their OWN generated form, so the
 * question a row answers exists only in `generated_blocks(participant_id,
 * position)`. `ResponseRepository.save` resolves `scenario`, `most_text` and
 * `least_text` from that participant's block at write time and stores them
 * beside the keys; `instrument_version` is `INSTRUMENT.version`, the
 * structural version. `byParticipant` keeps returning keys only -- the texts
 * are for humans and SQL.
 *
 * Integration tests, guarded by ./test-db.ts; each builds its own "it-<runId>"
 * room and deletes it on teardown, and the cascade takes the participants,
 * their generated blocks and their responses with it.
 *
 * The guard is evaluated inside each test rather than in a `describe.skipIf`
 * so a failure of `integrationDb()` itself is reported against the criterion
 * that needed it, not as a collection error with no AC id attached.
 */

type Repos = Pick<
  Deps,
  "generatedBlocks" | "participants" | "responses" | "rooms"
>;

const ANSWERED_AT = new Date("2026-08-22T19:00:00.000Z");
const COMPLETED_AT = new Date("2026-08-22T19:15:00.000Z");

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

/**
 * A block this participant could plausibly have been generated: the fallback
 * constant's structure (which `validateBlock` pins) carrying a scenario and
 * four option texts nobody else in the room -- and nothing in `quiz/` -- has.
 * That is what makes "this participant's text, never the other's and never the
 * constant's" observable at all.
 */
function generatedBlock(tag: string, position: number): Block {
  const base = INSTRUMENT.blocks[position - 1];
  const block: Block = {
    ...base,
    scenario: `${tag} - scenario ${position}`,
    options: base.options.map((option) => ({
      ...option,
      text: `${tag} - option ${option.key} of block ${position}`,
    })),
  };
  // The fixtures must be blocks the generator could have produced, or the test
  // asserts over something the system never stores.
  validateBlock(block);
  return block;
}

/** The five blocks of `batch`, in the shape `saveBatch` takes. */
function generatedBatch(tag: string, batch: number): StoredBlock[] {
  return [1, 2, 3, 4, 5]
    .map((offset) => (batch - 1) * 5 + offset)
    .map((position) => ({
      block: generatedBlock(tag, position),
      source: "generated" as const,
    }));
}

function optionText(tag: string, position: number, key: OptionKey): string {
  const option = generatedBlock(tag, position).options.find(
    (candidate) => candidate.key === key
  );
  if (!option) throw new Error(`no option ${key} in block ${position}`);
  return option.text;
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

/**
 * What a human reads in Drizzle Studio or psql -- deliberately the query
 * `docs/guia-formulario.md` documents, in raw SQL rather than through the
 * Drizzle table, because the criterion is about the columns existing in the
 * migrated database, not about the TypeScript schema object agreeing with
 * itself.
 */
type StoredRow = {
  instrument_version: string | null;
  scenario: string | null;
  most_key: string;
  most_text: string | null;
  least_key: string | null;
  least_text: string | null;
};

async function storedRows(
  db: Db,
  participantId: string,
  position: number
): Promise<StoredRow[]> {
  const result = await db.execute<StoredRow>(
    sql`select instrument_version, scenario, most_key, most_text,
               least_key, least_text
        from quiz_responses
        where participant_id = ${participantId} and position = ${position}`
  );
  return result.rows;
}

/** Every position this participant has an answer row for, ascending. */
async function answeredPositions(
  db: Db,
  participantId: string
): Promise<number[]> {
  const rows = await db
    .select({ position: quizResponses.position })
    .from(quizResponses)
    .where(eq(quizResponses.participantId, participantId))
    .orderBy(asc(quizResponses.position));
  return rows.map((row) => row.position);
}

describe("createResponseRepository (resolved texts)", () => {
  it("AC-1 · save stores INSTRUMENT.version with this participant's block-3 scenario and its option c and b texts, and byParticipant still returns keys only", async (ctx) => {
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
    const tag = `ana-${randomUUID().slice(0, 8)}`;
    await repos.generatedBlocks.saveBatch(
      participant.id,
      generatedBatch(tag, 1)
    );

    await repos.responses.save(
      answer(participant.id, {
        position: 3,
        mostKey: "c",
        leastKey: "b",
        shownOrder: "cbad",
      })
    );

    const rows = await storedRows(db, participant.id, 3);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.instrument_version).toBe(INSTRUMENT.version);
    expect(row.scenario).toBe(generatedBlock(tag, 3).scenario);
    expect(row.most_text).toBe(optionText(tag, 3, "c"));
    expect(row.least_text).toBe(optionText(tag, 3, "b"));
    // Resolved from this participant's block, never from the fallback constant.
    expect(row.scenario).not.toBe(INSTRUMENT.blocks[2].scenario);

    // The quiz and the scorer keep reading keys: the texts never widen the
    // domain type (docs/domain.md §10.1).
    const saved = await repos.responses.byParticipant(participant.id);
    expect(saved).toHaveLength(1);
    expect(Object.keys(saved[0]).sort()).toEqual([
      "answeredAt",
      "leastKey",
      "mostKey",
      "participantId",
      "position",
      "shownOrder",
    ]);
    expect(saved[0].mostKey).toBe("c");
    expect(saved[0].leastKey).toBe("b");
  });

  it("AC-2 · save rejects naming the participant and position 4 when no generated block exists there, and writes nothing", async (ctx) => {
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
    // Batch 2 covers positions 6..10, so this participant has blocks -- just
    // none at position 4. An answer to a block nobody was shown is a bug.
    await repos.generatedBlocks.saveBatch(
      participant.id,
      generatedBatch("ana", 2)
    );

    const failure = await repos.responses
      .save(answer(participant.id, { position: 4 }))
      .then(
        () => null,
        (error: unknown) => error as Error
      );

    expect(
      failure,
      "save() must reject when the block is missing"
    ).not.toBeNull();
    expect(failure?.message).toContain(participant.id);
    expect(failure?.message).toMatch(/\b4\b/);

    expect(await answeredPositions(db, participant.id)).toEqual([]);
    expect(await repos.responses.byParticipant(participant.id)).toEqual([]);
  });

  it("AC-3 · save with leastKey null stores most_text and leaves least_text null", async (ctx) => {
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
    const tag = `ana-${randomUUID().slice(0, 8)}`;
    await repos.generatedBlocks.saveBatch(
      participant.id,
      generatedBatch(tag, 2)
    );

    await repos.responses.save(
      answer(participant.id, {
        position: 7,
        mostKey: "d",
        leastKey: null,
        shownOrder: "dacb",
      })
    );

    const [row] = await storedRows(db, participant.id, 7);
    expect(row.scenario).toBe(generatedBlock(tag, 7).scenario);
    expect(row.most_text).toBe(optionText(tag, 7, "d"));
    expect(row.least_key).toBeNull();
    expect(row.least_text).toBeNull();
  });

  it("AC-4 · a re-answer keeps exactly one row for (participant, 3) and its most_text and least_text become option a's and option d's texts", async (ctx) => {
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
    const tag = `ana-${randomUUID().slice(0, 8)}`;
    await repos.generatedBlocks.saveBatch(
      participant.id,
      generatedBatch(tag, 1)
    );

    await repos.responses.save(
      answer(participant.id, {
        position: 3,
        mostKey: "c",
        leastKey: "b",
        shownOrder: "cbad",
      })
    );
    // The back affordance: answering block 3 again updates the keys AND the
    // texts, or the row would describe an answer nobody gave.
    await repos.responses.save(
      answer(participant.id, {
        position: 3,
        mostKey: "a",
        leastKey: "d",
        shownOrder: "adcb",
      })
    );

    // Still one row: the re-answer is an update, not a second row.
    expect(await answeredPositions(db, participant.id)).toEqual([3]);

    const rows = await storedRows(db, participant.id, 3);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.most_key).toBe("a");
    expect(row.least_key).toBe("d");
    expect(row.most_text).toBe(optionText(tag, 3, "a"));
    expect(row.least_text).toBe(optionText(tag, 3, "d"));
  });

  it("AC-5 · each row carries its own participant's scenario and option-a text, never the other's and never the fallback constant's", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);

    const ana = await repos.participants.create({
      roomId: room.id,
      gender: "F",
      birthdate: "1996-05-04",
      avatar: "avatar3",
      consent: { romantic: true, business: true, friendship: true },
      name: "Ana",
    });
    const beto = await repos.participants.create({
      roomId: room.id,
      gender: "F",
      birthdate: "1996-05-04",
      avatar: "avatar3",
      consent: { romantic: true, business: true, friendship: true },
      name: "Beto",
    });
    const anaTag = `ana-${randomUUID().slice(0, 8)}`;
    const betoTag = `beto-${randomUUID().slice(0, 8)}`;
    expect(generatedBlock(anaTag, 1).scenario).not.toBe(
      generatedBlock(betoTag, 1).scenario
    );
    await repos.generatedBlocks.saveBatch(
      ana.participant.id,
      generatedBatch(anaTag, 1)
    );
    await repos.generatedBlocks.saveBatch(
      beto.participant.id,
      generatedBatch(betoTag, 1)
    );

    for (const participantId of [ana.participant.id, beto.participant.id]) {
      await repos.responses.save(
        answer(participantId, {
          position: 1,
          mostKey: "a",
          leastKey: "b",
          shownOrder: "abcd",
        })
      );
    }

    const [anaRow] = await storedRows(db, ana.participant.id, 1);
    const [betoRow] = await storedRows(db, beto.participant.id, 1);

    expect(anaRow.scenario).toBe(generatedBlock(anaTag, 1).scenario);
    expect(anaRow.most_text).toBe(optionText(anaTag, 1, "a"));
    expect(betoRow.scenario).toBe(generatedBlock(betoTag, 1).scenario);
    expect(betoRow.most_text).toBe(optionText(betoTag, 1, "a"));

    expect(anaRow.scenario).not.toBe(betoRow.scenario);
    expect(anaRow.most_text).not.toBe(betoRow.most_text);
    for (const row of [anaRow, betoRow]) {
      expect(row.scenario).not.toBe(INSTRUMENT.blocks[0].scenario);
      expect(row.most_text).not.toBe(INSTRUMENT.blocks[0].options[0].text);
    }
  });

  it("AC-6 · the migrated quiz_responses has instrument_version, scenario, most_text and least_text, and neither pillar nor keyed", async (ctx) => {
    const db = requireDb(ctx);

    const result = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'quiz_responses'`
    );
    const columns = result.rows.map((row) => row.column_name);

    expect(columns).toContain("instrument_version");
    expect(columns).toContain("scenario");
    expect(columns).toContain("most_text");
    expect(columns).toContain("least_text");
    // Pillar and keying stay inside generated_blocks.options: an answer row
    // carrying them would put the scoring key in front of anyone reading the
    // data (docs/domain.md §10.1).
    expect(columns).not.toContain("pillar");
    expect(columns).not.toContain("keyed");
  });

  it("AC-7 · the 15th save carries its texts and sets quiz_completed_at in the same db.batch()", async (ctx) => {
    const db = requireDb(ctx);
    const repos = repositories(db);
    const room = await itRoom(db, repos);
    const { participant, sessionToken } = await repos.participants.create({
      roomId: room.id,
      gender: "F",
      birthdate: "1996-05-04",
      avatar: "avatar3",
      consent: { romantic: true, business: true, friendship: true },
      name: "Ana",
    });
    const tag = `ana-${randomUUID().slice(0, 8)}`;
    for (const batch of [1, 2, 3]) {
      await repos.generatedBlocks.saveBatch(
        participant.id,
        generatedBatch(tag, batch)
      );
    }

    for (let position = 1; position <= 14; position++) {
      await repos.responses.save(answer(participant.id, { position }));
    }
    await repos.responses.save(
      answer(participant.id, {
        position: 15,
        mostKey: "b",
        leastKey: "c",
        shownOrder: "bcad",
      }),
      { completedAt: COMPLETED_AT }
    );

    const [row] = await storedRows(db, participant.id, 15);
    expect(row.instrument_version).toBe(INSTRUMENT.version);
    expect(row.scenario).toBe(generatedBlock(tag, 15).scenario);
    expect(row.most_text).toBe(optionText(tag, 15, "b"));
    expect(row.least_text).toBe(optionText(tag, 15, "c"));

    const completed = await repos.participants.bySessionToken(sessionToken);
    expect(completed?.quizCompletedAt?.getTime()).toBe(COMPLETED_AT.getTime());

    // The response and the timestamp go in ONE db.batch(), so nobody can hold
    // fifteen answers and no completion stamp. db.transaction() throws on
    // neon-http (data-access §2), so it may not appear either. Comments are
    // stripped first, so this reads the adapter's code and not its prose.
    const code = readFileSync(
      new URL("./response-repository.ts", import.meta.url),
      "utf8"
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code.match(/\.batch\(/g)).toHaveLength(1);
    expect(code).not.toMatch(/\.transaction\(/);
  });
});
