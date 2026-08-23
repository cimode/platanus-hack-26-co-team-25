import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ParticipantId } from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz";
import { BLOCK_COUNT, INSTRUMENT, PILLARS } from "../domain/quiz";
import type { StoredBlock } from "../ports/generated-block-repository";
import type {
  LatentPosteriors,
  LatentRepository,
  StoredLatent,
} from "../ports/latent-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { Room } from "../ports/room-repository";
import { scoreParticipant } from "./score-participant";

/**
 * `scoreParticipant` use case (issue #7): checks the passed `Room` against
 * `INSTRUMENT.version` first (docs/domain.md §5 frozen-structure invariant,
 * §10.1(b) -- the version names the shared structure, not the scenarios),
 * reads the participant's responses through
 * `ResponseRepository.byParticipant`, then *that participant's* stored blocks
 * through `GeneratedBlockRepository.byParticipant` (the form is per person --
 * twelve bank blocks dealt by `formFor(participantId)` and recorded as rows --
 * never the `INSTRUMENT` constant), builds
 * `itemParametersOfBlocks(stored.map((s) => s.block))` -- NOT
 * `itemParametersOf`, which is the convenience wrapper over the committed
 * `Instrument` (items.ts:120) and would silently score every participant
 * against the same twelve blocks -- runs
 * `estimateLatents(responses, items)` on the responses unchanged, and writes
 * the four `StoredLatent` rows through
 * `LatentRepository.replaceForParticipant` with `computedAt = deps.now()`.
 * Zero responses fetch no blocks and write nothing; a version mismatch, a
 * response at a position with no stored block, or an invalid response set
 * rejects before any write.
 *
 * Amended for #30. The input is
 * `{ participantId, room, quizCompletedAt }` and step 2 is the completion
 * gate: `quizCompletedAt === null` returns `{ scored: false, reason:
 * "quiz-incomplete" }` having read nothing. A partially answered quiz must
 * never acquire rows, because `engine.ts` computes `bothMeasured` from row
 * PRESENCE rather than from evidence -- four near-prior rows would arm
 * `flags.bothHighAgency` and the `pursueWithdraw` surface that engine.ts
 * states must never fire at zero data, and would destroy the absent-row
 * degraded mode AUDIT.md S15 depends on.
 *
 * All four tests use inline in-memory fakes of ResponseRepository,
 * GeneratedBlockRepository and LatentRepository that record every call, a
 * `Room` literal as the input (never a RoomRepository lookup) and a fixed
 * `now` -- no adapter import, so the biome.json hexagon rule holds. The fake
 * blocks are `INSTRUMENT.blocks` wrapped as `StoredBlock[]` (source "bank"),
 * or a prefix of them for AC-11 -- the one place the constant is convenient,
 * because it is a valid twelve-block form; the use case itself never reads it
 * for parameters.
 *
 * AC-11 is also where `itemParametersOfBlocks` is pinned behaviourally: the
 * fake holds blocks at positions 1..10 only, so an implementation that reached
 * for `itemParametersOf(INSTRUMENT)` would find a block at position 11, score
 * happily and write four rows -- and fail both halves of that criterion.
 */

const USE_CASE = new URL("./score-participant.ts", import.meta.url);

const NOW = new Date("2026-08-22T18:00:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T17:45:00.000Z");
const COMPLETED_AT = new Date("2026-08-22T17:50:00.000Z");
const KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

const P = "11111111-1111-7111-8111-111111111111" as ParticipantId;
const OTHER = "22222222-2222-7222-8222-222222222222" as ParticipantId;

/** A `Room` literal -- the input is the room, never a RoomRepository lookup. */
function roomAt(instrumentVersion: string): Room {
  return {
    id: "33333333-3333-7333-8333-333333333333",
    slug: "sala-demo",
    name: "Sala demo",
    instrumentVersion,
    createdAt: new Date("2026-08-22T16:00:00.000Z"),
  };
}

/** A valid answer per position: most !== least, keys in a..d. */
function answersFor(
  participantId: ParticipantId,
  positions: readonly number[]
): BlockResponse[] {
  return positions.map((position, index) => ({
    participantId,
    position,
    mostKey: KEYS[index % 4],
    leastKey: KEYS[(index + 1) % 4],
    shownOrder: "abcd",
    answeredAt: ANSWERED_AT,
  }));
}

const ALL_POSITIONS = Array.from({ length: BLOCK_COUNT }, (_, i) => i + 1);

