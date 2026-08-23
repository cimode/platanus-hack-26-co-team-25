import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { eq, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, onTestFinished, type TestContext } from "vitest";
import type { BlockResponse } from "@/lib/domain/quiz";
import { INSTRUMENT, validateBlock } from "@/lib/domain/quiz";
import type { StoredBlock } from "@/lib/ports/generated-block-repository";
import type { StoredLatent } from "@/lib/ports/latent-repository";
import type { Room } from "@/lib/ports/room-repository";
import { scoreParticipant } from "@/lib/use-cases/score-participant";
import type { Db } from "./client";
import { createGeneratedBlockRepository } from "./generated-block-repository";
import { createLatentRepository } from "./latent-repository";
import { createParticipantRepository } from "./participant-repository";
import { createResponseRepository } from "./response-repository";
import { createRoomRepository } from "./room-repository";
import * as schema from "./schema";
import { latentEstimates, rooms as roomsTable } from "./schema";
import { integrationDb } from "./test-db";

/**
 * `createLatentRepository(db)` adapter (issue #7): the one table this issue
 * writes, `latent_estimates` (docs/domain.md §4, D13), reached through
 * `replaceForParticipant` (#30: ONE multi-row insert ... onConflictDoUpdate on
 * `(participant_id, pillar)`, never a `db.batch()` of four statements and
 * never a transaction), `byParticipant` and the one-query `byParticipants`.
 *
 * AC-9 is the safety invariant and runs today: scoring one participant must
 * never touch another participant's avatar, and scoring the same participant
 * twice must leave exactly four rows. Until the table, the adapter and the
 * `test-db.ts` guard exist it is vacuously true, asserted over what can be
 * inspected without a database:
 *
 *   1. if the schema barrel exports a `latent_estimates` table, its primary
 *      key is exactly `(participant_id, pillar)` -- the upsert target that
 *      makes the second run a no-op in row count -- and it carries the four
 *      value columns the reads and the engine depend on;
 *   2. if src/lib/adapters/db/latent-repository.ts exists, it opens no
 *      `transaction(` (neon-http cannot run one, data-access §2) and reads no
 *      clock -- `computedAt` arrives from the use case's `now`, which is what
 *      lets "B's rows unchanged in every column including computed_at" be
 *      observed.
 *
 * That first test is kept VERBATIM and is never skipped (#30). The integration
 * half is ADDED beside it rather than replacing it, through the `test-db.ts`
 * guard (skips without DATABASE_URL,
 * fails under DB_REQUIRED=1): a room created by #4's createRoomRepository at
 * INSTRUMENT.version (the Room it returns is the input to scoreParticipant),
 * participants A and B, B pre-seeded with four rows; A's 15 blocks saved
 * first through createGeneratedBlockRepository(db).saveBatch
 * (INSTRUMENT.blocks as StoredBlock[] -- docs/domain.md D16: scoring reads
 * the participant's generated_blocks rows, never the constant) and then A's
 * 15 quiz_responses through createResponseRepository(db);
 * `scoreParticipant({ participantId: A, room }, { responses, generatedBlocks,
 * latents, now })` twice with the real createResponseRepository,
 * createGeneratedBlockRepository and createLatentRepository adapters; then A
 * has exactly four rows with means in [0, 1], se > 0 and scorer_version
 * "map-luce-v1", B's rows are byte-equal including computed_at,
 * `byParticipant(A)` exposes only mean and se per pillar, and
 * `byParticipants([A, B])` returns both in one query with the same values.
 * The room is deleted at the end so the cascade removes everything.
 *
 * The integration half asserts the write's SHAPE before it reaches for the
 * database, so the "one multi-row upsert, never a batch, never a transaction"
 * rule (#30, generated-block-repository.ts:88-112) is enforced on a laptop
 * with no DATABASE_URL as well as in CI.
 */

const ADAPTER = new URL("./latent-repository.ts", import.meta.url);

/** The adapter's source, or "" when the file does not exist yet. */
function readAdapter(): string {
  return existsSync(ADAPTER) ? readFileSync(ADAPTER, "utf8") : "";
}

/** Comments cannot open a transaction; drop them before matching. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The `latent_estimates` table from the barrel, whatever its export name. */
function latentEstimatesTable(): PgTable | undefined {
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (
      is(value, PgTable) &&
      getTableConfig(value).name === "latent_estimates"
    ) {
      return value;
    }
  }
  return undefined;
}

