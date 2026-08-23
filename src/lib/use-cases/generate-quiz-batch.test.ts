import { describe, expect, it } from "vitest";

import { failingLlm, stubLlm } from "../adapters/llm/fake";
import {
  type Assignment,
  assignmentsForBatch,
  groupOf,
} from "../domain/quiz/assignments.ts";
import { INSTRUMENT, validateBlock } from "../domain/quiz/instrument.ts";
import type { LlmPort, LlmRequest } from "../ports/llm";
import {
  generateQuizBatch,
  QuizAuthoringError,
} from "./generate-quiz-batch.ts";

/**
 * `generateQuizBatch` (per-participant live authoring). The contract under test
 * is not "the model wrote something good" — it is that **every block handed back
 * satisfies `validateBlock`**, whatever the model does, and that when it cannot
 * honour that it throws rather than serving a block written for someone else.
 * Identical structure is what makes two participants' different scenarios
 * score on one metric (AUDIT.md S8: authored item parameters, so the
 * likelihood ignores the text).
 *
 * So the interesting cases are all failure cases: a malformed block, a block
 * that stays malformed after repair, a dead model, a model that answers about
 * the wrong positions, and a model that retells a scenario already shown.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;
const KEYS = ["a", "b", "c", "d"] as const;

/** Fifteen unrelated scenarios, one per position, so no two read as a repeat. */
const SCENARIOS = [
  "Tu abuela publica un meme sobre ti en el grupo familiar.",
  "La cajera del supermercado canta cada precio en ópera.",
  "Un gato desconocido duerme en tu maleta recién hecha.",
  "El taxi que pediste llega manejado por tu ex profesor.",
  "La lluvia solo cae sobre tu cuadra y sobre nadie más.",
  "Tu planta favorita amaneció con una nota pidiendo vacaciones.",
  "El ascensor del edificio anuncia los pisos con chistes malos.",
  "En la boda, la torta tiene tu cara dibujada con crema.",
  "Tu celular corrige cada mensaje agregando un poema corto.",
  "El parlante del parque repite tu nombre entre canciones.",
  "Un pelícano se instala en la piscina como si fuera socio.",
  "La fila del cine avanza solo cuando alguien aplaude.",
  "Tu cargador aparece enrollado en la bicicleta de un vecino.",
  "El partido de fútbol se detiene porque el balón pide disculpas.",
  "Las maletas del aeropuerto salen con sombreros de cumpleaños.",
];

/** A structurally valid authored block for `plan`. */
function authoredFor(
  plan: Assignment,
  scenario = SCENARIOS[plan.position - 1]
) {
  // The focus pillar takes the reversed slot; the other three are positive.
  const others = PILLARS.filter((p) => p !== plan.focusPillar);
  const pillars = [plan.focusPillar, ...others];
  return {
    position: plan.position,
    scenario,
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
    blocks: assignmentsForBatch(participantId, batch).map((plan) =>
      authoredFor(plan)
    ),
  };
}

/** The tone judge with nothing to say. Every block stands on its structure. */
const NO_OBJECTIONS = { verdicts: [] };

/**
 * A stub that answers the author and the judge separately, records every
 * request, and counts only the author calls — the number of *authoring*
 * attempts is what these tests assert about, and the judge sits between the
 * first attempt and the repair.
 */
function authorStub(
  respond: (call: number, request: LlmRequest<unknown>) => unknown,
  judge: () => unknown = () => NO_OBJECTIONS
) {
  const state = { authorCalls: 0 };
  const sent: { id: string; prompt: string }[] = [];
  const llm: LlmPort = {
    generate<T>(request: LlmRequest<T>): Promise<T> {
      sent.push({ id: request.id, prompt: request.prompt });
      const value =
        request.id === "quiz.judge"
          ? judge()
          : respond(++state.authorCalls, request as LlmRequest<unknown>);
      return stubLlm(() => value).generate(request);
    },
  };
  return { llm, state, sent };
}

