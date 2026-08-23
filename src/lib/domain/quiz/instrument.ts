/**
 * instrument.ts — the structural contract of a block, and the version marker.
 *
 * WHAT THIS IS NOT, ANY MORE. `INSTRUMENT` was once the form: the fifteen blocks
 * in `quiz/batch-{1,2,3}.json` that every participant answered. Nobody answers
 * them now. Live authoring was deleted because it made people wait on a model
 * (see `bank.ts`), and what replaced it is the committed question bank — four
 * hundred blocks under `quiz/bank/`, twelve of them dealt to each participant by
 * `formFor()`. The three batch files survive here as the corpus behind
 * `INSTRUMENT`, and `INSTRUMENT` survives for exactly two jobs:
 *
 *   · `INSTRUMENT.version` — the STRUCTURAL version marker a room records and
 *     scoring refuses to cross. It is "bank-1" now: what changed is not a
 *     scenario but the shape of a form (twelve positions, three per pillar,
 *     dealt from a bank), and responses gathered under the old shape cannot be
 *     re-scored onto the new one.
 *   · a fixed, hash-pinned, structurally valid form for tests and tooling that
 *     need one without inventing it.
 *
 * `validateBlock()` is the part that still governs everything: it is applied to
 * every bank block at import and to anything on its way into storage. It, not
 * `INSTRUMENT`, is what makes two people's different questions one measurement.
 *
 * The three JSON files are the only thing this module imports: no SDK, no
 * framework, no clock, no randomness.
 */
import rawBatch1 from "../../../../quiz/batch-1.json" with { type: "json" };
import rawBatch2 from "../../../../quiz/batch-2.json" with { type: "json" };
import rawBatch3 from "../../../../quiz/batch-3.json" with { type: "json" };
import type { OptionKey } from "./response.ts";

export type Pillar = "regulation" | "politeness" | "reliability" | "agency";
export type Keying = "positive" | "reversed";

export interface Option {
  key: OptionKey;
  text: string;
  pillar: Pillar;
  keyed: Keying;
}

export interface Block {
  /** 1..12 within a participant's form. */
  position: number;
  /** 1..3 -- `batchOf(position)`. */
  batch: number;
  focusPillar: Pillar;
  domain: string;
  scenario: string;
  options: Option[];
}

export interface Instrument {
  version: string;
  blocks: Block[];
}

/** The four pillars (PILLARS.md §2). Nothing in the database stores them. */
export const PILLARS: readonly Pillar[] = [
  "regulation",
  "politeness",
  "reliability",
  "agency",
];

/** Every block carries exactly these four option keys, in this order. */
export const OPTION_KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

/**
 * How many blocks share a `batch` number.
 *
 * "Batch" no longer means anything to a participant: there is nothing to
 * generate, so there is nothing to deliver in instalments and no between-batch
 * beat. It survives as an INTERNAL grouping — `batchOf()` still yields 1..3 over
 * twelve positions, so every `byBatch` query and the `generated_blocks.batch`
 * column keep working unchanged. Do not put it on a screen.
 */
export const BLOCKS_PER_BATCH = 4;

/** A form is 12 blocks — three per pillar, dealt by `formFor()` (bank.ts). */
export const BLOCK_COUNT = 12;

/**
 * The shape the generation pipeline writes. Deliberately NOT the domain shape:
 * `id` becomes `position`, `language`, `styleToken` and `imagePrompts` are
 * generation metadata the instrument never carries, and every union-typed field
 * arrives as a bare string that `validateBlock()` has to earn.
 */
interface RawOption {
  key: string;
  text: string;
  pillar: string;
  keyed: string;
}

interface RawBlock {
  id: number;
  focusPillar: string;
  domain: string;
  scenario: string;
  options: RawOption[];
}

interface RawBatch {
  batch: number;
  blocks: RawBlock[];
}

const RAW_BATCHES = [rawBatch1, rawBatch2, rawBatch3] as unknown as RawBatch[];

