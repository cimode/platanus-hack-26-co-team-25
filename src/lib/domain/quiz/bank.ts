/**
 * bank.ts — the committed question bank, and the form it deals to a participant.
 *
 * WHY THIS EXISTS AT ALL. Until this change the twelve blocks a person answered
 * were written live, by a model, while they waited: a serverless function ran,
 * the screen said "writing your questions", and people read that as broken and
 * closed the tab. Completion rate IS the demo (CONTEXT.md §4), so live authoring
 * is gone. Four hundred blocks — one hundred per pillar — were authored offline,
 * judged, validated and committed under `quiz/bank/`; every participant is dealt
 * twelve of them. Rendering a question now costs ZERO model calls and ZERO
 * database round trips: the bank is a constant, resident in the bundle, and
 * `formFor()` is arithmetic.
 *
 * WHY IT IS DETERMINISTIC. The form is never stored in order to be known — it is
 * *recomputed*. A re-render, a reload, a resumed session after a closed tab and a
 * re-assignment that upserts the same rows must all produce the same twelve
 * blocks in the same order, or a participant would answer position 7 and come
 * back to a different question 7, and the answer row would describe a question
 * nobody was asked. So the only source of variation is `participantId`, run
 * through the seeded PRNG the rest of the quiz domain already uses (`rng.ts`).
 * No clock, no `Math.random`, no counter.
 *
 * WHY THE MEASUREMENT SURVIVES PEOPLE ANSWERING DIFFERENT ITEMS. The estimator
 * uses *authored*, not calibrated, item parameters (AUDIT.md S8): a block's
 * likelihood contribution depends on which pillar an option carries and how it
 * is keyed, never on what the scenario says. Identical structure is identical
 * measurement — which is why every block in the bank goes through the same
 * `validateBlock()` that guards anything stored, at import, so a malformed bank
 * is a boot failure rather than a quietly wrong ranking.
 *
 * Contract: pure TypeScript. The four JSON files are the only import besides the
 * quiz domain itself — no SDK, no framework, no clock, no randomness.
 */
import rawAgency from "../../../../quiz/bank/agency.json" with { type: "json" };
import rawPoliteness from "../../../../quiz/bank/politeness.json" with {
  type: "json",
};
import rawRegulation from "../../../../quiz/bank/regulation.json" with {
  type: "json",
};
import rawReliability from "../../../../quiz/bank/reliability.json" with {
  type: "json",
};
import type { Block, Keying, Option, Pillar } from "./instrument.ts";
import { BLOCK_COUNT, batchOf, PILLARS, validateBlock } from "./instrument.ts";
import type { OptionKey } from "./response.ts";
import { mulberry32, seedFrom, shuffled } from "./rng.ts";

/**
 * One block as it sits in the bank: everything a `Block` carries except the two
 * fields that only exist once the block has been dealt to somebody. `position`
 * and `batch` are properties of a *form*, not of a question, so they are absent
 * here on purpose — a bank block is not yet anybody's question 7.
 *
 * `id` (`reg-001`, `age-072`) is the block's name in the committed files. It is
 * what a validation failure quotes, and the only handle a human has on a
 * scenario that reads badly in the room.
 */
export interface BankBlock {
  id: string;
  focusPillar: Pillar;
  domain: string;
  scenario: string;
  options: Option[];
}

/** The shape of a bank file. Every union-typed field arrives as a bare string. */
interface RawBankFile {
  pillar: string;
  language: string;
  blocks: {
    id: string;
    focusPillar: string;
    domain: string;
    scenario: string;
    options: { key: string; text: string; pillar: string; keyed: string }[];
  }[];
}

const RAW_FILES = [
  rawRegulation,
  rawPoliteness,
  rawReliability,
  rawAgency,
] as unknown as RawBankFile[];

/**
 * Three blocks per pillar over the twelve positions (`BLOCK_COUNT / 4`). Stated
 * once so the deal below and the tests read the same number.
 */
export const BLOCKS_PER_PILLAR = BLOCK_COUNT / PILLARS.length;

/**
 * The floor `formFor` needs from every pillar. Kept separate from
 * `BLOCKS_PER_PILLAR` even though they are equal today: one is what a form
 * takes, the other is what the bank must be able to supply, and an import-time
 * assertion is clearer when it names the requirement rather than the quota.
 */
const MIN_BLOCKS_PER_PILLAR = BLOCKS_PER_PILLAR;

function toBankBlock(raw: RawBankFile["blocks"][number]): BankBlock {
  return {
    id: raw.id,
    focusPillar: raw.focusPillar as Pillar,
    domain: raw.domain,
    scenario: raw.scenario,
    options: raw.options.map((option) => ({
      key: option.key as OptionKey,
      text: option.text,
      pillar: option.pillar as Pillar,
      keyed: option.keyed as Keying,
    })),
  };
}

/**
 * `validateBlock` is the last word on structure and it speaks in positions, so
 * it is handed the block at a nominal position 1 and any failure is re-thrown
 * naming the bank id instead. The id is the useful coordinate here: "block 1"
 * would point at four hundred candidates, `reg-057` at exactly one.
 */
