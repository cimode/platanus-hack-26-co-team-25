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
import type { LlmPort, LlmRequest } from "../ports/llm";
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

/** The tone judge with nothing to say. Every block stands on its structure. */
const NO_OBJECTIONS = { verdicts: [] };

/**
 * A stub that answers the author and the judge separately, and counts only the
 * author calls — the number of *authoring* attempts is what these tests assert
 * about, and the judge sits between attempt 1 and attempt 2.
 */
function authorStub(
  respond: (call: number) => unknown,
  judge: () => unknown = () => NO_OBJECTIONS
) {
  const state = { authorCalls: 0 };
  const llm = stubLlm((id) => {
    if (id === "quiz.judge") return judge();
    state.authorCalls++;
    return respond(state.authorCalls);
  });
  return { llm, state };
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
      { llm: authorStub(() => goodBatch("p-1", 1)).llm }
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
    const { llm, state } = authorStub((call) => {
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

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([3]);
    expect(result.fellBackAt).toEqual([]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("falls back to the committed instrument when repair does not fix it", async () => {
    const { llm } = authorStub(() => {
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

  it("repairs one over-long option instead of failing the whole batch", async () => {
    const { llm, state } = authorStub((call) => {
      const batch = goodBatch("p-long", 1);
      if (call === 1) {
        // Eleven words: breaks a length rule, not the structure. Enforced at
        // the batch boundary this used to reject the call and fall back on
        // all five positions.
        batch.blocks[1].options[2].text =
          "uno dos tres cuatro cinco seis siete ocho nueve diez once";
      }
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-long", batch: 1 },
      { llm }
    );

    // Author, then one repair for position 2 alone; nothing fell back.
    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([2]);
    expect(result.fellBackAt).toEqual([]);
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
    const { llm } = authorStub(() => {
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

  // AC-5. The tone judge is a second gate in front of the same repair pass the
  // structural validator uses, and its objections are the only concrete thing
  // the second attempt is told. Paraphrasing them — or summarising five of them
  // into one line — is the failure this test exists to catch.
  it("hands the judge's objections to the repair call, verbatim", async () => {
    const VERDICT = "plain or predictable — no twist";
    const sent: { id: string; prompt: string }[] = [];
    let authorCalls = 0;

    const llm: LlmPort = {
      generate<T>(request: LlmRequest<T>): Promise<T> {
        sent.push({ id: request.id, prompt: request.prompt });

        let response: unknown;
        if (request.id === "quiz.judge") {
          // Every block in the batch is dull, and the judge says why.
          response = {
            verdicts: [1, 2, 3, 4, 5].map((position) => ({
              position,
              pass: false,
              problems: [VERDICT],
            })),
          };
        } else {
          authorCalls++;
          const batch = goodBatch("p-tone", 1);
          if (authorCalls > 1) {
            // The repair lands for everything except position 3, which comes
            // back with a missing pillar and so can never validate.
            batch.blocks[2].options[1].pillar =
              batch.blocks[2].options[0].pillar;
          }
          response = batch;
        }

        const parsed = request.schema.safeParse(response);
        if (!parsed.success) {
          return Promise.reject(new Error(JSON.stringify(parsed.error.issues)));
        }
        return Promise.resolve(parsed.data);
      },
    };

    const result = await generateQuizBatch(
      { participantId: "p-tone", batch: 1 },
      { llm }
    );

    // author → judge → repair, and the judge saw the authored batch.
    expect(sent.map((s) => s.id)).toEqual([
      "quiz.author.batch-1",
      "quiz.judge",
      "quiz.author.batch-1.repair",
    ]);
    expect(authorCalls).toBe(2);

    const repair = sent[2].prompt;
    for (const position of [1, 2, 3, 4, 5]) {
      expect(repair).toContain(`position ${position} was rejected: ${VERDICT}`);
    }

    // The participant still gets five scoreable blocks; only the position that
    // stayed invalid after repair falls back.
    expect(result.blocks).toHaveLength(5);
    expect(result.fellBackAt).toEqual([3]);
    expect(result.repairedAt).toEqual([1, 2, 4, 5]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
    expect(result.blocks[2].scenario).toBe(INSTRUMENT.blocks[2].scenario);
  });

  // A judge that is down, or that answers with something that is not a verdict
  // list, must cost the participant nothing: the block stands on its structure.
  it("keeps authored blocks when the judge itself fails", async () => {
    const { llm, state } = authorStub(
      () => goodBatch("p-nojudge", 1),
      () => ({ nonsense: true })
    );

    const result = await generateQuizBatch(
      { participantId: "p-nojudge", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(1);
    expect(result.fellBackAt).toEqual([]);
    expect(result.repairedAt).toEqual([]);
  });

  it("rejects a batch number outside 1..3", async () => {
    await expect(
      generateQuizBatch(
        { participantId: "p-1", batch: 4 },
        { llm: authorStub(() => goodBatch("p-1", 1)).llm }
      )
    ).rejects.toThrow(/batch must be 1, 2 or 3/);
  });
});
