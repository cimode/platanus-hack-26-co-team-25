import { describe, expect, it } from "vitest";
import type { RankBand, RankEntry, RankSort } from "./rank";
import { applyRankView } from "./rank";

/**
 * `applyRankView` is the whole reason `/rank`'s client island is small: sorting
 * and band filtering are pure, so the island holds two choices and nothing
 * else. Everything asserted here is AC-RANK-4 plus the two type guards
 * AC-PORT-3 asks for.
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

/**
 * Engine order and alphabetical order deliberately disagree, so a test that
 * passes under one sort cannot pass under the other by accident.
 *
 *   position -> s, a, t, b, c
 *   name     -> a, c, b, s, t   (Ángela sorts as Angela, i.e. before Bruno)
 */
const ENTRIES: readonly RankEntry[] = Object.freeze(
  [
    entry("s", "Sofía Guzmán", 1, "high"),
    entry("a", "Ana Ramírez", 2, "high"),
    entry("t", "Tomás Álvarez", 3, "mid"),
    entry("b", "Bruno Salas", 4, "mid"),
    entry("c", "Ángela Rivas", 5, "mid"),
  ].map((e) => Object.freeze(e))
);

const ids = (list: readonly RankEntry[]) => list.map((e) => e.id);

const view = (sort: RankSort, band: RankBand | "all") => ({ sort, band });

describe("applyRankView", () => {
  it("orders by engine position, not by input order", () => {
    const shuffled = [
      ENTRIES[2],
      ENTRIES[0],
      ENTRIES[4],
      ENTRIES[1],
      ENTRIES[3],
    ];
    expect(ids(applyRankView(shuffled, view("position", "all")))).toEqual([
      "s",
      "a",
      "t",
      "b",
      "c",
    ]);
  });

  it("orders by name, folding accents so Á sorts as A", () => {
    // A code-unit comparison puts "Á" (U+00C1) after "B" and Ángela sorts
    // last -- on a Spanish roster that is most of the room misfiled.
    expect(ids(applyRankView(ENTRIES, view("name", "all")))).toEqual([
      "a",
      "c",
      "b",
      "s",
      "t",
    ]);
  });

  it("narrows to a single band without renumbering positions", () => {
    const high = applyRankView(ENTRIES, view("position", "high"));
    expect(ids(high)).toEqual(["s", "a"]);
    // The pill still reads "2", because position is THIS viewer's rank, not an
    // index into the filtered row (AC-RANK-2).
    expect(high.map((e) => e.position)).toEqual([1, 2]);

    expect(ids(applyRankView(ENTRIES, view("position", "mid")))).toEqual([
      "t",
      "b",
      "c",
    ]);
  });

  it("keeps every entry under `all`", () => {
    expect(applyRankView(ENTRIES, view("position", "all"))).toHaveLength(5);
  });

  it("returns nothing when the band is empty, with no placeholder row", () => {
    // The designed empty state is the screen's job; the pure function must
    // hand it an honestly empty list rather than a padded one (AC-RANK-4).
    const midOnly = ENTRIES.filter((e) => e.band === "mid");
    expect(applyRankView(midOnly, view("position", "high"))).toEqual([]);
  });

  it("is stable: equal names keep the caller's order", () => {
    // A non-stable sort could swap these, and a sort that secretly fell back
    // to `position` would put ana-1 first. Neither is allowed.
    const tied: readonly RankEntry[] = [
      entry("ana-2", "Ana Ramírez", 4, "mid"),
      entry("ana-1", "Ana Ramírez", 2, "mid"),
    ];
    expect(ids(applyRankView(tied, view("name", "all")))).toEqual([
      "ana-2",
      "ana-1",
    ]);
  });

  it("never mutates its input", () => {
    // ENTRIES is frozen, so an in-place sort throws under ESM strict mode
    // rather than silently reordering a list the server rendered from.
    applyRankView(ENTRIES, view("name", "all"));
    applyRankView(ENTRIES, view("position", "high"));
    expect(ids(ENTRIES)).toEqual(["s", "a", "t", "b", "c"]);
  });

  it("returns a new array even when nothing is filtered or reordered", () => {
    const same = applyRankView(ENTRIES, view("position", "all"));
    expect(same).not.toBe(ENTRIES);
    expect(ids(same)).toEqual(ids(ENTRIES));
  });
});

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