/** The participant's own form, as `generated_blocks` holds it. */
function storedBlocks(count = BLOCK_COUNT): StoredBlock[] {
  return INSTRUMENT.blocks
    .slice(0, count)
    .map((block) => ({ block, source: "bank" as const }));
}

interface ResponsesFake extends ResponseRepository {
  readonly calls: ParticipantId[];
}

function responsesFake(
  rows: Readonly<Record<string, BlockResponse[]>>
): ResponsesFake {
  const calls: ParticipantId[] = [];
  return {
    calls,
    save() {
      throw new Error(
        "responses.save must never be called by scoreParticipant"
      );
    },
    byParticipant(id) {
      calls.push(id);
      return Promise.resolve([...(rows[id] ?? [])]);
    },
  };
}

interface BlocksFake {
  readonly calls: string[];
  byBatch(participantId: string, batch: number): Promise<StoredBlock[]>;
  byParticipant(participantId: string): Promise<StoredBlock[]>;
  saveBatch(participantId: string, blocks: StoredBlock[]): Promise<void>;
}

function blocksFake(rows: Readonly<Record<string, StoredBlock[]>>): BlocksFake {
  const calls: string[] = [];
  return {
    calls,
    byBatch(participantId, batch) {
      calls.push(`byBatch:${participantId}:${batch}`);
      return Promise.resolve(
        (rows[participantId] ?? []).filter((s) => s.block.batch === batch)
      );
    },
    byParticipant(participantId) {
      calls.push(`byParticipant:${participantId}`);
      return Promise.resolve([...(rows[participantId] ?? [])]);
    },
    saveBatch() {
      throw new Error(
        "generatedBlocks.saveBatch must never be called by scoreParticipant"
      );
    },
  };
}

interface LatentsFake extends LatentRepository {
  readonly writes: { id: ParticipantId; rows: StoredLatent[] }[];
}

function latentsFake(): LatentsFake {
  const writes: { id: ParticipantId; rows: StoredLatent[] }[] = [];
  const store = new Map<ParticipantId, StoredLatent[]>();

  function read(id: ParticipantId): LatentPosteriors {
    const posteriors: LatentPosteriors = {};
    for (const row of store.get(id) ?? []) {
      posteriors[row.pillar] = { mean: row.mean, se: row.se };
    }
    return posteriors;
  }

  return {
    writes,
    replaceForParticipant(id, rows) {
      writes.push({ id, rows: [...rows] });
      // The real table upserts on (participant_id, pillar): four rows in,
      // four rows held, however many times it is called.
      const byPillar = new Map<string, StoredLatent>();
      for (const existing of store.get(id) ?? []) {
        byPillar.set(existing.pillar, existing);
      }
      for (const row of rows) byPillar.set(row.pillar, row);
      store.set(id, [...byPillar.values()]);
      return Promise.resolve();
    },
    byParticipant(id) {
      return Promise.resolve(read(id));
    },
    byParticipants(ids) {
      const map = new Map<ParticipantId, LatentPosteriors>();
      for (const id of ids) map.set(id, read(id));
      return Promise.resolve(map);
    },
    computedAtFor(id) {
      const rows = store.get(id) ?? [];
      if (rows.length === 0) return Promise.resolve(null);
      return Promise.resolve(
        new Date(Math.max(...rows.map((r) => r.computedAt.getTime())))
      );
    },
  };
}

function depsWith(
  responses: ResponsesFake,
  generatedBlocks: BlocksFake,
  latents: LatentsFake
) {
  return { responses, generatedBlocks, latents, now: () => NOW };
}

/** The message of a rejected call, so a criterion can name the position. */
async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the call to reject, but it resolved");
}

