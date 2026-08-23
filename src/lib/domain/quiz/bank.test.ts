import { describe, expect, it } from "vitest";
import { BANK, BANK_BY_PILLAR, BLOCKS_PER_PILLAR, formFor } from "./bank.ts";
import {
  BLOCK_COUNT,
  batchOf,
  PILLARS,
  type Pillar,
  validateBlock,
} from "./instrument.ts";

/**
 * The question bank and the form it deals (bank.ts).
 *
 * Two things have to be true or the quiz is broken in a way nobody would notice
 * until the ranking came out wrong:
 *
 *   1. Every block that ships is structurally sound — four options, one per
 *      pillar, exactly one reversed and on the focus pillar. `validateBlock`
 *      already runs over the whole bank at import, so a bad block is a boot
 *      failure; this suite re-states it as an assertion so the failure names the
 *      rule rather than arriving as "cannot import module".
 *   2. `formFor` is a function of the participant id and nothing else, deals a
 *      balanced twelve, and deals a DIFFERENT twelve to different people. The
 *      last one is what stops four hundred authored blocks from behaving like
 *      twelve: if the deal were nearly constant, the bank would be decoration.
 *
 * Nothing here pins a bank size. The bank grows as questions are authored, and a
 * test that counted them would fail on the next twenty good ones.
 */

/** Enough ids to see the distribution, cheap enough to run every commit. */
const SAMPLE_IDS = Array.from(
  { length: 200 },
  (_, i) => `11111111-1111-7111-8111-${String(i).padStart(12, "0")}`
);

function focusCounts(
  blocks: { focusPillar: Pillar }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.focusPillar] = (counts[block.focusPillar] ?? 0) + 1;
  }
  return counts;
}

/** How many blocks two forms have in common, by scenario. */
function overlap(left: string[], right: string[]): number {
  const seen = new Set(left);
  return right.filter((scenario) => seen.has(scenario)).length;
}

describe("the shipped bank", () => {
  it("is a set of structurally valid blocks with unique ids, filed under their focus pillar", () => {
    expect(BANK.length).toBeGreaterThan(0);

    const ids = new Set<string>();
    for (const block of BANK) {
      expect(ids.has(block.id), `duplicate id ${block.id}`).toBe(false);
      ids.add(block.id);

      expect(PILLARS, block.id).toContain(block.focusPillar);
      expect(block.scenario.trim().length, block.id).toBeGreaterThan(0);
      expect(block.domain.trim().length, block.id).toBeGreaterThan(0);

      // The same rule that guards anything on its way into storage.
      expect(
        () => validateBlock({ ...block, position: 1, batch: 1 }),
        block.id
      ).not.toThrow();
    }
  });

  it("has enough blocks on every pillar for a form to be dealt", () => {
    for (const pillar of PILLARS) {
      const pool = BANK_BY_PILLAR[pillar];
      expect(pool.length, pillar).toBeGreaterThanOrEqual(BLOCKS_PER_PILLAR);
      expect(
        pool.every((block) => block.focusPillar === pillar),
        pillar
      ).toBe(true);
    }
    // Every block is in exactly one pool.
    const pooled = PILLARS.reduce(
      (total, pillar) => total + BANK_BY_PILLAR[pillar].length,
      0
    );
    expect(pooled).toBe(BANK.length);
  });
});

describe("formFor", () => {
  it("deals twelve blocks at positions 1..12, three per pillar, all valid", () => {
    const form = formFor(SAMPLE_IDS[0]);

    expect(form).toHaveLength(BLOCK_COUNT);
    expect(form.map((block) => block.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(form.map((block) => block.batch)).toEqual(
      form.map((block) => batchOf(block.position))
    );
    expect(focusCounts(form)).toEqual({
      regulation: BLOCKS_PER_PILLAR,
      politeness: BLOCKS_PER_PILLAR,
      reliability: BLOCKS_PER_PILLAR,
      agency: BLOCKS_PER_PILLAR,
    });

    for (const block of form) {
      expect(
        () => validateBlock(block),
        `position ${block.position}`
      ).not.toThrow();
    }

    // No participant reads the same scenario twice.
    expect(new Set(form.map((block) => block.scenario)).size).toBe(BLOCK_COUNT);
  });

  it("is balanced for every participant in the sample, not just a lucky one", () => {
    for (const id of SAMPLE_IDS) {
      const form = formFor(id);
      expect(form, id).toHaveLength(BLOCK_COUNT);
      expect(focusCounts(form), id).toEqual({
        regulation: BLOCKS_PER_PILLAR,
        politeness: BLOCKS_PER_PILLAR,
        reliability: BLOCKS_PER_PILLAR,
        agency: BLOCKS_PER_PILLAR,
      });
    }
  });

  it("gives the same participant the same twelve blocks, in the same order, every time", () => {
    // A reload, a re-render and a re-assignment all recompute the form; if any
    // of them disagreed, position 7 would change under the person answering it.
    for (const id of SAMPLE_IDS.slice(0, 25)) {
      expect(formFor(id), id).toEqual(formFor(id));
    }
  });

  it("gives different participants different forms", () => {
    const forms = SAMPLE_IDS.map((id) => formFor(id).map((b) => b.scenario));

    // No two people get the same twelve questions.
    const fingerprints = new Set(forms.map((form) => form.join("|")));
    expect(fingerprints.size).toBe(forms.length);

    // And they are not near-copies either: over every pair in the sample, the
    // average number of shared scenarios stays small. With twelve blocks drawn
    // from four pools of a hundred, sharing more than a block or two on average
    // would mean the deal is barely moving.
    let pairs = 0;
    let shared = 0;
    for (let i = 0; i < forms.length; i++) {
      for (let j = i + 1; j < forms.length; j++) {
        shared += overlap(forms[i], forms[j]);
        pairs++;
      }
    }
    expect(shared / pairs).toBeLessThan(1);
  });

  it("does not put the same pillar first for everyone", () => {
    // A fixed rotation would make question 1 the same pillar for the whole
    // room; the per-participant shuffle is what prevents it.
    const firstPillars = new Set(
      SAMPLE_IDS.map((id) => formFor(id)[0].focusPillar)
    );
    expect(firstPillars.size).toBe(PILLARS.length);

    // The same holds further in: no position is a single pillar room-wide.
    for (let position = 1; position <= BLOCK_COUNT; position++) {
      const pillarsHere = new Set(
        SAMPLE_IDS.map((id) => formFor(id)[position - 1].focusPillar)
      );
      expect(pillarsHere.size, `position ${position}`).toBeGreaterThan(1);
    }
  });
});