const COMPUTED_AT = new Date("2026-08-22T18:00:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T17:45:00.000Z");
const COMPLETED_AT = new Date("2026-08-22T17:50:00.000Z");
const SEEDED_AT = new Date("2026-08-21T09:00:00.000Z");
const KEYS = ["a", "b", "c", "d"] as const;
const PILLAR_NAMES = [
  "regulation",
  "politeness",
  "reliability",
  "agency",
] as const;

/** The guard, inside the test so a failure is reported against AC-9. */
function requireDb(ctx: TestContext): Db {
  const guard = integrationDb(process.env);
  if (guard.mode === "skip") {
    console.warn(guard.notice);
    ctx.skip(guard.notice);
  }
  return guard.db;
}

/** A room of this run's own, at INSTRUMENT.version. */
async function itRoom(db: Db): Promise<Room> {
  const room = await createRoomRepository(db).create({
    slug: `it-${randomUUID().slice(0, 8)}`,
    name: "Integration room",
    instrumentVersion: INSTRUMENT.version,
  });
  onTestFinished(async () => {
    await db.delete(roomsTable).where(eq(roomsTable.id, room.id));
  });
  return room;
}

/** D16: scoring reads the participant's own generated_blocks rows. */
async function giveGeneratedForm(db: Db, participantId: string): Promise<void> {
  const generatedBlocks = createGeneratedBlockRepository(db);
  for (const batch of [1, 2, 3]) {
    const blocks: StoredBlock[] = INSTRUMENT.blocks
      .filter((block) => block.batch === batch)
      .map((block) => {
        validateBlock(block);
        return { block, source: "fallback" as const };
      });
    await generatedBlocks.saveBatch(participantId, blocks);
  }
}

function answer(participantId: string, position: number): BlockResponse {
  return {
    participantId,
    position,
    mostKey: KEYS[position % 4],
    leastKey: KEYS[(position + 1) % 4],
    shownOrder: "abcd",
    answeredAt: ANSWERED_AT,
  };
}

/** B's pre-seeded avatar: four rows nothing in this test may disturb. */
function seedRows(): StoredLatent[] {
  return PILLAR_NAMES.map((pillar, index) => ({
    pillar,
    mean: 0.2 + index * 0.1,
    se: 0.15,
    scorerVersion: "map-luce-v1",
    computedAt: SEEDED_AT,
  }));
}

async function rowsOf(db: Db, participantId: string) {
  return await db
    .select()
    .from(latentEstimates)
    .where(eq(latentEstimates.participantId, participantId))
    .orderBy(latentEstimates.pillar);
}

