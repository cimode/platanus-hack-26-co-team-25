import { describe, expect, it } from "vitest";
import type { RankBand, RankEntry } from "./rank";

/**
 * The type contract, and only the type contract.
 *
 * `applyRankView`'s behaviour is exercised next to the board that calls it, in
 * `src/components/rank/view.test.ts`. What stays here are the two probes issue
 * #10 cites as its guarantee that a score cannot reach a screen -- they guard
 * the shapes `prepareResults` must return, so they belong with the shapes.
 *
 * RED for these is `pnpm run typecheck`, never vitest: `@ts-expect-error` is a
 * plain comment to the vitest transform, so a probe that stops guarding
 * anything still reports green here. `TS2578 Unused '@ts-expect-error'
 * directive` is the failure that matters.
 */

function entry(
  id: string,
  name: string,
  position: number,
  band: RankBand
): RankEntry {
  return {
    id,
    name,
    photoUrl: null,
    position,
    band,
    bond: { term: "commonGround", label: "Gustos en común" },
    friction: null,
  };
}

describe("the read model cannot carry a score", () => {
  it("rejects a third band (AC-PORT-3)", () => {
    const fromAdapter = "low";
    // @ts-expect-error -- RankBand is "high" | "mid". The design has two pills,
    // so an adapter that computes bandOf(rank) === "low" must not compile its
    // way onto the screen; below-band people are ABSENT, never a third pill.
    const rejected: RankBand = fromAdapter;
    expect(rejected).toBe("low");
  });

  it("rejects a compatibility number on an entry (AC-PORT-3)", () => {
    const scored = {
      ...entry("s", "Sofía Guzmán", 1, "high"),
      // @ts-expect-error -- `rank`/`sim` stop in the adapter (D3). If a float
      // could cross the port, no serialiser downstream could stop it leaking.
      rank: 0.87,
    } satisfies RankEntry;
    expect(scored.position).toBe(1);
  });
});
