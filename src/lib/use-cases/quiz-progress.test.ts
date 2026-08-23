import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONSENT,
  type Participant,
  type SessionToken,
} from "../domain/participant";
import type { BlockResponse } from "../domain/quiz/index.ts";
import { batchOf, INSTRUMENT } from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import type { LlmPort } from "../ports/llm";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { Room, RoomRepository } from "../ports/room-repository";
import { answerBlock } from "./answer-block.ts";
import {
  InstrumentVersionMismatchError,
  type PublicBlock,
  type QuizProgressDeps,
  quizProgress,
} from "./quiz-progress.ts";

/**
 * `quizProgress` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` when `room.instrumentVersion` differs from
 * `INSTRUMENT.version` (docs/domain.md §5 / §10.1(b) -- the structural
 * version) before reading a single response or generated block; then reads
 * progress from the rows alone -- first unanswered position, its batch,
 * answered count, `completed` from `quizCompletedAt` -- obtains *this
 * participant's* block for that position through
 * `ensureQuizBatch({ participantId, batch }, { llm, generatedBlocks })`
 * (docs/domain.md D16: stored `generated_blocks` rows, or authored and stored
 * inline, with the committed constant as the per-position fallback; never
 * the `INSTRUMENT` constant read directly) and returns the public block view
 * (no `pillar`, `keyed`, `focusPillar`, `domain` or `source`) with a
 * deterministic `shownOrder` (docs/domain.md §0, D10).
 *
 * All three tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call), ResponseRepository (recording every read and
 * save), a GeneratedBlockRepository (byBatch, byParticipant, saveBatch over
 * one map keyed by participant id and position, recording every call) and an
 * LlmPort whose `generate` rejects and counts its calls -- no adapter import,
 * so the biome.json hexagon rule holds -- and no database.
 */

const PARTICIPANT_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "session-known" as SessionToken;
const UNKNOWN_TOKEN = "session-unknown" as SessionToken;
const NOW = new Date("2026-08-22T21:00:00.000Z");

/** Recorded calls, per fake. The tests assert on these as much as on results. */
interface Calls {
  roomsById: string[];
  responseReads: string[];
  responseSaves: {
    response: BlockResponse;
    opts?: { completedAt: Date };
  }[];
  byBatch: { participantId: string; batch: number }[];
  byParticipant: string[];
  saveBatch: { participantId: string; positions: number[] }[];
  markQuizCompleted: number;
}

/**
 * The 15 blocks this participant was "generated", distinguishable from the
 * constant: same structure, `escena <position>` as the scenario.
 */
function seededBlocks(): StoredBlock[] {
  return INSTRUMENT.blocks.map((block) => ({
    block: { ...block, scenario: `escena ${block.position}` },
    source: "generated" as const,
  }));
}

function responseAt(position: number): BlockResponse {
  return {
    participantId: PARTICIPANT_ID,
    position,
    mostKey: "a",
    leastKey: "b",
    shownOrder: shownOrderFor(PARTICIPANT_ID, position),
    answeredAt: NOW,
  };
}

interface WorldOptions {
  answered?: number[];
  quizCompletedAt?: Date | null;
  instrumentVersion?: string;
  blocks?: StoredBlock[];
  /** Shared across worlds so "in the whole run" is countable. */
  generateCalls?: { n: number };
}

