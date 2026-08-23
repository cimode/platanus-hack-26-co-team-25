import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONSENT,
  type Participant,
  type SessionToken,
} from "../domain/participant";
import type { BlockResponse } from "../domain/quiz/index.ts";
import {
  BLOCK_COUNT,
  batchOf,
  formFor,
  INSTRUMENT,
} from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
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
 * answered count, `completed` from `quizCompletedAt` -- reads *this
 * participant's* stored block for that position (never the `INSTRUMENT`
 * constant, and never a model: the deps carry no `LlmPort` at all) and returns
 * the public block view (no `pillar`, `keyed`, `focusPillar`, `domain` or
 * `source`) with a deterministic `shownOrder` (docs/domain.md §0, D10). When
 * the row is missing it assigns the form -- `formFor(participantId)`, twelve
 * bank blocks, one INSERT -- and serves the block it just wrote: there is no
 * waiting state, because there is nothing to wait for.
 *
 * All fakes are inline and in-memory -- no adapter import, so the biome.json
 * hexagon rule holds -- and no database.
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
 * The twelve rows this participant's form was recorded as, with the scenario
 * replaced by `escena <position>`.
 *
 * Rewriting the text is what makes the two paths tell themselves apart: a
 * block the test seeded reads "escena 4", a block `quizProgress` had to assign
 * for itself carries the bank's own scenario.
 */
