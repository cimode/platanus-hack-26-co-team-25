import { describe, expect, it } from "vitest";
import * as quiz from ".";
import {
  type Block,
  batchOf,
  INSTRUMENT,
  instrumentHash,
  type Pillar,
  validateBlock,
} from "./instrument";
import { type BlockResponse, validateResponse } from "./response";

/**
 * The instrument constant (issue #4, docs/domain.md §2 D2): `INSTRUMENT` is
 * built at import from quiz/batch-{1,2,3}.json, validated block by block, and
 * frozen by `instrumentHash()` over its content plus `INSTRUMENT.version`.
 *
 * AC-1 pins the hash to a hex literal. The literal is recorded the first time
 * the module builds and never edited afterwards (AUDIT.md F1 "irreversible"):
 * an edited instrument needs a new version, and a new version needs a new room.
 *
 * The literal below was recorded from the three committed JSON files with the
 * canonicalisation D2 specifies, which `instrumentHash()` has to reproduce
 * byte for byte:
 *
 *     JSON.stringify({
 *       version: instrument.version,
 *       blocks: instrument.blocks.map((b) => ({
 *         position: b.position,
 *         focusPillar: b.focusPillar,
 *         scenario: b.scenario,
 *         options: b.options.map((o) => ({
 *           key: o.key, text: o.text, pillar: o.pillar, keyed: o.keyed,
 *         })),
 *       })),
 *     })
 *
 * hashed with 64-bit FNV-1a (offset basis 0xcbf29ce484222325, prime
 * 0x100000001b3) over the UTF-8 bytes of that string, printed as 16 lowercase
 * hex characters, zero-padded. Blocks contribute in position order 1..15;
 * `batch`, `domain`, `language` and the image prompts stay outside the hash --
 * they are delivery and generation metadata, not the instrument.
 */

const PILLARS: Pillar[] = ["regulation", "politeness", "reliability", "agency"];
const OPTION_KEYS = ["a", "b", "c", "d"];

/** Recorded from quiz/batch-{1,2,3}.json at version "v1". Never edited. */
const INSTRUMENT_HASH_V1 = "7d22a9738ae27d2b";

/** How often the reversed slot falls on each pillar across the 15 blocks. */
const REVERSED_PER_PILLAR: Record<Pillar, number> = {
  regulation: 4,
  politeness: 4,
  reliability: 4,
  agency: 3,
};

/** Deep copy, so a corruption never edits INSTRUMENT itself. */
function copyBlock(block: Block): Block {
  return structuredClone(block);
}

