import { describe, it } from "vitest";

/**
 * The instrument constant (issue #4, docs/domain.md §2 D2): `INSTRUMENT` is
 * built at import from quiz/batch-{1,2,3}.json, validated block by block, and
 * frozen by `instrumentHash()` over its content plus `INSTRUMENT.version`.
 *
 * AC-1 pins the hash to a hex literal. The literal is recorded the first time
 * the module builds and never edited afterwards (AUDIT.md F1 "irreversible"):
 * an edited instrument needs a new version, and a new version needs a new room.
 */

describe("INSTRUMENT", () => {
  // TODO: un-skip when src/lib/domain/quiz/instrument.ts exists.
  // Blocked on: INSTRUMENT, instrumentHash, batchOf, imagePathOf and the hash
  // literal recorded from the first build of the module.
  it.skip("AC-1 · INSTRUMENT is the 15 committed blocks, versioned v1 and pinned by hash", () => {});
});

describe("validateBlock / validateResponse", () => {
  // TODO: un-skip when src/lib/domain/quiz/{instrument,response}.ts exist.
  // Blocked on: validateBlock, validateResponse and a valid block to copy
  // from INSTRUMENT.blocks.
  it.skip("AC-2 · a corrupted block or response is rejected naming the position and the rule", () => {});
});
