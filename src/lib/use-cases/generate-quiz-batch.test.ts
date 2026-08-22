import { describe, expect, it } from "vitest";

import { failingLlm, stubLlm } from "../adapters/llm/fake";
import {
  type Assignment,
  assignmentsFor,
  assignmentsForBatch,
  DOMAINS,
} from "../domain/quiz/assignments.ts";
import {
  BLOCK_COUNT,
  INSTRUMENT,
  validateBlock,
} from "../domain/quiz/instrument.ts";
import { generateQuizBatch } from "./generate-quiz-batch.ts";

/**
 * `generateQuizBatch` (per-participant live authoring). The contract under test
 * is not "the model wrote something good" — it is that **every block handed back
 * satisfies `validateBlock`**, whatever the model does. Identical structure is
 * what makes two participants' different scenarios score on one metric
 * (AUDIT.md S8: authored item parameters, so the likelihood ignores the text).
 *
 * So the interesting cases are all failure cases: a malformed block, a block
 * that stays malformed after repair, a dead model, and a model that answers
 * about the wrong positions.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;
const KEYS = ["a", "b", "c", "d"] as const;

/** A structurally valid authored block for `plan`. */
function authoredFor(plan: Assignment) {
  // The focus pillar takes the reversed slot; the other three are positive.
  const others = PILLARS.filter((p) => p !== plan.focusPillar);
  const pillars = [plan.focusPillar, ...others];
  return {
    position: plan.position,
    scenario: `Un lío cotidiano sobre ${plan.domain}, en dos frases cortas.`,
    options: KEYS.map((key, i) => ({
      key,
      text: `opción ${key} sobre ${plan.domain}`,
      pillar: pillars[i],
      keyed: i === 0 ? ("reversed" as const) : ("positive" as const),
    })),
  };
}

function goodBatch(participantId: string, batch: number) {
  return {
    blocks: assignmentsForBatch(participantId, batch).map(authoredFor),
  };
}

describe("assignmentsFor", () => {
  it("fixes the structure and varies only the flavour", () => {
    const plan = assignmentsFor("p-1");
    expect(plan).toHaveLength(BLOCK_COUNT);
    expect(plan.map((a) => a.position)).toEqual(
      Array.from({ length: BLOCK_COUNT }, (_, i) => i + 1)
    );

    // The rotation is part of the metric: 4/4/4/3, identical for everyone.
    const rotation = PILLARS.map(
      (p) => plan.filter((a) => a.focusPillar === p).length
    );
    expect(rotation).toEqual([4, 4, 4, 3]);
    expect(assignmentsFor("p-2").map((a) => a.focusPillar)).toEqual(
      plan.map((a) => a.focusPillar)
    );

    // Deterministic, so a retried generation reproduces the same plan.
    expect(assignmentsFor("p-1")).toEqual(plan);

    // No participant sees the same setting twice ...
    expect(new Set(plan.map((a) => a.domain)).size).toBe(BLOCK_COUNT);
    for (const a of plan) expect(DOMAINS).toContain(a.domain);

    // ... and two participants get different settings.
    expect(assignmentsFor("p-2").map((a) => a.domain)).not.toEqual(
      plan.map((a) => a.domain)
    );

    // Batches partition the form.
    expect(assignmentsForBatch("p-1", 1).map((a) => a.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(assignmentsForBatch("p-1", 3).map((a) => a.position)).toEqual([
      11, 12, 13, 14, 15,
    ]);
  });
});

describe("generateQuizBatch", () => {
  it("returns five validated blocks on the happy path", async () => {
    const result = await generateQuizBatch(
      { participantId: "p-1", batch: 1 },
      { llm: stubLlm(() => goodBatch("p-1", 1)) }
    );

    expect(result.blocks).toHaveLength(5);
    expect(result.fellBackAt).toEqual([]);
    expect(result.repairedAt).toEqual([]);
    expect(result.blocks.map((b) => b.position)).toEqual([1, 2, 3, 4, 5]);

    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
      // focusPillar and batch come from our plan, never from the model.
      expect(block.batch).toBe(1);
    }
    // The scenarios are the generated ones, not the committed instrument's.
    expect(result.blocks[0].scenario).not.toBe(INSTRUMENT.blocks[0].scenario);
  });

  it("repairs a structurally invalid block instead of shipping it", async () => {
    let call = 0;
    const llm = stubLlm(() => {
      call++;
      const batch = goodBatch("p-7", 1);
      if (call === 1) {
        // Two reversed options — the failure that silently biases scoring.
        batch.blocks[2].options[1].keyed = "reversed";
      }
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-7", batch: 1 },
      { llm }
    );

    expect(call).toBe(2);
    expect(result.repairedAt).toEqual([3]);
    expect(result.fellBackAt).toEqual([]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("falls back to the committed instrument when repair does not fix it", async () => {
    const llm = stubLlm(() => {
      const batch = goodBatch("p-9", 2);
      // Position 8 loses a pillar every time, so it can never validate.
      batch.blocks[2].options[1].pillar = batch.blocks[2].options[0].pillar;
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-9", batch: 2 },
      { llm }
    );

    expect(result.fellBackAt).toEqual([8]);
    expect(result.blocks).toHaveLength(5);
    const eight = result.blocks.find((b) => b.position === 8);
    expect(eight?.scenario).toBe(INSTRUMENT.blocks[7].scenario);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("serves the committed instrument, without throwing, when the model is down", async () => {
    const result = await generateQuizBatch(
      { participantId: "p-3", batch: 3 },
      { llm: failingLlm(new Error("gateway 503")) }
    );

    expect(result.fellBackAt).toEqual([11, 12, 13, 14, 15]);
    expect(result.blocks.map((b) => b.scenario)).toEqual(
      INSTRUMENT.blocks.slice(10, 15).map((b) => b.scenario)
    );
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("ignores blocks the model returns for positions outside the batch", async () => {
    const llm = stubLlm(() => {
      const batch = goodBatch("p-4", 1);
      // The model loses the plan and answers about block 12.
      batch.blocks[1] = authoredFor({
        position: 12,
        batch: 3,
        focusPillar: "agency",
        domain: "rain",
      });
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-4", batch: 1 },
      { llm }
    );

    expect(result.blocks.map((b) => b.position)).toEqual([1, 2, 3, 4, 5]);
    expect(result.fellBackAt).toContain(2);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("rejects a batch number outside 1..3", async () => {
    await expect(
      generateQuizBatch(
        { participantId: "p-1", batch: 4 },
        { llm: stubLlm(() => goodBatch("p-1", 1)) }
      )
    ).rejects.toThrow(/batch must be 1, 2 or 3/);
  });
});