function seededBlocks(): StoredBlock[] {
  return formFor(PARTICIPANT_ID).map((block) => ({
    block: { ...block, scenario: `escena ${block.position}` },
    source: "bank" as const,
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

  const participant: Participant = {
    id: PARTICIPANT_ID,
    roomId: ROOM_ID,
    name: "Ana Ramírez",
    gender: "F",
    birthdate: "1996-05-04",
    avatar: "avatar3",
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
        const key = `${participantId}:${stored.block.position}`;
        const current = blockRows.get(key);
        // The adapter's ON CONFLICT, in miniature: an existing row is replaced
        // only when it is a legacy `fallback` nobody has answered yet.
        const replaceable =
          current === undefined ||
          (current.source === "fallback" &&
            !responseRows.has(stored.block.position));
        if (replaceable) blockRows.set(key, stored);
      }
    },
  };

  const deps: QuizProgressDeps = {
    participants,
    responses,
    rooms: roomRepository,
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
  it("AC-8 · resumes at the first unanswered position with its batch and count, serving the participant's stored block through generatedBlocks.byBatch, serves block 15 pre-marked when all rows exist unmarked, clamps at, keeps shownOrder stable without leaking pillar, keyed, focusPillar, domain or source, carries roomId and avatar, and reads the room by id exactly once per resolved participant", async () => {
    const all = Array.from({ length: BLOCK_COUNT }, (_, index) => index + 1);

    // Responses at {1, 2, 3, 5}: the frontier is the first *gap*, not the count.
    const gapped = makeWorld({ answered: [1, 2, 3, 5] });
    const atGap = await quizProgress({ sessionToken: TOKEN }, gapped.deps);
    expect(atGap?.nextPosition).toBe(4);
    expect(atGap?.batch).toBe(1);
    expect(atGap?.answeredCount).toBe(4);
    expect(atGap?.completed).toBe(false);
    expect(atGap?.roomId).toBe(ROOM_ID);
    expect(atGap?.avatar).toBe("avatar3");
    expect(expectPublicOnly(atGap?.block).scenario).toBe("escena 4");
    expect(gapped.calls.roomsById).toEqual([ROOM_ID]);
    expect(gapped.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 1,
    });

    // Positions 1-8 answered: block 9, which is batch 3.
    const tenDone = makeWorld({
      answered: Array.from({ length: 8 }, (_, index) => index + 1),
    });
    const atNine = await quizProgress({ sessionToken: TOKEN }, tenDone.deps);
    expect(atNine?.nextPosition).toBe(9);
    expect(atNine?.batch).toBe(3);
    expect(atNine?.answeredCount).toBe(8);
    expect(expectPublicOnly(atNine?.block).scenario).toBe("escena 9");
    expect(tenDone.calls.roomsById).toEqual([ROOM_ID]);
    expect(tenDone.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 3,
    });

    // Completed: the timestamp is what "done" means, and no block is fetched.
    const done = makeWorld({ answered: all, quizCompletedAt: NOW });
    const finished = await quizProgress({ sessionToken: TOKEN }, done.deps);
    expect(finished?.completed).toBe(true);
    expect(finished?.block ?? null).toBeNull();
    expect(finished?.roomId).toBe(ROOM_ID);
    expect(finished?.avatar).toBe("avatar3");
    expect(done.calls.byBatch).toHaveLength(0);
    expect(done.calls.roomsById).toEqual([ROOM_ID]);

    // Twelve rows and a null timestamp: the last block again, pre-marked.
    const unmarked = makeWorld({ answered: all, quizCompletedAt: null });
    const lastBlock = await quizProgress(
      { sessionToken: TOKEN },
      unmarked.deps
    );
    expect(lastBlock?.completed).toBe(false);
    expect(lastBlock?.nextPosition).toBe(BLOCK_COUNT);
    expect(expectPublicOnly(lastBlock?.block).scenario).toBe(
      `escena ${BLOCK_COUNT}`
    );
    expect(lastBlock?.existing).toEqual(responseAt(BLOCK_COUNT));

    // Untouched.
    const fresh = makeWorld({ answered: [] });
    const opening = await quizProgress({ sessionToken: TOKEN }, fresh.deps);
    expect(opening?.nextPosition).toBe(1);
    expect(opening?.batch).toBe(1);
    expect(opening?.answeredCount).toBe(0);
    expect(expectPublicOnly(opening?.block).scenario).toBe("escena 1");

    // An unknown session is null, and never reaches the room or the blocks.
    const stranger = makeWorld({ answered: [] });
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

    // ...and it is not one order repeated for all twelve positions.
    const orders: string[] = [];
    for (const position of all) {
      const world = makeWorld({ answered: all.slice(0, position - 1) });
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
    const clamped = makeWorld({ answered: [1, 2, 3, 4, 5] });
    const behind = await quizProgress(
      { sessionToken: TOKEN, at: 11 },
      clamped.deps
    );
    expect(behind?.nextPosition).toBe(6);
    expect(expectPublicOnly(behind?.block).scenario).toBe("escena 6");
    expect(clamped.calls.byBatch).toContainEqual({
      participantId: PARTICIPANT_ID,
      batch: 2,
    });

    // A read never writes a block.
    expect(clamped.calls.saveBatch).toHaveLength(0);
    expect(gapped.calls.saveBatch).toHaveLength(0);
  });

  it("AC-10 · throws InstrumentVersionMismatchError naming v0 and v1 before any response or generated_blocks read, returns null for an unknown token without reading the room, recovers once the version matches, and throws naming the roomId when byId returns null", async () => {
    const world = makeWorld({ answered: [1, 2, 3], instrumentVersion: "v0" });

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

  it("AC-12 · with an empty GeneratedBlockRepository the block is served anyway -- the form is assigned in one saveBatch of twelve and the bank's own scenario is returned -- and answerBlock then advances through 1..4 with nothing further written", async () => {
    const world = makeWorld({ answered: [], blocks: [] });
    const form = formFor(PARTICIPANT_ID);

    const opening = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(opening?.nextPosition).toBe(1);
    expect(opening?.batch).toBe(1);
    expect(opening?.completed).toBe(false);
    expect(opening?.existing).toBeNull();
    expect(opening?.roomId).toBe(ROOM_ID);
    expect(opening?.avatar).toBe("avatar3");
    // No waiting: the block is the bank's, and it came back on this render.
    expect(expectPublicOnly(opening?.block).scenario).toBe(form[0].scenario);
    expect(opening?.shownOrder).toBe(shownOrderFor(PARTICIPANT_ID, 1));

    // The whole form, in one write, without a model anywhere near it.
    expect(world.calls.saveBatch).toEqual([
      {
        participantId: PARTICIPANT_ID,
        positions: Array.from({ length: BLOCK_COUNT }, (_, i) => i + 1),
      },
    ]);
    expect(world.blockRows.size).toBe(BLOCK_COUNT);

    for (const position of [1, 2, 3, 4]) {
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
    expect(world.responseRows.size).toBe(4);

    // Position 5 is in batch 2, which the same write already covered: the rows
    // are there, so the second render assigns nothing.
    const second = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(second?.nextPosition).toBe(5);
    expect(second?.batch).toBe(2);
    expect(second?.answeredCount).toBe(4);
    expect(expectPublicOnly(second?.block).scenario).toBe(form[4].scenario);
    expect(world.calls.saveBatch).toHaveLength(1);

    // Looking back at an answered block still works.
    const back = await quizProgress({ sessionToken: TOKEN, at: 3 }, world.deps);
    expect(back?.nextPosition).toBe(3);
    expect(expectPublicOnly(back?.block).scenario).toBe(form[2].scenario);
    expect(back?.existing?.position).toBe(3);
    expect(world.calls.saveBatch).toHaveLength(1);
  });

  it("assigns the form again over a legacy fallback row nobody answered, and leaves the one they did answer alone", async () => {
    const fallbackOnly = INSTRUMENT.blocks.slice(0, 4).map((block) => ({
      block,
      source: "fallback" as const,
    }));
    const world = makeWorld({ answered: [1], blocks: fallbackOnly });
    const form = formFor(PARTICIPANT_ID);

    // Position 2: a fallback row is the old committed instrument, not this
    // person's block, so the form is assigned and the bank's block is served.
    const healed = await quizProgress({ sessionToken: TOKEN }, world.deps);
    expect(healed?.nextPosition).toBe(2);
    expect(expectPublicOnly(healed?.block).scenario).toBe(form[1].scenario);
    expect(world.calls.saveBatch).toHaveLength(1);

    // Position 1 was answered against the fallback row: it is the question the
    // answer refers to, and the write above left it alone, so looking back
    // still shows it.
    const answered = await quizProgress(
      { sessionToken: TOKEN, at: 1 },
      world.deps
    );
    expect(expectPublicOnly(answered?.block).scenario).toBe(
      INSTRUMENT.blocks[0].scenario
    );
    expect(world.calls.saveBatch).toHaveLength(1);
  });
});
