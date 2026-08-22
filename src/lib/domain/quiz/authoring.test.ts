import { describe, expect, it } from "vitest";

import { type Assignment, assignmentsForBatch } from "./assignments.ts";
import { authoredBatchSchema, authorPrompt, judgePrompt } from "./authoring.ts";

/**
 * `authoring.ts` is the prompt, and the prompt is the product (`docs/domain.md`
 * D16). Nobody can unit-test whether a scenario is funny — but the instructions
 * that make it funny are a string, and a string can be pinned.
 *
 * These tests pin the *tone contract* added after the deployed blocks read as
 * dull: bizarre-but-everyday scenarios, the "wtf" bar, tuteo — alongside the
 * measurement rules that must survive it. The last test is the important one:
 * loosening the register must not loosen the structure, because structure is
 * what makes two participants' different scenarios score on one metric.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;
const KEYS = ["a", "b", "c", "d"] as const;

function authoredFor(plan: Assignment) {
  const others = PILLARS.filter((p) => p !== plan.focusPillar);
  const pillars = [plan.focusPillar, ...others];
  return {
    position: plan.position,
    scenario: `Llegas a ${plan.domain} y hay una llama con sombrero.`,
    options: KEYS.map((key, i) => ({
      key,
      text: `opción ${key} sobre ${plan.domain}`,
      pillar: pillars[i],
      keyed: i === 0 ? ("reversed" as const) : ("positive" as const),
    })),
  };
}

function goodBatch() {
  return { blocks: assignmentsForBatch("p-1", 1).map(authoredFor) };
}

describe("authorPrompt", () => {
  // AC-1
  it("states the tone contract and the measurement rules together", () => {
    const assignments = assignmentsForBatch("p-1", 1);
    const prompt = authorPrompt({ assignments, language: "es", avoid: [] });

    // The tone contract: bizarre, and bizarre in a specific way.
    expect(prompt).toMatch(/bizarro|absurdo/i);
    expect(prompt).toContain("wtf");
    expect(prompt).toMatch(/tuteo/i);
    // ... anchored in the everyday, which is what separates it from nonsense.
    expect(prompt).toMatch(/cotidiano|everyday/i);

    // The measurement rules the tone must not displace.
    expect(prompt).toContain("ALL FOUR pillars");
    for (const pillar of PILLARS) expect(prompt).toContain(pillar);
    expect(prompt).toContain("Exactly ONE option is reversed-keyed");
    expect(prompt).toContain("8 words");
    expect(prompt).toContain("NON-WORK");
    expect(prompt).toMatch(/deadlines/);
    for (const banned of [
      "substances",
      "politics",
      "religion",
      "sex",
      "mental health",
      "money",
    ]) {
      expect(prompt).toContain(banned);
    }

    // And the plan is echoed back, position by position: the model has to know
    // which pillar it is writing the reversed option for.
    for (const assignment of assignments) {
      expect(prompt).toContain(
        `position ${assignment.position}: focusPillar=${assignment.focusPillar}`
      );
      expect(prompt).toContain(`domain=${assignment.domain}`);
    }
  });

  // AC-2
  it("forbids reusing an earlier scenario's twist, not just its premise", () => {
    const avoid = [
      "Tu vecino te devuelve la licuadora llena de arena.",
      "Un perro entra a la boda y se lleva el ramo.",
      "El taxi que pediste llega manejado por tu ex profesor.",
    ];

    const prompt = authorPrompt({
      assignments: assignmentsForBatch("p-1", 2),
      language: "es",
      avoid,
    });

    for (const scenario of avoid) expect(prompt).toContain(scenario);
    expect(prompt).toMatch(/premises/);
    expect(prompt).toMatch(/punchlines/);
    expect(prompt).toMatch(/objects/);
    // The addition: a fresh object around the same joke is still a repeat.
    expect(prompt).toMatch(/twists/);
  });

  it("omits the avoid clause entirely for the first batch", () => {
    const prompt = authorPrompt({
      assignments: assignmentsForBatch("p-1", 1),
      language: "es",
      avoid: [],
    });
    expect(prompt).not.toContain("already been shown");
  });
});

describe("judgePrompt", () => {
  // AC-3
  it("fails dull scenarios and un-anchored twists, on top of the old criteria", () => {
    const prompt = judgePrompt(
      goodBatch().blocks.map((b) => ({
        position: b.position,
        scenario: b.scenario,
        options: b.options.map((o) => ({ text: o.text })),
      }))
    );

    // The two new failure criteria.
    expect(prompt).toContain("plain or predictable");
    expect(prompt).toMatch(/random rather than anchored/);

    // The criteria that were already there, none of them relaxed.
    expect(prompt).toMatch(/flattering/);
    expect(prompt).toMatch(/villainous/);
    expect(prompt).toMatch(/work, deadline or job/);
    expect(prompt).toMatch(/substances, politics, religion/);
    expect(prompt).toMatch(/flat or mean-spirited/);
    expect(prompt).toMatch(/8 words/);
    expect(prompt).toMatch(/repeats another block/);

    // The judge reads every block of the batch at once — repetition is the
    // failure only it can see.
    for (const block of goodBatch().blocks) {
      expect(prompt).toContain(`position ${block.position}:`);
    }
  });
});

describe("authoredBatchSchema", () => {
  it("accepts a well-formed batch", () => {
    expect(authoredBatchSchema.safeParse(goodBatch()).success).toBe(true);
  });

  // AC-4
  it("still rejects a three-sentence scenario, naming the position and limit", () => {
    const batch = goodBatch();
    batch.blocks[1].scenario =
      "Llegas al parque. Hay una llama con sombrero. Te está esperando.";

    const parsed = authoredBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(false);
    const message = parsed.error?.issues.map((i) => i.message).join("\n") ?? "";
    expect(message).toContain(`position ${batch.blocks[1].position}`);
    expect(message).toContain("3 sentences");
    expect(message).toContain("2 short sentences");
  });

  // AC-4
  it("still rejects an eleven-word option, naming the position and limit", () => {
    const batch = goodBatch();
    batch.blocks[3].options[2].text =
      "uno dos tres cuatro cinco seis siete ocho nueve diez once";

    const parsed = authoredBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(false);
    const message = parsed.error?.issues.map((i) => i.message).join("\n") ?? "";
    expect(message).toContain(`position ${batch.blocks[3].position}`);
    expect(message).toContain('option "c"');
    expect(message).toContain("11 words");
    expect(message).toContain("8 words");
  });

  it("still rejects a batch that is not five blocks", () => {
    const batch = goodBatch();
    batch.blocks.pop();
    expect(authoredBatchSchema.safeParse(batch).success).toBe(false);
  });
});
