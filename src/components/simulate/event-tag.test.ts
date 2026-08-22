/**
 * Two things are tested here that look like one thing and are not.
 *
 * 1. `tagFor` is TOTAL over `EventKind` as WE declare it. That is a
 *    compile-time property of the exhaustive `Record` in `event-tag.ts` and a
 *    runtime property of the 16 cases below.
 * 2. `EventKind` as we declare it still EQUALS `EventKind` as the narration
 *    engine declares it. Nothing else in this repo checks that. The copy is a
 *    copy on purpose -- root `timeline/` is a separate package with its own
 *    lockfile and is excluded from `tsconfig.json`, so it can never be
 *    imported -- which means the exhaustive `Record` only fires AFTER a human
 *    has already updated the copy. Upstream drift is invisible until the test
 *    below reads the other file's bytes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventKind } from "@/lib/domain/reveal/timeline";
import { TAG_TOKENS, type TagToken, tagFor } from "./event-tag";

/**
 * Every member of the union, written out. `satisfies` catches a typo;
 * `CoversEveryKind` catches a member left out.
 */
const EVENT_KINDS = [
  "milestone",
  "move",
  "job",
  "pet",
  "kid",
  "ritual",
  "trip",
  "conflict",
  "recovery",
  "venture",
  "client",
  "decision",
  "exit",
  "dissolution",
  "epilogue",
  "vignette",
] as const satisfies readonly EventKind[];

/**
 * `true` only while `EVENT_KINDS` covers the whole union. Drop a member and
 * this becomes `false`, so `const covers: CoversEveryKind = true` stops
 * compiling -- `pnpm run typecheck` catches the hole before the loops below
 * quietly test fifteen kinds and call it total.
 */
type CoversEveryKind = [
  Exclude<EventKind, (typeof EVENT_KINDS)[number]>,
] extends [never]
  ? true
  : false;

/**
 * The map the reconciliation settled (`tasks.md` R3: DESIGN wins over the
 * spec's table). Written from that document, not read off the implementation:
 * pinning each kind is what stops a constant `tagFor` from passing the
 * totality test above while painting all sixteen chips the same colour.
 */
const EXPECTED_TOKEN: Record<EventKind, TagToken> = {
  milestone: "hito",
  job: "hito",
  venture: "hito",
  client: "hito",
  move: "mudanza",
  exit: "mudanza",
  pet: "mascota",
  kid: "peque",
  ritual: "ritual",
  recovery: "ritual",
  epilogue: "ritual",
  trip: "viaje",
  vignette: "viaje",
  conflict: "roce",
  decision: "roce",
  dissolution: "roce",
};

describe("tagFor collapses 16 event kinds onto 7 tag tokens", () => {
  it("AC-PORT-7 · EVENT_KINDS lists every member of the union once", () => {
    const covers: CoversEveryKind = true;
    expect(covers).toBe(true);
    expect(EVENT_KINDS).toHaveLength(16);
    expect(new Set(EVENT_KINDS).size).toBe(16);
  });

  it("AC-PORT-7 · every kind resolves to one of the seven tokens", () => {
    expect(EVENT_KINDS).toHaveLength(16);
    expect(TAG_TOKENS).toHaveLength(7);
    for (const kind of EVENT_KINDS) {
      const tag = tagFor(kind);
      expect(tag, kind).not.toBeUndefined();
      expect(TAG_TOKENS, kind).toContain(tag.token);
    }
  });

  it("AC-PORT-7 · maps every kind to the token R3 settled on", () => {
    expect(EVENT_KINDS).toHaveLength(16);
    for (const kind of EVENT_KINDS) {
      expect(tagFor(kind).token, kind).toBe(EXPECTED_TOKEN[kind]);
    }
  });

  it("AC-PORT-7 · a good exit is not a fight: exit is mudanza, not roce", () => {
    // The one cell the reconciliation overturned by name. A successful
    // business exit painted amber reads as a fight, so `roce` must not take
    // it. Regression-proofing the decision, not restating the loop above.
    expect(tagFor("exit").token).toBe("mudanza");
    expect(tagFor("conflict").token).toBe("roce");
    expect(tagFor("exit").token).not.toBe(tagFor("conflict").token);
  });

  it("AC-SIM-5 · uses all seven tokens, so the collapse is 16->7 not 16->1", () => {
    const used = new Set(EVENT_KINDS.map((kind) => tagFor(kind).token));
    expect([...used].sort()).toEqual([...TAG_TOKENS].sort());
  });

  it("AC-SIM-5 · colour is the family, label is the identity: 16 labels", () => {
    const labels = EVENT_KINDS.map((kind) => tagFor(kind).label);
    expect(labels).toHaveLength(16);
    expect(new Set(labels).size).toBe(16);
    expect(labels.filter((label) => label.trim() === "")).toEqual([]);
  });
});

describe("our copy of EventKind has not drifted from the engine", () => {
  /**
   * Deliberately coupled to a path OUTSIDE `src/`. Bytes are the only channel
   * to `timeline/`: it resolves against its own `node_modules` (zod ^3 against
   * this project's ^4) and `tsconfig.json` excludes it, so an `import` here
   * would be a lie even if it typechecked. If `timeline/` is ever moved or
   * renamed this throws ENOENT and the suite goes red -- that is the intended
   * behaviour. A test that shrugged and passed would leave the copy unguarded.
   */
  // Anchored to the REPO ROOT (vitest runs from there), not to this file's own
  // location. The original resolved with four `../` hops, which meant moving
  // this test broke the trap for the wrong reason -- and it did: relocating it
  // out of `src/lib/domain/reveal/` made it read `~/Dev/timeline/shared.ts`.
  // The trap should fire when the ENGINE moves, not when we do.
  const SHARED_TS = resolve(process.cwd(), "timeline/shared.ts");

  function upstreamEventKinds(): string[] {
    const source = readFileSync(SHARED_TS, "utf8");
    const declaration = /export type EventKind =([^;]*);/.exec(source);
    if (declaration === null) {
      throw new Error(
        `No 'export type EventKind = ...;' found in ${SHARED_TS}. ` +
          "The union was renamed or reshaped upstream; reconcile " +
          "src/components/simulate/timeline.ts with it."
      );
    }
    return [...declaration[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  }

  it("AC-PORT-7 · finds the union in timeline/shared.ts", () => {
    // Guards the set comparison below from passing vacuously on two empty
    // sets when the extraction silently matches nothing.
    expect(upstreamEventKinds().length).toBeGreaterThan(0);
  });

  it("AC-PORT-7 · our copy is set-equal to timeline/shared.ts:78-82", () => {
    expect([...upstreamEventKinds()].sort()).toEqual([...EVENT_KINDS].sort());
  });
});