describe("scoreParticipant", () => {
  it('AC-6 · resolves { scored: false, reason: "no-responses" } without reading generated_blocks, and writes nothing, when the participant has no responses', async () => {
    const responses = responsesFake({ [P]: [] });
    const generatedBlocks = blocksFake({ [P]: storedBlocks() });
    const latents = latentsFake();

    const result = await scoreParticipant(
      {
        participantId: P,
        room: roomAt(INSTRUMENT.version),
        quizCompletedAt: COMPLETED_AT,
      },
      depsWith(responses, generatedBlocks, latents)
    );

    expect(result).toEqual({ scored: false, reason: "no-responses" });
    // Zero responses fetch no blocks: the read that would cost a round trip
    // never happens.
    expect(generatedBlocks.calls).toEqual([]);
    expect(latents.writes).toEqual([]);
    // The absent row is the signal (AUDIT.md S15): the engine imputes
    // PRIOR_MEAN / PRIOR_SE from a missing pillar, which four near-prior rows
    // would destroy.
    expect(await latents.byParticipant(P)).toEqual({});
  });

  it("AC-7 · rejects with the Error naming position 13 or the duplicated position 3 against the participant's 12 stored blocks, and writes nothing", async () => {
    const beyondTheForm = [
      ...answersFor(P, ALL_POSITIONS),
      { ...answersFor(P, [1])[0], position: 13 },
    ];
    const duplicated = [
      ...answersFor(P, ALL_POSITIONS),
      {
        ...answersFor(P, [3])[0],
        mostKey: "d" as OptionKey,
        leastKey: "a" as OptionKey,
      },
    ];

    const outOfRange = responsesFake({ [P]: beyondTheForm });
    const outOfRangeBlocks = blocksFake({ [P]: storedBlocks() });
    const outOfRangeLatents = latentsFake();
    const first = await messageOf(
      scoreParticipant(
        {
          participantId: P,
          room: roomAt(INSTRUMENT.version),
          quizCompletedAt: COMPLETED_AT,
        },
        depsWith(outOfRange, outOfRangeBlocks, outOfRangeLatents)
      )
    );
    expect(first).toMatch(/\b13\b/);
    expect(outOfRangeLatents.writes).toEqual([]);

    const twice = responsesFake({ [P]: duplicated });
    const twiceBlocks = blocksFake({ [P]: storedBlocks() });
    const twiceLatents = latentsFake();
    const second = await messageOf(
      scoreParticipant(
        {
          participantId: P,
          room: roomAt(INSTRUMENT.version),
          quizCompletedAt: COMPLETED_AT,
        },
        depsWith(twice, twiceBlocks, twiceLatents)
      )
    );
    expect(second).toMatch(/\b3\b/);
    expect(twiceLatents.writes).toEqual([]);
  });

  it('AC-10 · a room at "v0" rejects naming both versions before responses or blocks are read; the same fakes at INSTRUMENT.version score 12 and write four rows', async () => {
    const responses = responsesFake({ [P]: answersFor(P, ALL_POSITIONS) });
    const generatedBlocks = blocksFake({ [P]: storedBlocks() });
    const latents = latentsFake();
    const deps = depsWith(responses, generatedBlocks, latents);

    const message = await messageOf(
      scoreParticipant(
        { participantId: P, room: roomAt("v0"), quizCompletedAt: COMPLETED_AT },
        deps
      )
    );
    expect(message).toContain("v0");
    expect(message).toContain(INSTRUMENT.version);
    // A mismatched room is never read from.
    expect(responses.calls).toEqual([]);
    expect(generatedBlocks.calls).toEqual([]);
    expect(latents.writes).toEqual([]);

    const result = await scoreParticipant(
      {
        participantId: P,
        room: roomAt(INSTRUMENT.version),
        quizCompletedAt: COMPLETED_AT,
      },
      deps
    );
    expect(result).toEqual({ scored: true, responsesUsed: BLOCK_COUNT });
    expect(latents.writes).toHaveLength(1);
    expect(latents.writes[0].rows).toHaveLength(4);
  });

  it("AC-11 · a response at position 11 with stored blocks only at 1..10 rejects naming 11, writes nothing and leaves latents.byParticipant(P) empty", async () => {
    const responses = responsesFake({
      [P]: answersFor(P, [...Array.from({ length: 10 }, (_, i) => i + 1), 11]),
    });
    // The participant's form stops at 10. An implementation reading the
    // committed INSTRUMENT instead would find a block at 11 and score.
    const generatedBlocks = blocksFake({ [P]: storedBlocks(10) });
    const latents = latentsFake();

    const message = await messageOf(
      scoreParticipant(
        {
          participantId: P,
          room: roomAt(INSTRUMENT.version),
          quizCompletedAt: COMPLETED_AT,
        },
        depsWith(responses, generatedBlocks, latents)
      )
    );

    expect(message).toMatch(/\b11\b/);
    expect(latents.writes).toEqual([]);
    expect(await latents.byParticipant(P)).toEqual({});
  });

  it("AC-12 · a completed participant resolves { scored: true, responsesUsed: 12 } and writes exactly four rows, one per pillar, with computedAt equal to the fixed now; a second identical call is idempotent", async () => {
    const responses = responsesFake({ [P]: answersFor(P, ALL_POSITIONS) });
    const generatedBlocks = blocksFake({ [P]: storedBlocks() });
    const latents = latentsFake();
    const deps = depsWith(responses, generatedBlocks, latents);
    const input = {
      participantId: P,
      room: roomAt(INSTRUMENT.version),
      quizCompletedAt: COMPLETED_AT,
    };

    const result = await scoreParticipant(input, deps);

    expect(result).toEqual({ scored: true, responsesUsed: BLOCK_COUNT });
    expect(latents.writes).toHaveLength(1);
    expect(latents.writes[0].id).toBe(P);

    const rows = latents.writes[0].rows;
    expect(rows).toHaveLength(4);
    expect([...rows].map((row) => row.pillar).sort()).toEqual(
      [...PILLARS].sort()
    );
    for (const row of rows) {
      expect(row.mean).toBeGreaterThan(0);
      expect(row.mean).toBeLessThan(1);
      expect(row.se).toBeGreaterThan(0);
      expect(row.scorerVersion).toBe("map-luce-v1");
      expect(row.computedAt.getTime()).toBe(NOW.getTime());
    }

    // Idempotent: the same input scores to the same object (the estimator is
    // deterministic) and the upsert leaves four rows, not eight.
    const again = await scoreParticipant(input, deps);
    expect(again).toEqual({ scored: true, responsesUsed: BLOCK_COUNT });
    expect(latents.writes).toHaveLength(2);
    expect(latents.writes[1].rows).toEqual(rows);

    const posteriors = await latents.byParticipant(P);
    expect(Object.keys(posteriors).sort()).toEqual([...PILLARS].sort());
    for (const row of rows) {
      expect(posteriors[row.pillar]).toEqual({ mean: row.mean, se: row.se });
    }
  });

  // kind: safety -- NEVER skipped (intake: "a silently-skipped safety test is
  // the most expensive kind of green in this product"). The source-level
  // assertion below is the floor that holds with or without the use case: the
  // gate on quizCompletedAt runs BEFORE any byParticipant read. The
  // two-participant scenario from #30's AC-13 follows it, so the floor is
  // asserted first even while the scenario is red.
  it("AC-13 · a participant whose quiz is incomplete is never scored and never acquires rows", async () => {
    const source = existsSync(USE_CASE) ? readFileSync(USE_CASE, "utf8") : "";
    if (source === "") {
      expect(source).toBe("");
      return;
    }
    const body = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const gate = body.indexOf("quizCompletedAt");
    const firstRead = Math.min(
      ...["byParticipant"].map((m) => {
        const i = body.indexOf(m);
        return i === -1 ? Number.POSITIVE_INFINITY : i;
      })
    );
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(firstRead);

    // Two participants, same fakes, same room: one three blocks in with no
    // completion timestamp, one finished.
    const responses = responsesFake({
      [P]: answersFor(P, [1, 2, 3]),
      [OTHER]: answersFor(OTHER, ALL_POSITIONS),
    });
    const generatedBlocks = blocksFake({
      [P]: storedBlocks(),
      [OTHER]: storedBlocks(),
    });
    const latents = latentsFake();
    const deps = depsWith(responses, generatedBlocks, latents);
    const room = roomAt(INSTRUMENT.version);

    const incomplete = await scoreParticipant(
      { participantId: P, room, quizCompletedAt: null },
      deps
    );

    expect(incomplete).toEqual({ scored: false, reason: "quiz-incomplete" });
    // Nothing was read for them: the gate is step 2, before either repository.
    expect(responses.calls).toEqual([]);
    expect(generatedBlocks.calls).toEqual([]);
    expect(latents.writes).toEqual([]);
    // No near-prior rows: engine.ts's bothMeasured tests row PRESENCE, not
    // evidence (AUDIT.md S15), so three answered blocks must leave no trace.
    expect(await latents.byParticipant(P)).toEqual({});

    const completed = await scoreParticipant(
      { participantId: OTHER, room, quizCompletedAt: COMPLETED_AT },
      deps
    );

    expect(completed).toEqual({ scored: true, responsesUsed: BLOCK_COUNT });
    expect(latents.writes).toHaveLength(1);
    expect(latents.writes[0].id).toBe(OTHER);
    expect(latents.writes[0].rows).toHaveLength(4);
    // The incomplete participant is still absent after the other was scored.
    expect(await latents.byParticipant(P)).toEqual({});
  });
});