/** The message of the error `fn` throws; fails the test when it throws none. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a throw, got none");
}

function responseAt(overrides: Partial<BlockResponse>): BlockResponse {
  return {
    participantId: "11111111-1111-7111-8111-111111111111",
    position: 7,
    mostKey: "c",
    leastKey: null,
    shownOrder: "cbad",
    answeredAt: new Date("2026-08-22T18:30:00.000Z"),
    ...overrides,
  };
}

describe("INSTRUMENT", () => {
  it("AC-1 · INSTRUMENT is the 15 committed blocks, versioned v1 and pinned by hash", () => {
    expect(INSTRUMENT.version).toBe("v1");
    expect(INSTRUMENT.blocks).toHaveLength(15);
    expect(INSTRUMENT.blocks.map((block) => block.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);

    const reversedPerPillar: Record<string, number> = {};
    for (const block of INSTRUMENT.blocks) {
      const where = `block ${block.position}`;

      expect(
        block.options.map((option) => option.key),
        where
      ).toEqual(OPTION_KEYS);
      expect(
        [...block.options.map((option) => option.pillar)].sort(),
        where
      ).toEqual([...PILLARS].sort());

      const reversed = block.options.filter(
        (option) => option.keyed === "reversed"
      );
      expect(reversed, where).toHaveLength(1);
      expect(reversed[0].pillar, where).toBe(block.focusPillar);

      reversedPerPillar[reversed[0].pillar] =
        (reversedPerPillar[reversed[0].pillar] ?? 0) + 1;
    }
    // PILLARS.md §7.2 / §8: the reversed slot rotates 4/4/4/3 over 15 blocks.
    expect(reversedPerPillar).toEqual(REVERSED_PER_PILLAR);

    // D2: the version lives on INSTRUMENT and nowhere else.
    expect(Object.keys(quiz)).not.toContain("INSTRUMENT_VERSION");

    expect([batchOf(1), batchOf(5), batchOf(6), batchOf(15)]).toEqual([
      1, 1, 2, 3,
    ]);

    // The freeze (AUDIT.md F1). Any change to a block's position, focus
    // pillar, scenario or option text / pillar / keying moves this hex.
    expect(instrumentHash()).toBe(INSTRUMENT_HASH_V1);
    // ... and a version bump alone moves it too, which is what makes the hash
    // a version freeze rather than a content checksum.
    expect(
      instrumentHash({ version: "v2", blocks: INSTRUMENT.blocks })
    ).not.toBe(INSTRUMENT_HASH_V1);
  });
});

describe("validateBlock / validateResponse", () => {
  it("AC-2 · a corrupted block or response is rejected naming the position and the rule", () => {
    expect(INSTRUMENT.blocks.length).toBeGreaterThan(0);
    const valid = INSTRUMENT.blocks[0];
    const position = String(valid.position);

    // Two options keyed "reversed".
    const twoReversed = copyBlock(valid);
    const firstPositive = twoReversed.options.find(
      (option) => option.keyed === "positive"
    );
    expect(firstPositive).toBeDefined();
    if (firstPositive) firstPositive.keyed = "reversed";

    // The single reversed option moved off the focus pillar: swap its pillar
    // with another option's, so every pillar still appears exactly once and
    // only the "reversed sits on the focus pillar" rule is broken.
    const offFocus = copyBlock(valid);
    const reversed = offFocus.options.find(
      (option) => option.keyed === "reversed"
    );
    const other = offFocus.options.find(
      (option) => option.keyed !== "reversed"
    );
    expect(reversed).toBeDefined();
    expect(other).toBeDefined();
    if (reversed && other) {
      const swap = reversed.pillar;
      reversed.pillar = other.pillar;
      other.pillar = swap;
    }

    // Two options on the same pillar (and one pillar therefore missing).
    const duplicatePillar = copyBlock(valid);
    const positives = duplicatePillar.options.filter(
      (option) => option.keyed === "positive"
    );
    expect(positives.length).toBeGreaterThanOrEqual(2);
    positives[1].pillar = positives[0].pillar;

    // An option keyed "e".
    const badKey = copyBlock(valid);
    (badKey.options[3] as { key: string }).key = "e";

    const corruptions: Array<[string, Block, RegExp]> = [
      ["two reversed options", twoReversed, /exactly one reversed option/i],
      [
        "reversed off the focus pillar",
        offFocus,
        /reversed option must be on the focus pillar/i,
      ],
      ["a repeated pillar", duplicatePillar, /each pillar exactly once/i],
      ["an option keyed e", badKey, /keys must be a\.\.d/i],
    ];

    for (const [label, block, rule] of corruptions) {
      const message = messageOf(() => validateBlock(block));
      expect(message, label).toMatch(rule);
      expect(message, `${label} names the position`).toContain(position);
    }

    // most === least, a position out of range, a shownOrder that is not a
    // permutation of "abcd" -- each names the field that failed.
    expect(
      messageOf(() =>
        validateResponse(responseAt({ mostKey: "a", leastKey: "a" }))
      )
    ).toMatch(/leastKey/);
    expect(
      messageOf(() => validateResponse(responseAt({ position: 16 })))
    ).toMatch(/position/);
    expect(
      messageOf(() => validateResponse(responseAt({ shownOrder: "aabc" })))
    ).toMatch(/shownOrder/);

    // The unmodified block and a well-formed single-pick response pass.
    expect(() => validateBlock(valid)).not.toThrow();
    expect(() => validateResponse(responseAt({}))).not.toThrow();
  });
});
