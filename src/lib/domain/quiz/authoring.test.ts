import { describe, expect, it } from "vitest";

import { type Assignment, assignmentsForBatch } from "./assignments.ts";
import {
  authoredBatchSchema,
  authoredBatchShapeSchema,
  authoredBlockProblem,
  authoredBlocksSchema,
  authorPrompt,
  judgePrompt,
} from "./authoring.ts";

/**
 * `authoring.ts` is the prompt, and the prompt is the product (`docs/domain.md`
 * D16). Nobody can unit-test whether a scenario is funny — but the instructions
 * that make it funny are a string, and a string can be pinned.
 *
 * These tests pin the *tone contract* added after the deployed blocks read as
 * dull: bizarre-but-everyday scenarios, the "wtf" bar, tuteo — alongside the
 * measurement rules that must survive it, and the later finding that every
 * concrete example in the prompt became everyone's scenario, so there are
 * none. The last test is the important one: loosening the register must not
 * loosen the structure, because structure is what makes two participants'
 * different scenarios score on one metric.
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

/**
 * Every example that was ever found verbatim in a participant's block. None
 * may appear in the live prompt again.
 */
const LEAKED_EXAMPLES = [
  "loro",
  "tono de alarma",
  "Entro en pánico",
  "Me río y sigo",
  "Prometo llegar",
  "Llegas a la fiesta",
  "tu vecino",
  "late bus",
  "Entras en pánico",
];

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
    // which pillar it is writing the reversed option for, and which twist.
    for (const assignment of assignments) {
      expect(prompt).toContain(
        `position ${assignment.position}: focusPillar=${assignment.focusPillar}`
      );
      expect(prompt).toContain(`domain=${assignment.domain}`);
      expect(prompt).toContain(`twist=${assignment.twistKind}`);
    }
  });

  it("carries no concrete example a model could copy into everyone's form", () => {
    const prompt = authorPrompt({
      assignments: assignmentsForBatch("p-1", 1),
      language: "es",
      avoid: [],
    });
    for (const leaked of LEAKED_EXAMPLES) {
      expect(prompt, leaked).not.toContain(leaked);
    }
    // The twist taxonomy is per position now, not a list to pick from.
    expect(prompt).not.toMatch(/object \/ creature \/ coincidence/);
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

  it("omits the avoid, siblings and notes clauses when there is nothing to say", () => {
    const prompt = authorPrompt({
      assignments: assignmentsForBatch("p-1", 1),
      language: "es",
      avoid: [],
    });
    expect(prompt).not.toContain("already been shown");
    expect(prompt).not.toContain("SAME batch");
    expect(prompt).not.toContain("NOTES on the previous attempt");
  });

  it("lists accepted siblings and repair notes under their own headings, apart from the avoid list", () => {
    const avoid = ["Un perro entra a la boda y se lleva el ramo."];
    const siblings = ["La cajera canta cada precio en ópera."];
    const notes = ["position 3 was rejected: plain or predictable"];
    const missing = assignmentsForBatch("p-1", 1).slice(2, 3);

    const prompt = authorPrompt({
      assignments: missing,
      language: "es",
      avoid,
      siblings,
      notes,
    });

    const avoidAt = prompt.indexOf("already been shown");
    const siblingsAt = prompt.indexOf("SAME batch");
    const notesAt = prompt.indexOf("NOTES on the previous attempt");
    expect(avoidAt).toBeGreaterThan(0);
    expect(siblingsAt).toBeGreaterThan(avoidAt);
    expect(notesAt).toBeGreaterThan(siblingsAt);

    // Each item sits under its own heading, not inside the avoid list.
    expect(prompt.indexOf(siblings[0])).toBeGreaterThan(siblingsAt);
    expect(prompt.indexOf(notes[0])).toBeGreaterThan(notesAt);
    expect(prompt.slice(avoidAt, siblingsAt)).toContain(avoid[0]);
    expect(prompt.slice(avoidAt, siblingsAt)).not.toContain(notes[0]);

    // Only the missing position is asked for.
    expect(prompt).toContain("Write the 1 block below");
    expect(prompt).toContain(`position ${missing[0].position}:`);
    expect(prompt).not.toContain("position 1:");
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

    // No example objection for the model to parrot back.
    for (const leaked of LEAKED_EXAMPLES) expect(prompt).not.toContain(leaked);
    expect(prompt).not.toContain("ALREADY SHOWN —");
  });

  it("hands the judge what the participant has already read, as a failure criterion", () => {
    const shown = [
      "Un perro entra a la boda y se lleva el ramo.",
      "La cajera canta cada precio en ópera.",
    ];
    const prompt = judgePrompt(
      goodBatch().blocks.map((b) => ({
        position: b.position,
        scenario: b.scenario,
        options: b.options.map((o) => ({ text: o.text })),
      })),
      shown
    );
    expect(prompt).toContain("ALREADY SHOWN");
    expect(prompt).toMatch(/fail any block that repeats these/);
    for (const scenario of shown) expect(prompt).toContain(scenario);
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
  it("still rejects a fourteen-word option, naming the position and limit", () => {
    const batch = goodBatch();
    batch.blocks[3].options[2].text =
      "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce";

    const parsed = authoredBatchSchema.safeParse(batch);
    expect(parsed.success).toBe(false);
    const message = parsed.error?.issues.map((i) => i.message).join("\n") ?? "";
    expect(message).toContain(`position ${batch.blocks[3].position}`);
    expect(message).toContain('option "c"');
    expect(message).toContain("14 words");
    expect(message).toContain("12 words");
  });

  it("lets a ten-word option through: full-width rows wrap, and the prompt already asks for fewer", () => {
    const batch = goodBatch();
    batch.blocks[3].options[2].text =
      "uno dos tres cuatro cinco seis siete ocho nueve diez";
    expect(authoredBatchSchema.safeParse(batch).success).toBe(true);
  });

  it("still rejects a batch that is not five blocks", () => {
    const batch = goodBatch();
    batch.blocks.pop();
    expect(authoredBatchSchema.safeParse(batch).success).toBe(false);
  });
});

describe("authoredBlocksSchema", () => {
  it("accepts one to five blocks — a repair call asks only for what is missing", () => {
    const batch = goodBatch();
    expect(authoredBlocksSchema.safeParse(batch).success).toBe(true);
    expect(
      authoredBlocksSchema.safeParse({ blocks: batch.blocks.slice(0, 2) })
        .success
    ).toBe(true);
    expect(authoredBlocksSchema.safeParse({ blocks: [] }).success).toBe(false);
    expect(
      authoredBlocksSchema.safeParse({
        blocks: [...batch.blocks, batch.blocks[0]],
      }).success
    ).toBe(false);
  });
});

describe("authoredBlockProblem", () => {
  it("names the position and limit per block, while the shape schema lets the block through", () => {
    const batch = goodBatch();
    const block = batch.blocks[3];
    block.options[2].text =
      "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece";

    const problem = authoredBlockProblem(block);
    expect(problem).toContain(`position ${block.position}`);
    expect(problem).toContain('option "c"');
    expect(problem).toContain("13 words");
    expect(authoredBlockProblem(batch.blocks[0])).toBeNull();

    // The model-facing schema carries the shape only; the length rules are
    // the author loop's to apply one block at a time.
    expect(authoredBatchShapeSchema.safeParse(batch).success).toBe(true);
    expect(authoredBatchSchema.safeParse(batch).success).toBe(false);
  });
});
