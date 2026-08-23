import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONSENT,
  type Participant,
  type SessionToken,
} from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz/index.ts";
import { BLOCK_COUNT, formFor, INSTRUMENT } from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { Room, RoomRepository } from "../ports/room-repository";
import { type AnswerBlockDeps, answerBlock } from "./answer-block.ts";
import { InstrumentVersionMismatchError } from "./quiz-progress.ts";

/**
 * `answerBlock` use case (issue #9): resolves the participant by session
 * token, loads its room through `rooms.byId(participant.roomId)` and throws
 * `InstrumentVersionMismatchError` on a version mismatch before anything else
 * (docs/domain.md §5 / §10.1(b)); checks position 1..12; loads *this
 * participant's* block at `position` from
 * `generatedBlocks.byBatch(participantId, batchOf(position))` and rejects,
 * naming the participant id and the position, when no stored block has that
 * position (a write never assigns a form -- `saveBatch` is never called here,
 * because `quizProgress` already wrote the row it served); validates
 * `mostKey` and `leastKey`
 * against that block's option keys, most ≠ least and the presence of
 * `leastKey` unless single-pick; recomputes `shownOrderFor`; and writes
 * through `responses.save`, passing `{ completedAt: now }` only on the
 * last-position write that completes the quiz (docs/domain.md §7 --
 * `participants.markQuizCompleted` is never called). Reports
 * `{ completed: true }` or `{ nextPosition, advanced }`, with `nextPosition`
 * recomputed from the rows after the write.
 *
 * Both tests use inline in-memory fakes of ParticipantRepository,
 * RoomRepository (bySlug, byId, create over one map keyed by room id,
 * recording every byId call), ResponseRepository (recording every save with
 * its opts and, when `completedAt` is given, setting the fake participant's
 * `quizCompletedAt` as the adapter's batch does) and a GeneratedBlockRepository
 * seeded with the participant's twelve blocks (recording every call) -- no
 * adapter import, so the biome.json hexagon rule holds -- a fixed `now` and
 * no database.
 */

const PARTICIPANT_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "session-known" as SessionToken;
const UNKNOWN_TOKEN = "session-unknown" as SessionToken;
const NOW = new Date("2026-08-22T22:00:00.000Z");

interface Calls {
  roomsById: string[];
  responseReads: string[];
  responseSaves: {
    response: BlockResponse;
    opts?: { completedAt: Date };
  }[];
  byBatch: { participantId: string; batch: number }[];
  byParticipant: string[];
  saveBatch: string[];
  markQuizCompleted: number;
}

/** This participant's own twelve blocks, told apart from the bank by scenario. */
function seededBlocks(): StoredBlock[] {
  return formFor(PARTICIPANT_ID).map((block) => ({
    block: { ...block, scenario: `escena ${block.position}` },
    source: "bank" as const,
  }));
}

function makeWorld(options: { instrumentVersion?: string } = {}) {
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
    name: "Beto Díaz",
    gender: "F",
    birthdate: "1996-05-04",
    avatar: null,
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
    quizCompletedAt: null,
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
  const blockRows = new Map<string, StoredBlock>();
  for (const stored of seededBlocks()) {
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
      // What the adapter's single db.batch() does (docs/domain.md §7).
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
      calls.saveBatch.push(participantId);
      for (const stored of blocks) {
        blockRows.set(`${participantId}:${stored.block.position}`, stored);
      }
    },
  };

  const deps: AnswerBlockDeps = {
    participants,
    responses,
    rooms: roomRepository,
    generatedBlocks,
  };

  return {
    deps,
    calls,
    participant,
    responseRows,
    blockRows,
    /** A row put there by a fixture, not by a save -- the count stays honest. */
    seedResponses(positions: number[]) {
      for (const position of positions) {
        responseRows.set(position, {
          participantId: PARTICIPANT_ID,
          position,
          mostKey: "a",
          leastKey: "b",
          shownOrder: shownOrderFor(PARTICIPANT_ID, position),
          answeredAt: NOW,
        });
      }
    },
    removeBlock(position: number) {
      blockRows.delete(`${PARTICIPANT_ID}:${position}`);
    },
    setInstrumentVersion(version: string) {
      const room = rooms.get(ROOM_ID);
      if (room) rooms.set(ROOM_ID, { ...room, instrumentVersion: version });
    },
  };
}

