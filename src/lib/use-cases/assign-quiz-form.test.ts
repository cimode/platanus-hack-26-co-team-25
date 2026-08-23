import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Pillar } from "../domain/quiz";
import { BLOCK_COUNT, batchOf, formFor, validateBlock } from "../domain/quiz";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import { assignQuizForm } from "./assign-quiz-form.ts";

/**
 * `assignQuizForm`: the twelve blocks a participant will be asked, written
 * once and returned.
 *
 * The properties that matter are all about cost and repeatability. The form is
 * `formFor(participantId)` — a pure function of the id — so the use case may
 * not reach for a model, may not read before it writes, and may be called
 * twice (registration, then a read that found a row missing) without the
 * second call changing what the first one recorded.
 *
 * The fake repository is inline and in-memory, recording every `saveBatch`, so
 * "one write, twelve rows" is observable rather than assumed. No adapter
 * import, so the biome.json hexagon rule holds; no database, no clock.
 */

const USE_CASE = new URL("./assign-quiz-form.ts", import.meta.url);

const P = "11111111-1111-7111-8111-111111111111";
const OTHER = "22222222-2222-7222-8222-222222222222";

interface BlocksFake extends GeneratedBlockRepository {
  /** Every saveBatch, in order: the unit of write is what this test is about. */
  readonly writes: { participantId: string; blocks: StoredBlock[] }[];
  readonly rows: Map<string, StoredBlock>;
}

function blocksFake(): BlocksFake {
  const writes: { participantId: string; blocks: StoredBlock[] }[] = [];
  const rows = new Map<string, StoredBlock>();

  return {
    writes,
    rows,
    async byBatch(participantId, batch) {
      return [...rows.entries()]
        .filter(
          ([key, row]) =>
            key.startsWith(`${participantId}:`) && row.block.batch === batch
        )
        .map(([, row]) => row)
        .sort((left, right) => left.block.position - right.block.position);
    },
    async byParticipant(participantId) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${participantId}:`))
        .map(([, row]) => row)
        .sort((left, right) => left.block.position - right.block.position);
    },
    async saveBatch(participantId, blocks) {
      writes.push({ participantId, blocks });
      // The adapter upserts on (participant_id, position); so does this.
      for (const stored of blocks) {
        rows.set(`${participantId}:${stored.block.position}`, stored);
      }
    },
  };
}

describe("assignQuizForm", () => {
  it("writes the participant's twelve bank blocks in one saveBatch, at positions 1..12 with their batch, and returns exactly what formFor deals", async () => {
    const generatedBlocks = blocksFake();

    const returned = await assignQuizForm(
      { participantId: P },
      { generatedBlocks }
    );

    expect(returned).toEqual(formFor(P));
    expect(returned).toHaveLength(BLOCK_COUNT);

    // One statement, not three of four: a form written in pieces is a form
    // that can be half-written when the invocation is killed.
    expect(generatedBlocks.writes).toHaveLength(1);
    const [write] = generatedBlocks.writes;
    expect(write.participantId).toBe(P);
    expect(write.blocks).toHaveLength(BLOCK_COUNT);

    expect(write.blocks.map((stored) => stored.block.position)).toEqual(
      Array.from({ length: BLOCK_COUNT }, (_, index) => index + 1)
    );
    for (const stored of write.blocks) {
      // "bank" is what tells a row written tonight from the live-authored
      // rows that came before the bank existed.
      expect(stored.source).toBe("bank");
      expect(stored.block.batch).toBe(batchOf(stored.block.position));
      // A row the rest of the system could not have produced would make every
      // other assertion here a statement about the fixture.
      validateBlock(stored.block);
    }

    // Three per pillar, so a participant who abandons at block 4 or block 8
    // still leaves one block of every pillar behind.
    const perPillar = new Map<Pillar, number>();
    for (const stored of write.blocks) {
      const pillar = stored.block.focusPillar;
      perPillar.set(pillar, (perPillar.get(pillar) ?? 0) + 1);
    }
    expect([...perPillar.values()]).toEqual([3, 3, 3, 3]);
  });

  it("is idempotent and deterministic: assigning twice writes the same twelve rows and leaves twelve, and another participant gets a different form", async () => {
    const generatedBlocks = blocksFake();

    const first = await assignQuizForm(
      { participantId: P },
      { generatedBlocks }
    );
    const second = await assignQuizForm(
      { participantId: P },
      { generatedBlocks }
    );

    expect(second).toEqual(first);
    expect(generatedBlocks.writes).toHaveLength(2);
    expect(generatedBlocks.writes[1].blocks).toEqual(
      generatedBlocks.writes[0].blocks
    );
    // The upsert is on (participant, position): the second call replaces, it
    // does not add. Twelve rows before, twelve rows after.
    expect(await generatedBlocks.byParticipant(P)).toHaveLength(BLOCK_COUNT);

    // Another id, another form: the whole point of dealing from four hundred
    // blocks is that the room is not answering one questionnaire.
    const other = await assignQuizForm(
      { participantId: OTHER },
      { generatedBlocks }
    );
    expect(other).toEqual(formFor(OTHER));
    expect(other.map((block) => block.scenario)).not.toEqual(
      first.map((block) => block.scenario)
    );
    expect(await generatedBlocks.byParticipant(P)).toHaveLength(BLOCK_COUNT);
    expect(await generatedBlocks.byParticipant(OTHER)).toHaveLength(
      BLOCK_COUNT
    );
  });

  it("reads nothing and can reach no model: it writes without a prior query, and the module names neither an LLM port nor a response or participant repository", async () => {
    const generatedBlocks = blocksFake();
    let reads = 0;
    const counted: GeneratedBlockRepository = {
      ...generatedBlocks,
      async byBatch(participantId, batch) {
        reads++;
        return generatedBlocks.byBatch(participantId, batch);
      },
      async byParticipant(participantId) {
        reads++;
        return generatedBlocks.byParticipant(participantId);
      },
    };

    await assignQuizForm({ participantId: P }, { generatedBlocks: counted });
    // A round trip to discover what a pure function already knows is a round
    // trip a participant waits for.
    expect(reads).toBe(0);

    // The deps interface is one repository, and the source backs that up: a
    // model call cannot appear here without this failing.
    const source = readFileSync(USE_CASE, "utf8");
    expect(source).not.toMatch(/LlmPort|llm/);
    expect(source).not.toMatch(/ResponseRepository|ParticipantRepository/);
  });
});