function makeWorld(options: WorldOptions = {}) {
  const calls: Calls = {
    roomsById: [],
    responseReads: [],
    responseSaves: [],
    byBatch: [],
    byParticipant: [],
    saveBatch: [],
    markQuizCompleted: 0,
  };
  const generateCalls = options.generateCalls ?? { n: 0 };

  const participant: Participant = {
    id: PARTICIPANT_ID,
    roomId: ROOM_ID,
    name: "Ana Ramírez",
    gender: "F",
    birthdate: "1996-05-04",
    photoUrl: null,
    team: null,
    track: null,
    consent: { ...DEFAULT_CONSENT },
    declared: {
      moneyPosture: null,
      rootedness: null,
      familyGravity: null,
      capacityHoursBand: null,
      distanceBand: null,
      chronotype: null,
      tags: [],
      acquaintances: [],
    },
    dataConsentAt: null,
    declaredAt: null,
    quizCompletedAt: options.quizCompletedAt ?? null,
    createdAt: NOW,
  };

  const rooms = new Map<string, Room>([
    [
      ROOM_ID,
      {
        id: ROOM_ID,
        slug: "e2e-unit",
        name: "Unit room",
        instrumentVersion: options.instrumentVersion ?? INSTRUMENT.version,
        createdAt: NOW,
      },
    ],
  ]);

  const responseRows = new Map<number, BlockResponse>();
  for (const position of options.answered ?? []) {
    responseRows.set(position, responseAt(position));
  }

  const blockRows = new Map<string, StoredBlock>();
  for (const stored of options.blocks ?? seededBlocks()) {
    blockRows.set(`${PARTICIPANT_ID}:${stored.block.position}`, stored);
  }

  const participants: ParticipantRepository = {
    async create() {
      throw new Error("create is not part of this use case");
    },
    async bySessionToken(token) {
      return token === TOKEN ? participant : null;
    },
    async setPhoto() {
      throw new Error("setPhoto is not part of this use case");
    },
    async setConsent() {
      throw new Error("setConsent is not part of this use case");
    },
    async saveDeclared() {
      throw new Error("saveDeclared is not part of this use case");
    },
    async upsertRomanticGate() {
      throw new Error("upsertRomanticGate is not part of this use case");
    },
    async upsertBusinessGate() {
      throw new Error("upsertBusinessGate is not part of this use case");
    },
    async markQuizCompleted(_id, at) {
      calls.markQuizCompleted++;
      participant.quizCompletedAt = at;
    },
    async byRoom() {
      throw new Error("byRoom is not part of this use case");
    },
    async byRoomForRanking() {
      throw new Error("byRoomForRanking is not part of this use case");
    },
  };

  const roomRepository: RoomRepository = {
    async bySlug(slug) {
      return [...rooms.values()].find((room) => room.slug === slug) ?? null;
    },
    async byId(id) {
      calls.roomsById.push(id);
      return rooms.get(id) ?? null;
    },
    async create() {
      throw new Error("create is not part of this use case");
    },
  };

  const responses: ResponseRepository = {
    async save(response, opts) {
      calls.responseSaves.push({ response, opts });
      responseRows.set(response.position, response);
      if (opts?.completedAt) participant.quizCompletedAt = opts.completedAt;
    },
    async byParticipant(id) {
      calls.responseReads.push(id);
      return [...responseRows.values()].sort(
        (left, right) => left.position - right.position
      );
    },
  };

  const generatedBlocks: GeneratedBlockRepository = {
    async byBatch(participantId, batch) {
      calls.byBatch.push({ participantId, batch });
      return [...blockRows.entries()]
        .filter(
          ([key, row]) =>
            key.startsWith(`${participantId}:`) && row.block.batch === batch
        )
        .map(([, row]) => row)
        .sort((left, right) => left.block.position - right.block.position);
    },
    async byParticipant(participantId) {
      calls.byParticipant.push(participantId);
      return [...blockRows.entries()]
        .filter(([key]) => key.startsWith(`${participantId}:`))
        .map(([, row]) => row)
        .sort((left, right) => left.block.position - right.block.position);
    },
    async saveBatch(participantId, blocks) {
      calls.saveBatch.push({
        participantId,
        positions: blocks.map((stored) => stored.block.position),
      });
      for (const stored of blocks) {
        blockRows.set(`${participantId}:${stored.block.position}`, stored);
      }
    },
  };

  const llm: LlmPort = {
    generate() {
      generateCalls.n++;
      return Promise.reject(new Error("the model is down"));
    },
  };

  const deps: QuizProgressDeps = {
    participants,
    responses,
    rooms: roomRepository,
    llm,
    generatedBlocks,
  };

  return {
    deps,
    answerDeps: {
      participants,
      responses,
      rooms: roomRepository,
      generatedBlocks,
    },
    calls,
    generateCalls,
    participant,
    responseRows,
    blockRows,
    setInstrumentVersion(version: string) {
      const room = rooms.get(ROOM_ID);
      if (room) rooms.set(ROOM_ID, { ...room, instrumentVersion: version });
    },
    removeRoom() {
      rooms.delete(ROOM_ID);
    },
  };
}

