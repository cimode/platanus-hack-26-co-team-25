import { describe, expect, it } from "vitest";

import { failingLlm, stubLlm } from "../adapters/llm/fake";
import {
  type Assignment,
  assignmentsForBatch,
} from "../domain/quiz/assignments.ts";
import { INSTRUMENT, validateBlock } from "../domain/quiz/instrument.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import { ensureQuizBatch, prefetchQuizBatch } from "./ensure-quiz-batch.ts";

/**
 * `ensureQuizBatch` is the only way a screen gets blocks, so what matters is:
 * it does not call a model when the blocks already exist, it records whether a
 * block was generated or fell back, it feeds earlier scenarios into the prompt
 * so batch 3 cannot reuse batch 1's joke, and `prefetchQuizBatch` never
 * rejects — it runs inside `after()`, where a rejection crashes the invocation.
 *
 * The repository fake is inline and in-memory: importing the Drizzle adapter
 * here would violate the hexagon rule `biome.json` enforces.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;
const KEYS = ["a", "b", "c", "d"] as const;

function authoredFor(plan: Assignment) {
  const others = PILLARS.filter((p) => p !== plan.focusPillar);
  const pillars = [plan.focusPillar, ...others];
  return {
    position: plan.position,
    scenario: `Escena ${plan.position} sobre ${plan.domain}.`,
    options: KEYS.map((key, i) => ({
      key,
      text: `opción ${key}`,
      pillar: pillars[i],
      keyed: i === 0 ? ("reversed" as const) : ("positive" as const),
    })),
  };
}

function goodBatch(participantId: string, batch: number) {
  return { blocks: assignmentsForBatch(participantId, batch).map(authoredFor) };
}

/** In-memory repository, upserting on (participantId, position) like the real one. */
function fakeRepo(seed: StoredBlock[] = [], participantId = "p-1") {
  const rows = new Map<string, StoredBlock>();
  for (const s of seed) rows.set(`${participantId}:${s.block.position}`, s);

  const calls = { byBatch: 0, byParticipant: 0, saveBatch: 0 };
  const repo: GeneratedBlockRepository = {
    async byBatch(id, batch) {
      calls.byBatch++;
      return [...rows.entries()]
        .filter(([k, v]) => k.startsWith(`${id}:`) && v.block.batch === batch)
        .map(([, v]) => v)
        .sort((a, b) => a.block.position - b.block.position);
    },
    async byParticipant(id) {
      calls.byParticipant++;
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${id}:`))
        .map(([, v]) => v)
        .sort((a, b) => a.block.position - b.block.position);
    },
    async saveBatch(id, blocks) {
      calls.saveBatch++;
      for (const s of blocks) rows.set(`${id}:${s.block.position}`, s);
    },
  };
  return { repo, calls, rows };
}

describe("ensureQuizBatch", () => {
  it("serves stored blocks without calling the model", async () => {
    const { repo, calls } = fakeRepo(
      assignmentsForBatch("p-1", 1).map((plan) => ({
        block: {
          position: plan.position,
          batch: plan.batch,
          focusPillar: plan.focusPillar,
          domain: plan.domain,
          scenario: `ya escrito ${plan.position}`,
          options: INSTRUMENT.blocks[plan.position - 1].options,
        },
        source: "generated" as const,
      }))
    );

    const blocks = await ensureQuizBatch(
      { participantId: "p-1", batch: 1 },
      {
        llm: failingLlm(new Error("must not be called")),
        generatedBlocks: repo,
      }
    );

    expect(blocks).toHaveLength(5);
    expect(blocks[0].scenario).toBe("ya escrito 1");
    expect(calls.saveBatch).toBe(0);
  });

  it("authors and stores when nothing exists, recording the source", async () => {
    const { repo, calls, rows } = fakeRepo([], "p-2");

    const blocks = await ensureQuizBatch(
      { participantId: "p-2", batch: 1 },
      { llm: stubLlm(() => goodBatch("p-2", 1)), generatedBlocks: repo }
    );

    expect(blocks).toHaveLength(5);
    expect(calls.saveBatch).toBe(1);
    expect(rows.size).toBe(5);
    for (const stored of rows.values()) {
      expect(stored.source).toBe("generated");
      expect(() => validateBlock(stored.block)).not.toThrow();
    }
  });

  it("records fallback blocks as fallback when the model is down", async () => {
    const { repo, rows } = fakeRepo([], "p-3");

    await ensureQuizBatch(
      { participantId: "p-3", batch: 1 },
      { llm: failingLlm(new Error("gateway 503")), generatedBlocks: repo }
    );

    expect([...rows.values()].map((s) => s.source)).toEqual(
      Array(5).fill("fallback")
    );
  });

  it("feeds earlier batches' scenarios into the prompt for batch 2", async () => {
    const { repo } = fakeRepo([], "p-4");
    await ensureQuizBatch(
      { participantId: "p-4", batch: 1 },
      { llm: stubLlm(() => goodBatch("p-4", 1)), generatedBlocks: repo }
    );

    const prompts: string[] = [];
    await ensureQuizBatch(
      { participantId: "p-4", batch: 2 },
      {
        llm: {
          async generate(request) {
            prompts.push(request.prompt);
            return request.schema.parse(goodBatch("p-4", 2));
          },
        },
        generatedBlocks: repo,
      }
    );

    expect(prompts).toHaveLength(1);
    // Batch 1's scenarios must be visible to the author of batch 2 — this is
    // the guard against the cross-batch duplicate the offline pipeline shipped.
    expect(prompts[0]).toContain("Escena 1 sobre");
    expect(prompts[0]).toContain("Escena 5 sobre");
  });

  it("regenerates a partly written batch left by a crashed run", async () => {
    const plan = assignmentsForBatch("p-5", 1);
    const { repo, calls, rows } = fakeRepo(
      plan.slice(0, 2).map((p) => ({
        block: {
          position: p.position,
          batch: p.batch,
          focusPillar: p.focusPillar,
          domain: p.domain,
          scenario: `parcial ${p.position}`,
          options: INSTRUMENT.blocks[p.position - 1].options,
        },
        source: "generated" as const,
      })),
      "p-5"
    );

    const blocks = await ensureQuizBatch(
      { participantId: "p-5", batch: 1 },
      { llm: stubLlm(() => goodBatch("p-5", 1)), generatedBlocks: repo }
    );

    expect(calls.saveBatch).toBe(1);
    expect(blocks).toHaveLength(5);
    // The upsert overwrote the two that had landed; no duplicates.
    expect(rows.size).toBe(5);
  });
});

describe("prefetchQuizBatch", () => {
  it("never rejects, because it runs inside after()", async () => {
    const { repo, calls } = fakeRepo([], "p-6");
    const exploding: GeneratedBlockRepository = {
      ...repo,
      async byBatch() {
        throw new Error("database unreachable");
      },
    };

    await expect(
      prefetchQuizBatch(
        { participantId: "p-6", batch: 2 },
        { llm: stubLlm(() => goodBatch("p-6", 2)), generatedBlocks: exploding }
      )
    ).resolves.toBeUndefined();

    expect(calls.saveBatch).toBe(0);
  });

  it("ignores a batch outside 1..3 without touching the model", async () => {
    const { repo, calls } = fakeRepo([], "p-7");
    await prefetchQuizBatch(
      { participantId: "p-7", batch: 4 },
      {
        llm: failingLlm(new Error("must not be called")),
        generatedBlocks: repo,
      }
    );
    expect(calls.byBatch).toBe(0);
  });
});