describe("generateQuizBatch", () => {
  it("returns five validated blocks on the happy path, after one author call and one judge call", async () => {
    const { llm, sent } = authorStub(() => goodBatch("p-1", 1));
    const result = await generateQuizBatch(
      { participantId: "p-1", batch: 1 },
      { llm }
    );

    expect(result.blocks).toHaveLength(5);
    expect(result.repairedAt).toEqual([]);
    expect(result.blocks.map((b) => b.position)).toEqual([1, 2, 3, 4, 5]);
    expect(sent.map((s) => s.id)).toEqual([
      "quiz.author.batch-1",
      "quiz.judge",
    ]);

    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
      // focusPillar and batch come from our plan, never from the model.
      expect(block.batch).toBe(1);
    }
    // The scenarios are the generated ones, not the committed instrument's.
    expect(result.blocks[0].scenario).not.toBe(INSTRUMENT.blocks[0].scenario);
    expect(result.blocks[0].scenario).toBe(SCENARIOS[0]);
  });

  it("repairs a structurally invalid block by asking for that position alone", async () => {
    const { llm, state, sent } = authorStub((call) => {
      const batch = goodBatch("p-7", 1);
      if (call === 1) {
        // Two reversed options — the failure that silently biases scoring.
        batch.blocks[2].options[1].keyed = "reversed";
        return batch;
      }
      return { blocks: [batch.blocks[2]] };
    });

    const result = await generateQuizBatch(
      { participantId: "p-7", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([3]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }

    const repair = sent.find((s) => s.id === "quiz.author.batch-1.repair");
    expect(repair?.prompt).toContain("Write the 1 block below");
    expect(repair?.prompt).toContain("position 3 was rejected");
    // The accepted neighbours travel under their own heading, so the repaired
    // block cannot retell one of them.
    expect(repair?.prompt).toContain("SAME batch");
    expect(repair?.prompt).toContain(SCENARIOS[0]);
  });

  it("retries the author call when the model itself fails, up to three times", async () => {
    const { llm, state } = authorStub((call) => {
      if (call < 3) throw new Error("gateway 503");
      return goodBatch("p-retry", 2);
    });

    const result = await generateQuizBatch(
      { participantId: "p-retry", batch: 2 },
      { llm }
    );

    expect(state.authorCalls).toBe(3);
    expect(result.blocks.map((b) => b.position)).toEqual([6, 7, 8, 9, 10]);
    expect(result.repairedAt).toEqual([]);
  });

  it("throws QuizAuthoringError naming every position when the model is down — never a fallback", async () => {
    const error = await generateQuizBatch(
      { participantId: "p-3", batch: 3 },
      { llm: failingLlm(new Error("gateway 503")) }
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(QuizAuthoringError);
    expect((error as QuizAuthoringError).positions).toEqual([
      11, 12, 13, 14, 15,
    ]);
    expect((error as Error).message).toContain("batch 3");
  });

  it("throws QuizAuthoringError naming the position that never validates, after repair and one final call", async () => {
    const { llm, state, sent } = authorStub(() => {
      const batch = goodBatch("p-9", 2);
      // Position 8 loses a pillar every time, so it can never validate.
      batch.blocks[2].options[1].pillar = batch.blocks[2].options[0].pillar;
      return batch;
    });

    const error = await generateQuizBatch(
      { participantId: "p-9", batch: 2 },
      { llm }
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(QuizAuthoringError);
    expect((error as QuizAuthoringError).positions).toEqual([8]);
    expect((error as Error).message).toContain("position 8");
    expect(state.authorCalls).toBe(3);
    expect(sent.map((s) => s.id)).toEqual([
      "quiz.author.batch-2",
      "quiz.judge",
      "quiz.author.batch-2.repair",
      "quiz.author.batch-2.final",
    ]);
  });

  it("repairs one over-long option instead of failing the whole batch", async () => {
    const { llm, state } = authorStub((call) => {
      const batch = goodBatch("p-long", 1);
      if (call === 1) {
        // Fourteen words: breaks a length rule, not the structure.
        batch.blocks[1].options[2].text =
          "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce";
      }
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-long", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([2]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("repairs one over-long scenario instead of failing the whole call", async () => {
    const { llm, state } = authorStub((call) => {
      const batch = goodBatch("p-long-scene", 1);
      if (call === 1) {
        // 260 characters, two sentences: past the bubble's 220 but well
        // inside the shape schema, so the call lands and only this position
        // goes to repair. In production the old 220 cap in the schema made
        // this fail the call outright, three times, and lost the batch.
        batch.blocks[2].scenario = `Llegas a la cena y ${"tu tía cuenta la misma anécdota del viaje a Cartagena mientras el perro del vecino se come el postre ".repeat(2)}y nadie dice nada.`;
      }
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-long-scene", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([3]);
    for (const block of result.blocks) {
      expect(block.scenario.length).toBeLessThanOrEqual(220);
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("ignores blocks the model returns for positions outside the batch and repairs the gap", async () => {
    const { llm, state } = authorStub((call) => {
      const batch = goodBatch("p-4", 1);
      if (call === 1) {
        // The model loses the plan and answers about block 12.
        batch.blocks[1] = authoredFor({
          position: 12,
          batch: 3,
          focusPillar: "agency",
          domain: "rain",
          twistKind: "a coincidence nobody could have planned",
        });
      }
      return batch;
    });

    const result = await generateQuizBatch(
      { participantId: "p-4", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.blocks.map((b) => b.position)).toEqual([1, 2, 3, 4, 5]);
    expect(result.repairedAt).toEqual([2]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  // AC-5. The tone judge is a second gate in front of the same repair pass the
  // structural validator uses, and its objections are the only concrete thing
  // the second attempt is told. Paraphrasing them — or summarising five of them
  // into one line — is the failure this test exists to catch.
  it("hands the judge's objections to the repair call, verbatim, under the notes heading", async () => {
    const VERDICT = "plain or predictable — no twist";
    const { llm, state, sent } = authorStub(
      (call) => {
        const batch = goodBatch("p-tone", 1);
        if (call === 2) {
          // The repair lands for everything except position 3, which comes
          // back with a missing pillar; the final call fixes it.
          batch.blocks[2].options[1].pillar = batch.blocks[2].options[0].pillar;
          return batch;
        }
        if (call === 3) return { blocks: [batch.blocks[2]] };
        return batch;
      },
      () => ({
        verdicts: [1, 2, 3, 4, 5].map((position) => ({
          position,
          pass: false,
          problems: [VERDICT],
        })),
      })
    );

    const result = await generateQuizBatch(
      { participantId: "p-tone", batch: 1 },
      { llm }
    );

    expect(sent.map((s) => s.id)).toEqual([
      "quiz.author.batch-1",
      "quiz.judge",
      "quiz.author.batch-1.repair",
      "quiz.author.batch-1.final",
    ]);
    expect(state.authorCalls).toBe(3);

    const repair = sent[2].prompt;
    const notesAt = repair.indexOf("NOTES on the previous attempt");
    expect(notesAt).toBeGreaterThan(0);
    for (const position of [1, 2, 3, 4, 5]) {
      const line = `position ${position} was rejected: ${VERDICT}`;
      expect(repair.indexOf(line)).toBeGreaterThan(notesAt);
    }

    expect(result.blocks).toHaveLength(5);
    expect(result.repairedAt).toEqual([1, 2, 3, 4, 5]);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
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
    expect(result.repairedAt).toEqual([]);
  });

  it("rejects a block that retells a scenario already shown, and tells the judge and the repair what was shown", async () => {
    const shown = "Un gato desconocido se queda dormido en tu maleta hecha.";
    const fresh = "El portero del edificio colecciona tus paraguas perdidos.";
    const { llm, state, sent } = authorStub((call) => {
      const batch = goodBatch("p-seen", 1);
      if (call === 1) return batch;
      // The repair invents something new for position 3.
      return {
        blocks: [authoredFor(assignmentsForBatch("p-seen", 1)[2], fresh)],
      };
    });

    const result = await generateQuizBatch(
      { participantId: "p-seen", batch: 1, previousScenarios: [shown] },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([3]);
    expect(result.blocks[2].scenario).toBe(fresh);

    const judge = sent.find((s) => s.id === "quiz.judge");
    expect(judge?.prompt).toContain("ALREADY SHOWN");
    expect(judge?.prompt).toContain(shown);

    const repair = sent.find((s) => s.id === "quiz.author.batch-1.repair");
    expect(repair?.prompt).toContain(`repeats the premise of: "${shown}"`);
    expect(repair?.prompt).toContain("already been shown");
    expect(repair?.prompt).toContain(shown);
  });

  it("re-plans a retold position into a fresh domain and twist before asking again", async () => {
    // The production failure of 2026-08-23: two pool forms drew the same
    // setting, the second could only find the first's premise, and repair
    // and final asked for the same setting again. Now the row changes.
    const shown = "Un gato desconocido se queda dormido en tu maleta hecha.";
    const fresh = "El portero del edificio colecciona tus paraguas perdidos.";
    const plan = assignmentsForBatch("p-replan", 1);
    const { llm, state, sent } = authorStub((call) => {
      const batch = goodBatch("p-replan", 1);
      if (call === 1) {
        batch.blocks[2].scenario = shown;
        return batch;
      }
      return { blocks: [authoredFor(plan[2], fresh)] };
    });

    const result = await generateQuizBatch(
      { participantId: "p-replan", batch: 1, previousScenarios: [shown] },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([3]);

    const repair = sent.find((s) => s.id === "quiz.author.batch-1.repair");
    const row = /- position 3:[^\n]*domain=([^,\n]+), twist=([^\n]+)/.exec(
      repair?.prompt ?? ""
    );
    expect(row).not.toBeNull();
    expect(row?.[1]).not.toBe(plan[2].domain);
    expect(row?.[2]).not.toBe(plan[2].twistKind);
    expect(repair?.prompt).toContain("write it in a new setting");
    // The fresh setting must not collide with a sibling's.
    const siblings = plan.filter((a) => a.position !== 3).map((a) => a.domain);
    expect(siblings).not.toContain(row?.[1]);

    // The block carries the setting it was written in, and still validates.
    expect(result.blocks[2].domain).toBe(row?.[1]);
    expect(result.blocks[2].scenario).toBe(fresh);
    for (const block of result.blocks) {
      expect(() => validateBlock(block)).not.toThrow();
    }
  });

  it("rejects a block that retells an accepted sibling of the same batch", async () => {
    const { llm, state, sent } = authorStub((call) => {
      const batch = goodBatch("p-twin", 1);
      if (call === 1) {
        // Position 4 is position 2's joke with one word changed.
        batch.blocks[3].scenario = SCENARIOS[1].replace("ópera", "rap");
        return batch;
      }
      return { blocks: [batch.blocks[3]] };
    });

    const result = await generateQuizBatch(
      { participantId: "p-twin", batch: 1 },
      { llm }
    );

    expect(state.authorCalls).toBe(2);
    expect(result.repairedAt).toEqual([4]);
    const repair = sent.find((s) => s.id === "quiz.author.batch-1.repair");
    expect(repair?.prompt).toContain("position 4 was rejected");
    expect(repair?.prompt).toContain("repeats the premise of");
    expect(repair?.prompt).toContain(SCENARIOS[1]);
  });

  it("plans batch 2 around the domains an adopted batch 1 already used", async () => {
    const own = assignmentsForBatch("p-adopted", 2);
    const stored = [own[0].domain, own[3].domain];
    const { llm, sent } = authorStub(() => ({
      blocks: assignmentsForBatch("p-adopted", 2, stored).map((plan) =>
        authoredFor(plan)
      ),
    }));

    const result = await generateQuizBatch(
      { participantId: "p-adopted", batch: 2, storedDomains: stored },
      { llm }
    );

    const domains = result.blocks.map((b) => b.domain);
    for (const domain of stored) expect(domains).not.toContain(domain);
    expect(new Set(domains.map(groupOf)).size).toBe(5);
    expect(domains).toEqual(
      assignmentsForBatch("p-adopted", 2, stored).map((a) => a.domain)
    );
    // The plan the model was handed is the adjusted one.
    for (const domain of stored) {
      expect(sent[0].prompt).not.toContain(`domain=${domain},`);
    }
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