/** Nothing about the pillars, the keying or the source may reach the caller. */
function expectPublicOnly(block: PublicBlock | null | undefined): PublicBlock {
  expect(block).toBeTruthy();
  const shown = block as PublicBlock;
  expect(shown).not.toHaveProperty("focusPillar");
  expect(shown).not.toHaveProperty("domain");
  expect(shown).not.toHaveProperty("source");
  expect(shown.options).toHaveLength(4);
  for (const option of shown.options) {
    expect(option).not.toHaveProperty("pillar");
    expect(option).not.toHaveProperty("keyed");
    expect(typeof option.text).toBe("string");
  }
  return shown;
}

describe("quizProgress", () => {
  it("AC-8 · resumes at the first unanswered position with its batch and count, serving the participant's stored block through generatedBlocks.byBatch without calling generate, serves block 15 pre-marked when all rows exist unmarked, clamps at, keeps shownOrder stable without leaking pillar, keyed, focusPillar, domain or source, and reads the room by id exactly once per resolved participant", async () => {
    const generateCalls = { n: 0 };
    const all = Array.from({ length: 15 }, (_, index) => index + 1);

    // Responses at {1, 2, 3, 5}: the frontier is the first *gap*, not the count.
    const gapped = makeWorld({ answered: [1, 2, 3, 5], generateCalls });
    const atGap = await quizProgress({ sessionToken: TOKEN }, gapped.deps);
    expect(atGap?.nextPosition).toBe(4);
    expect(atGap?.batch).toBe(1);
    expect(atGap?.answeredCount).toBe(4);
    expect(atGap?.completed).toBe(false);
    expect(expectPublicOnly(atGap?.block).scenario).toBe("escena 4");
    expect(gapped.calls.roomsById).toEqual([ROOM_ID]);
    expect(gapped.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 1,
    });

    // Positions 1-10 answered: block 11, which is batch 3.
    const tenDone = makeWorld({
      answered: Array.from({ length: 10 }, (_, index) => index + 1),
      generateCalls,
    });
    const atEleven = await quizProgress({ sessionToken: TOKEN }, tenDone.deps);
    expect(atEleven?.nextPosition).toBe(11);
    expect(atEleven?.batch).toBe(3);
    expect(atEleven?.answeredCount).toBe(10);
    expect(expectPublicOnly(atEleven?.block).scenario).toBe("escena 11");
    expect(tenDone.calls.roomsById).toEqual([ROOM_ID]);
    expect(tenDone.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 3,
    });

    // Completed: the timestamp is what "done" means, and no block is fetched.
    const done = makeWorld({
      answered: all,
      quizCompletedAt: NOW,
      generateCalls,
    });
    const finished = await quizProgress({ sessionToken: TOKEN }, done.deps);
    expect(finished?.completed).toBe(true);
    expect(finished?.block ?? null).toBeNull();
    expect(done.calls.byBatch).toHaveLength(0);
    expect(done.calls.roomsById).toEqual([ROOM_ID]);

    // Fifteen rows and a null timestamp: block 15 again, pre-marked.
    const unmarked = makeWorld({
      answered: all,
      quizCompletedAt: null,
      generateCalls,
    });
    const lastBlock = await quizProgress(
      { sessionToken: TOKEN },
      unmarked.deps
    );
    expect(lastBlock?.completed).toBe(false);
    expect(lastBlock?.nextPosition).toBe(15);
    expect(expectPublicOnly(lastBlock?.block).scenario).toBe("escena 15");
    expect(lastBlock?.existing).toEqual(responseAt(15));

    // Untouched.
    const fresh = makeWorld({ answered: [], generateCalls });
    const opening = await quizProgress({ sessionToken: TOKEN }, fresh.deps);
    expect(opening?.nextPosition).toBe(1);
    expect(opening?.batch).toBe(1);
    expect(opening?.answeredCount).toBe(0);
    expect(expectPublicOnly(opening?.block).scenario).toBe("escena 1");

    // An unknown session is null, and never reaches the room or the blocks.
    const stranger = makeWorld({ answered: [], generateCalls });
    const nobody = await quizProgress(
      { sessionToken: UNKNOWN_TOKEN },
      stranger.deps
    );
    expect(nobody).toBeNull();
    expect(stranger.calls.roomsById).toHaveLength(0);
    expect(stranger.calls.byBatch).toHaveLength(0);

    // Twice with the same inputs: the same order, and the stored one.
    const first = await quizProgress({ sessionToken: TOKEN }, gapped.deps);
    const second = await quizProgress({ sessionToken: TOKEN }, gapped.deps);
    expect(first?.shownOrder).toBe(second?.shownOrder);
    expect(first?.shownOrder).toBe(shownOrderFor(PARTICIPANT_ID, 4));
    expect([...(first?.shownOrder ?? "")].sort().join("")).toBe("abcd");

    // ...and it is not one order repeated for all fifteen positions.
    const orders: string[] = [];
    for (const position of all) {
      const world = makeWorld({
        answered: all.slice(0, position - 1),
        generateCalls,
      });
      const view = await quizProgress({ sessionToken: TOKEN }, world.deps);
      expect(view?.nextPosition).toBe(position);
      expect(view?.shownOrder).toBe(shownOrderFor(PARTICIPANT_ID, position));
      expect([...(view?.shownOrder ?? "")].sort().join("")).toBe("abcd");
      expect(world.calls.byBatch).toContainEqual({
        participantId: PARTICIPANT_ID,
        batch: batchOf(position),
      });
      orders.push(view?.shownOrder ?? "");
    }
    expect(new Set(orders).size).toBeGreaterThan(1);

    // `at` ahead of the frontier is clamped to it; nobody jumps forward.
    const clamped = makeWorld({
      answered: [1, 2, 3, 4, 5, 6, 7],
      generateCalls,
    });
    const behind = await quizProgress(
      { sessionToken: TOKEN, at: 12 },
      clamped.deps
    );
    expect(behind?.nextPosition).toBe(8);
    expect(expectPublicOnly(behind?.block).scenario).toBe("escena 8");
    expect(clamped.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 2,
    });

    // Stored blocks are served; the model is never woken up.
    expect(generateCalls.n).toBe(0);
  });

  it("AC-10 · throws InstrumentVersionMismatchError naming v0 and v1 before any response or generated_blocks read, returns null for an unknown token without reading the room, recovers once the version matches, and throws naming the roomId when byId returns null", async () => {
    const generateCalls = { n: 0 };
    const world = makeWorld({
      answered: [1, 2, 3],
      instrumentVersion: "v0",
      generateCalls,
    });

    const mismatch = await quizProgress(
      { sessionToken: TOKEN },
      world.deps
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(mismatch).toBeInstanceOf(InstrumentVersionMismatchError);
    expect((mismatch as Error).message).toContain("v0");
    expect((mismatch as Error).message).toContain(INSTRUMENT.version);
    expect(world.calls.roomsById).toEqual([ROOM_ID]);
    expect(world.calls.responseReads).toHaveLength(0);
    expect(world.calls.responseSaves).toHaveLength(0);
    expect(world.calls.byBatch).toHaveLength(0);
    expect(world.calls.byParticipant).toHaveLength(0);
    expect(generateCalls.n).toBe(0);

    // The session is resolved first, so an unknown token never reads a room.
    const roomReadsBefore = world.calls.roomsById.length;
    await expect(
      quizProgress({ sessionToken: UNKNOWN_TOKEN }, world.deps)
    ).resolves.toBeNull();
    expect(world.calls.roomsById).toHaveLength(roomReadsBefore);

    // Same room, structural version now matching: ordinary progress.
    world.setInstrumentVersion(INSTRUMENT.version);
    const recovered = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(recovered?.nextPosition).toBe(4);
    expect(expectPublicOnly(recovered?.block).scenario).toBe("escena 4");

    // A room deleted under a live session: an operator failure, named.
    const readsAfterRecovery = world.calls.responseReads.length;
    const savesAfterRecovery = world.calls.responseSaves.length;
    const blockCallsAfterRecovery = world.calls.byBatch.length;
    world.removeRoom();
    const missingRoom = await quizProgress(
      { sessionToken: TOKEN },
      world.deps
    ).then(
      () => null,
      (error: unknown) => error
    );
    expect(missingRoom).toBeInstanceOf(Error);
    expect((missingRoom as Error).message).toContain(ROOM_ID);
    expect(world.calls.responseReads).toHaveLength(readsAfterRecovery);
    expect(world.calls.responseSaves).toHaveLength(savesAfterRecovery);
    expect(world.calls.byBatch).toHaveLength(blockCallsAfterRecovery);
  });

  it("AC-12 · with an empty GeneratedBlockRepository and a rejecting LlmPort, quizProgress authors batch 1 inline as five fallback rows equal to the constant's blocks, answerBlock advances through positions 1..5, and the next quizProgress authors batch 2 the same way -- generate called exactly twice", async () => {
    const generateCalls = { n: 0 };
    const world = makeWorld({ answered: [], blocks: [], generateCalls });

    const opening = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(opening?.nextPosition).toBe(1);
    expect(opening?.batch).toBe(1);
    const firstBlock = expectPublicOnly(opening?.block);
    expect(firstBlock.scenario).toBe(INSTRUMENT.blocks[0].scenario);
    expect(firstBlock.options.map((option) => option.text)).toEqual(
      INSTRUMENT.blocks[0].options.map((option) => option.text)
    );

    // The whole batch was authored and stored -- as fallbacks, since the model
    // rejected -- and the model was asked exactly once.
    expect(world.blockRows.size).toBe(5);
    for (const position of [1, 2, 3, 4, 5]) {
      const stored = world.blockRows.get(`${PARTICIPANT_ID}:${position}`);
      expect(stored?.source).toBe("fallback");
      expect(stored?.block).toEqual(INSTRUMENT.blocks[position - 1]);
    }
    expect(generateCalls.n).toBe(1);

    for (const position of [1, 2, 3, 4, 5]) {
      const result = await answerBlock(
        {
          sessionToken: TOKEN,
          position,
          mostKey: "a",
          leastKey: "b",
          now: NOW,
        },
        world.answerDeps
      );
      expect(result.advanced).toBe(true);
      expect(result.nextPosition).toBe(position + 1);
    }
    expect(world.responseRows.size).toBe(5);
    for (const position of [1, 2, 3, 4, 5]) {
      expect(world.responseRows.get(position)?.shownOrder).toBe(
        shownOrderFor(PARTICIPANT_ID, position)
      );
    }

    const second = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(second?.nextPosition).toBe(6);
    expect(second?.batch).toBe(2);
    const sixthBlock = expectPublicOnly(second?.block);
    expect(sixthBlock.scenario).toBe(INSTRUMENT.blocks[5].scenario);
    expect(sixthBlock.options.map((option) => option.text)).toEqual(
      INSTRUMENT.blocks[5].options.map((option) => option.text)
    );

    expect(world.blockRows.size).toBe(10);
    for (let position = 1; position <= 10; position++) {
      const stored = world.blockRows.get(`${PARTICIPANT_ID}:${position}`);
      expect(stored?.source).toBe("fallback");
      expect(stored?.block).toEqual(INSTRUMENT.blocks[position - 1]);
    }
    expect(generateCalls.n).toBe(2);
  });
});