function validateBankBlock(block: BankBlock): void {
  try {
    validateBlock({ ...block, position: 1, batch: 1 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`bank ${block.id}: ${detail.replace(/^block 1: /, "")}`);
  }
}

function buildBank(files: RawBankFile[]): BankBlock[] {
  const blocks: BankBlock[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    for (const raw of file.blocks) {
      const block = toBankBlock(raw);

      if (seen.has(block.id)) {
        throw new Error(`bank ${block.id}: duplicate block id`);
      }
      seen.add(block.id);

      // The file a block lives in IS its focus pillar; a block filed under the
      // wrong pillar would silently unbalance every form dealt from it, and no
      // structural rule inside the block itself would notice.
      if (block.focusPillar !== file.pillar) {
        throw new Error(
          `bank ${block.id}: filed under "${file.pillar}" but its focusPillar is "${block.focusPillar}"`
        );
      }
      validateBankBlock(block);
      blocks.push(block);
    }
  }

  for (const pillar of PILLARS) {
    const available = blocks.filter(
      (block) => block.focusPillar === pillar
    ).length;
    if (available < MIN_BLOCKS_PER_PILLAR) {
      throw new Error(
        `bank: pillar "${pillar}" has ${available} blocks, needs at least ${MIN_BLOCKS_PER_PILLAR}`
      );
    }
  }

  return blocks;
}

/**
 * Every committed block, validated at import. An invalid bank is a boot failure
 * — the app cannot start on a form it would score wrongly.
 *
 * Deliberately not counted: the bank grows as blocks are authored, and a test
 * that pinned "400" would fail on the next twenty good questions.
 */
export const BANK: readonly BankBlock[] = buildBank(RAW_FILES);

function groupByPillar(
  blocks: readonly BankBlock[]
): Record<Pillar, readonly BankBlock[]> {
  const pools = {} as Record<Pillar, BankBlock[]>;
  for (const pillar of PILLARS) pools[pillar] = [];
  for (const block of blocks) pools[block.focusPillar].push(block);
  return pools;
}

/** The same blocks indexed by focus pillar — the pools `formFor` deals from. */
export const BANK_BY_PILLAR: Record<Pillar, readonly BankBlock[]> =
  groupByPillar(BANK);

/**
 * The focus pillar of each of the twelve positions, for this participant.
 *
 * Three independent shuffles of the four pillars, laid end to end: every pillar
 * lands exactly three times, and — because `BLOCKS_PER_BATCH` is four — each of
 * the three batches carries all four pillars exactly once, which is the balance
 * the estimator assumes when a participant abandons mid-form.
 *
 * Shuffling per participant rather than rotating is what keeps position 1 from
 * being a regulation block for the entire room. A fixed rotation would make the
 * first question in the venue everybody's same-pillar question, and a room that
 * compares notes would be comparing one item.
 */
function focusPillarsFor(random: () => number): Pillar[] {
  const focus: Pillar[] = [];
  for (let cycle = 0; cycle < BLOCKS_PER_PILLAR; cycle++) {
    focus.push(...shuffled(PILLARS, random));
  }
  return focus;
}

/**
 * The twelve blocks `participantId` answers, at positions 1..12.
 *
 * Deterministic in `participantId` alone: the same id always yields the same
 * twelve blocks in the same order, on every process and every deploy, which is
 * what lets the form be recomputed rather than trusted from storage.
 *
 * Two shuffles do the work. One picks the focus pillar of each position; the
 * other walks a shuffled pool per pillar and takes the next block whose everyday
 * setting this form has not used yet. That second rule is cosmetic but it is not
 * decoration: three street-food scenarios in one form read as a bug to the
 * person answering, and the bank has far more settings than a form has
 * positions. When a pillar's pool genuinely runs out of fresh settings the
 * preference is dropped rather than the block — a repeated domain is a blemish,
 * a short form is a broken measurement.
 */
export function formFor(participantId: string): Block[] {
  const random = mulberry32(seedFrom(`bank-form:${participantId}`));
  const focus = focusPillarsFor(random);

  // Shuffled once per pillar, up front, so every draw this form makes comes out
  // of one PRNG stream in one fixed order — the pools are then read, never
  // re-randomised, and taking a block simply removes it.
  const pools = {} as Record<Pillar, BankBlock[]>;
  for (const pillar of PILLARS) {
    pools[pillar] = shuffled(BANK_BY_PILLAR[pillar], random);
  }

  const usedDomains = new Set<string>();

  return focus.map((pillar, index) => {
    const pool = pools[pillar];
    // The first block of this pillar whose setting the form has not used, or —
    // if every one of them repeats a setting — simply the next one.
    let take = pool.findIndex((block) => !usedDomains.has(block.domain));
    if (take === -1) take = 0;

    const [picked] = pool.splice(take, 1);
    usedDomains.add(picked.domain);

    const position = index + 1;
    return {
      position,
      batch: batchOf(position),
      focusPillar: picked.focusPillar,
      domain: picked.domain,
      scenario: picked.scenario,
      options: picked.options.map((option) => ({ ...option })),
    };
  });
}