describe("safety invariants", () => {
  // Runs today, on purpose. Vacuously true until #7 lands -- no table, no
  // adapter -- and it keeps holding as each of those arrives. The blocks A
  // is scored on come from generated_blocks (already in the schema barrel),
  // which this test neither writes nor inspects: the invariant is about
  // latent_estimates alone.
  it("AC-9 · scoring A twice leaves exactly four rows for A and B's rows untouched", () => {
    // 1. The table's primary key is the idempotency mechanism.
    const table = latentEstimatesTable();
    if (table !== undefined) {
      const config = getTableConfig(table);
      const pk = new Set<string>();
      for (const column of config.columns) {
        if (column.primary) pk.add(column.name);
      }
      for (const key of config.primaryKeys) {
        for (const column of key.columns) pk.add(column.name);
      }
      expect([...pk].sort()).toEqual(["participant_id", "pillar"]);

      const names = config.columns.map((column) => column.name);
      for (const required of ["mean", "se", "scorer_version", "computed_at"]) {
        expect(names, `latent_estimates.${required} is missing`).toContain(
          required
        );
      }
    }

    // 2. The adapter writes in a batch and never reads a clock.
    const code = withoutComments(readAdapter());
    expect(code, "latent-repository.ts opens a transaction").not.toMatch(
      /\.transaction\s*\(/
    );
    expect(code, "latent-repository.ts reads a clock").not.toMatch(
      /\bDate\.now\s*\(|\bnew\s+Date\b/
    );
    expect(code, "latent-repository.ts calls Math.random").not.toMatch(
      /\bMath\.random\s*\(/
    );
  });
  // The second half of AC-9, added beside the structural one rather than
  // replacing it (#30). The source-shape assertions run before the guard, so
  // "one multi-row upsert, never a batch" is enforced with no database too.
  it("AC-9 · (integration) scoring A twice through the real adapters leaves exactly four rows, B's four rows untouched in every column including computed_at, and deleting the room cascades", async (ctx) => {
    // One statement, not four: a single INSERT is already atomic and is one
    // HTTP round trip on neon-http (generated-block-repository.ts:88-112).
    const code = withoutComments(readAdapter());
    expect(
      code,
      "replaceForParticipant must upsert with onConflictDoUpdate"
    ).toMatch(/\.onConflictDoUpdate\s*\(/);
    expect(
      (code.match(/\.insert\s*\(/g) ?? []).length,
      "replaceForParticipant is exactly one multi-row insert"
    ).toBe(1);
    expect(code, "latent-repository.ts uses db.batch()").not.toMatch(
      /\.batch\s*\(/
    );

    const db = requireDb(ctx);
    const room = await itRoom(db);
    const participants = createParticipantRepository(db);
    const latents = createLatentRepository(db);

    const a = (
      await participants.create({
        roomId: room.id,
        gender: "F",
        birthdate: "1996-05-04",
        avatar: "avatar3",
        consent: { romantic: true, business: true, friendship: true },
        name: "Ana",
      })
    ).participant;
    const b = (
      await participants.create({
        roomId: room.id,
        gender: "F",
        birthdate: "1996-05-04",
        avatar: "avatar3",
        consent: { romantic: true, business: true, friendship: true },
        name: "Beto",
      })
    ).participant;

    // B is scored already and must come out of this test byte-identical.
    await latents.replaceForParticipant(b.id, seedRows());
    const bBefore = await rowsOf(db, b.id);
    expect(bBefore).toHaveLength(4);

    await giveGeneratedForm(db, a.id);
    const responses = createResponseRepository(db);
    for (let position = 1; position <= 14; position++) {
      await responses.save(answer(a.id, position));
    }
    await responses.save(answer(a.id, 15), { completedAt: COMPLETED_AT });

    const deps = {
      responses,
      generatedBlocks: createGeneratedBlockRepository(db),
      latents,
      now: () => COMPUTED_AT,
    };
    const input = {
      participantId: a.id,
      room,
      quizCompletedAt: COMPLETED_AT,
    };

    const first = await scoreParticipant(input, deps);
    expect(first).toEqual({ scored: true, responsesUsed: 15 });
    const second = await scoreParticipant(input, deps);
    expect(second).toEqual({ scored: true, responsesUsed: 15 });

    // Four rows after two runs: the composite pk makes the second an upsert.
    const aRows = await rowsOf(db, a.id);
    expect(aRows).toHaveLength(4);
    expect(aRows.map((row) => row.pillar).sort()).toEqual(
      [...PILLAR_NAMES].sort()
    );
    for (const row of aRows) {
      expect(row.mean).toBeGreaterThanOrEqual(0);
      expect(row.mean).toBeLessThanOrEqual(1);
      expect(row.se).toBeGreaterThan(0);
      expect(row.scorerVersion).toBe("map-luce-v1");
    }

    // Scoring A never touches another participant's avatar.
    expect(await rowsOf(db, b.id)).toEqual(bBefore);

    // The read exposes mean and se per pillar, and nothing else -- no
    // scorer_version, no computed_at (LatentSource's shape).
    const aPosteriors = await latents.byParticipant(a.id);
    expect(Object.keys(aPosteriors).sort()).toEqual([...PILLAR_NAMES].sort());
    for (const pillar of PILLAR_NAMES) {
      const row = aRows.find((r) => r.pillar === pillar);
      expect(row, `latent_estimates has no ${pillar} row for A`).toBeDefined();
      expect(aPosteriors[pillar]).toEqual({ mean: row?.mean, se: row?.se });
    }

    // One call for the whole room, same values for both people.
    const both = await latents.byParticipants([a.id, b.id]);
    expect(both.get(a.id)).toEqual(aPosteriors);
    expect(both.get(b.id)).toEqual(await latents.byParticipant(b.id));

    expect((await latents.computedAtFor(a.id))?.getTime()).toBe(
      COMPUTED_AT.getTime()
    );

    // "Delete me" takes the avatar with it.
    await db.delete(roomsTable).where(eq(roomsTable.id, room.id));
    expect(await rowsOf(db, a.id)).toEqual([]);
    expect(await rowsOf(db, b.id)).toEqual([]);
  });
});