/** The error a rejected call carries, so its reason can be read. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(Error);
  return error as Error;
}

describe("answerBlock", () => {
  it("AC-9 · rejects most = least, a key the participant's block lacks, positions 0 and 13, a missing least, a position with no stored block and an unknown token without saving; stores least null under single-pick; upserts one row per position with shownOrderFor; reports the recomputed frontier with advanced; and completes the last block through a single save carrying { completedAt: now } with saveBatch and markQuizCompleted never called", async () => {
    const world = makeWorld();

    // most === least.
    const sameKey = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 3,
          mostKey: "b",
          leastKey: "b",
          now: NOW,
        },
        world.deps
      )
    );
    expect(sameKey.message).toMatch(/most/i);
    expect(sameKey.message).toMatch(/least/i);

    // "e" is not a key of this participant's block 3.
    const noSuchKey = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 3,
          mostKey: "e" as OptionKey,
          leastKey: "a",
          now: NOW,
        },
        world.deps
      )
    );
    expect(noSuchKey.message).toMatch(/option|key/i);
    expect(noSuchKey.message).toMatch(/\be\b/);

    // Position out of range, both ends.
    const tooLow = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 0,
          mostKey: "a",
          leastKey: "b",
          now: NOW,
        },
        world.deps
      )
    );
    expect(tooLow.message).toMatch(/position/i);
    expect(tooLow.message).toMatch(/\b0\b/);

    const tooHigh = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 13,
          mostKey: "a",
          leastKey: "b",
          now: NOW,
        },
        world.deps
      )
    );
    expect(tooHigh.message).toMatch(/position/i);
    expect(tooHigh.message).toMatch(/\b13\b/);

    // "Menos yo" is not optional unless the server says so.
    const missingLeast = await rejection(
      answerBlock(
        { sessionToken: TOKEN, position: 3, mostKey: "a", now: NOW },
        world.deps
      )
    );
    expect(missingLeast.message).toMatch(/least/i);
    expect(missingLeast.message).toMatch(/requir/i);

    // A block this participant has no stored row for: named, not written.
    world.removeBlock(9);
    const noBlock = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 9,
          mostKey: "a",
          leastKey: "b",
          now: NOW,
        },
        world.deps
      )
    );
    expect(noBlock.message).toContain(PARTICIPANT_ID);
    expect(noBlock.message).toMatch(/\b9\b/);

    // An unknown session writes nothing either.
    const stranger = await rejection(
      answerBlock(
        {
          sessionToken: UNKNOWN_TOKEN,
          position: 3,
          mostKey: "a",
          leastKey: "b",
          now: NOW,
        },
        world.deps
      )
    );
    expect(stranger.message).toMatch(/session|participant|token/i);

    // Six rejections and an unknown token: not one row, not one save.
    expect(world.calls.responseSaves).toHaveLength(0);
    expect(world.responseRows.size).toBe(0);

    // Single-pick: "Menos yo" is dropped and stored as null.
    const singlePick = await answerBlock(
      {
        sessionToken: TOKEN,
        position: 3,
        mostKey: "a",
        singlePick: true,
        now: NOW,
      },
      world.deps
    );
    expect(singlePick.advanced).toBe(true);
    expect(world.responseRows.size).toBe(1);
    expect(world.responseRows.get(3)?.leastKey).toBeNull();

    // The same position twice is an upsert, not a second row.
    for (const _attempt of [1, 2]) {
      await answerBlock(
        {
          sessionToken: TOKEN,
          position: 3,
          mostKey: "a",
          leastKey: "c",
          now: NOW,
        },
        world.deps
      );
    }
    expect(world.responseRows.size).toBe(1);
    const atThree = world.responseRows.get(3);
    expect(atThree?.mostKey).toBe("a");
    expect(atThree?.leastKey).toBe("c");
    expect(atThree?.shownOrder).toBe(shownOrderFor(PARTICIPANT_ID, 3));

    // Positions 1-7 answered: a re-answer behind the frontier does not move it.
    world.seedResponses([1, 2, 3, 4, 5, 6, 7]);
    const reAnswer = await answerBlock(
      {
        sessionToken: TOKEN,
        position: 3,
        mostKey: "d",
        leastKey: "a",
        now: NOW,
      },
      world.deps
    );
    expect(reAnswer.nextPosition).toBe(8);
    expect(reAnswer.advanced).toBe(false);

    const atFrontier = await answerBlock(
      {
        sessionToken: TOKEN,
        position: 8,
        mostKey: "a",
        leastKey: "b",
        now: NOW,
      },
      world.deps
    );
    expect(atFrontier.nextPosition).toBe(9);
    expect(atFrontier.advanced).toBe(true);

    // The completing write: every other row already there, the last answered.
    world.seedResponses([9, 10, 11]);
    expect(world.participant.quizCompletedAt).toBeNull();
    const savesBeforeLast = world.calls.responseSaves.length;
    const last = await answerBlock(
      {
        sessionToken: TOKEN,
        position: BLOCK_COUNT,
        mostKey: "a",
        leastKey: "b",
        now: NOW,
      },
      world.deps
    );
    expect(last.completed).toBe(true);
    const completingSaves = world.calls.responseSaves.slice(savesBeforeLast);
    expect(completingSaves).toHaveLength(1);
    expect(completingSaves[0].response.participantId).toBe(PARTICIPANT_ID);
    expect(completingSaves[0].response.position).toBe(BLOCK_COUNT);
    expect(completingSaves[0].opts).toEqual({ completedAt: NOW });
    expect(world.participant.quizCompletedAt).toEqual(NOW);

    // Anything after that is an ordinary upsert, with no second completion.
    await answerBlock(
      {
        sessionToken: TOKEN,
        position: 4,
        mostKey: "a",
        leastKey: "b",
        now: NOW,
      },
      world.deps
    );
    const lastSave =
      world.calls.responseSaves[world.calls.responseSaves.length - 1];
    expect(lastSave.response.position).toBe(4);
    expect(lastSave.opts?.completedAt).toBeUndefined();

    expect(
      world.calls.responseSaves.filter((save) => save.opts?.completedAt)
    ).toHaveLength(1);
    // A write never authors, and completion has exactly one write path.
    expect(world.calls.saveBatch).toHaveLength(0);
    expect(world.calls.markQuizCompleted).toBe(0);
  });

  it("AC-11 · throws InstrumentVersionMismatchError naming v0 and v1 after one rooms.byId call, with no response read, no generatedBlocks call, no save and no markQuizCompleted; then saves one row at position 3 with no completedAt after exactly one generatedBlocks.byBatch call for batch 1 once the room version matches", async () => {
    const world = makeWorld({ instrumentVersion: "v0" });

    const mismatch = await rejection(
      answerBlock(
        {
          sessionToken: TOKEN,
          position: 3,
          mostKey: "a",
          leastKey: "c",
          now: NOW,
        },
        world.deps
      )
    );
    expect(mismatch).toBeInstanceOf(InstrumentVersionMismatchError);
    expect(mismatch.message).toContain("v0");
    expect(mismatch.message).toContain(INSTRUMENT.version);
    expect(world.calls.roomsById).toEqual([ROOM_ID]);
    expect(world.calls.responseReads).toHaveLength(0);
    expect(world.calls.responseSaves).toHaveLength(0);
    expect(world.calls.byBatch).toHaveLength(0);
    expect(world.calls.byParticipant).toHaveLength(0);
    expect(world.calls.markQuizCompleted).toBe(0);

    world.setInstrumentVersion(INSTRUMENT.version);
    await answerBlock(
      {
        sessionToken: TOKEN,
        position: 3,
        mostKey: "a",
        leastKey: "c",
        now: NOW,
      },
      world.deps
    );
    expect(world.calls.responseSaves).toHaveLength(1);
    expect(world.calls.responseSaves[0].response.position).toBe(3);
    expect(world.calls.responseSaves[0].opts?.completedAt).toBeUndefined();
    expect(world.responseRows.size).toBe(1);
    expect(world.calls.byBatch).toEqual([
      { participantId: PARTICIPANT_ID, batch: 1 },
    ]);
  });
});