function toBlock(batch: number, raw: RawBlock): Block {
  return {
    position: raw.id,
    batch,
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

/** `ceil(position / 4)` -- the internal batch a position is grouped into. */
export function batchOf(position: number): number {
  return Math.ceil(position / BLOCKS_PER_BATCH);
}

/**
 * Four pillars once each, keys exactly a..d, exactly one `reversed` option and
 * it sits on `focusPillar`. Throws naming the block position and the rule.
 *
 * The checks run in the order the rules depend on one another: a block whose
 * option keys are wrong has no meaningful pillar balance to report.
 */
export function validateBlock(block: Block): void {
  const where = `block ${block.position}`;

  if (!Number.isInteger(block.position) || block.position < 1) {
    throw new Error(`${where}: position must be a positive integer`);
  }
  if (!PILLARS.includes(block.focusPillar)) {
    throw new Error(
      `${where}: focusPillar must be one of ${PILLARS.join(", ")}`
    );
  }

  const keys = block.options.map((option) => option.key);
  if (
    keys.length !== OPTION_KEYS.length ||
    keys.some((key, index) => key !== OPTION_KEYS[index])
  ) {
    throw new Error(
      `${where}: option keys must be a..d in order, got ${keys.join(",")}`
    );
  }

  const pillars = block.options.map((option) => option.pillar);
  const covered = new Set(pillars);
  if (
    covered.size !== PILLARS.length ||
    PILLARS.some((pillar) => !covered.has(pillar))
  ) {
    throw new Error(
      `${where}: each pillar exactly once, got ${pillars.join(",")}`
    );
  }

  for (const option of block.options) {
    if (option.keyed !== "positive" && option.keyed !== "reversed") {
      throw new Error(
        `${where}: option ${option.key} is keyed "${option.keyed}", expected positive or reversed`
      );
    }
  }

  const reversed = block.options.filter(
    (option) => option.keyed === "reversed"
  );
  if (reversed.length !== 1) {
    throw new Error(
      `${where}: exactly one reversed option, found ${reversed.length}`
    );
  }
  if (reversed[0].pillar !== block.focusPillar) {
    throw new Error(
      `${where}: the reversed option must be on the focus pillar (${block.focusPillar}), found ${reversed[0].pillar}`
    );
  }
}

/**
 * Builds a form out of the committed corpus: the blocks in position order,
 * truncated to `BLOCK_COUNT`, with `batch` re-derived rather than trusted.
 *
 * Both of those are new. The corpus is fifteen blocks and a form is twelve now,
 * and the batch number written into the JSON was the batch the block was
 * *authored* in, which the current grouping no longer agrees with. Truncating
 * keeps `INSTRUMENT` a structurally valid form of the shape the app actually
 * uses -- three reversed slots per pillar over positions 1..12 -- so anything
 * that needs a form without inventing one still gets a legal one.
 */
function buildInstrument(version: string, batches: RawBatch[]): Instrument {
  const blocks = batches
    .flatMap((batch) => batch.blocks.map((raw) => toBlock(batch.batch, raw)))
    .sort((left, right) => left.position - right.position)
    .slice(0, BLOCK_COUNT)
    .map((block) => ({ ...block, batch: batchOf(block.position) }));

  if (blocks.length !== BLOCK_COUNT) {
    throw new Error(
      `instrument: expected ${BLOCK_COUNT} blocks, got ${blocks.length}`
    );
  }
  blocks.forEach((block, index) => {
    if (block.position !== index + 1) {
      throw new Error(
        `instrument: blocks must run 1..${BLOCK_COUNT} with no gaps, found ${block.position} at index ${index}`
      );
    }
    validateBlock(block);
  });

  return { version, blocks };
}

/**
 * The committed batch files, built and validated at import at version
 * "bank-1" -- the structural marker described in the file header. Its blocks
 * are no longer served to anybody; its version is what a room records.
 */
export const INSTRUMENT: Instrument = buildInstrument("bank-1", RAW_BATCHES);

/**
 * The canonical JSON D2 freezes: content plus version, blocks in position
 * order. `batch`, `domain`, `language` and the image prompts stay outside it --
 * they are delivery and generation metadata, not the instrument.
 */
function canonicalise(instrument: Instrument): string {
  return JSON.stringify({
    version: instrument.version,
    blocks: instrument.blocks.map((block) => ({
      position: block.position,
      focusPillar: block.focusPillar,
      scenario: block.scenario,
      options: block.options.map((option) => ({
        key: option.key,
        text: option.text,
        pillar: option.pillar,
        keyed: option.keyed,
      })),
    })),
  });
}

// 64-bit FNV-1a. Written with BigInt() calls rather than `n` literals because
// tsconfig targets ES2017; the arithmetic is identical.
const FNV_OFFSET_BASIS = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK_64 = BigInt("0xffffffffffffffff");

/**
 * 64-bit FNV-1a over the canonical JSON of the instrument -- content plus
 * version (D2). Pure and dependency-free so it runs in any runtime.
 */
export function instrumentHash(instrument: Instrument = INSTRUMENT): string {
  const bytes = new TextEncoder().encode(canonicalise(instrument));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
