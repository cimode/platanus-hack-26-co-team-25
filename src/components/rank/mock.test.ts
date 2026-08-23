import { describe, expect, it } from "vitest";
import type { RankedRoom } from "@/lib/domain/reveal/rank";
import { LENSES } from "@/lib/domain/room/layout";
import { mockRankedRoom, type RankCandidate } from "./mock";

/**
 * The fixture is the only thing standing between screen 1c and issue #10, so it
 * has to hold the same properties the real adapter will. Everything asserted
 * here is a property of `RankedRoom` itself -- nothing here knows or cares which
 * names the mock invents.
 *
 * Two of these assertions exist because the first version of this file was
 * wrong in ways nobody would have seen until the demo: it fabricated the viewer
 * (`p-diego-morales`, hardcoded) and its own seven-name roster. Pick anyone else
 * on screen 1a and the ranking greeted the wrong person -- and listed the viewer
 * among their own matches. See R12 in `openspec/changes/ui-flow-screens/tasks.md`.
 */

const VIEWER = { id: "p-laura-mendez", name: "Laura Méndez" };

// Every candidate carries a sprite, exactly as `/rank`'s page mapping does --
// `Placement.sprite` is `readonly string` and can never be null. So the one
// photoless entry below is the FIXTURE's doing, which is the point of the test.
const CANDIDATES: readonly RankCandidate[] = [
  { id: "p-ana-ramirez", name: "Ana Ramírez", photoUrl: "/sprites/a.png" },
  { id: "p-andres-gil", name: "Andrés Gil", photoUrl: "/sprites/b.png" },
  { id: "p-camila-soto", name: "Camila Soto", photoUrl: "/sprites/c.png" },
  { id: "p-diego-morales", name: "Diego Morales", photoUrl: "/sprites/d.png" },
  { id: "p-elena-vargas", name: "Elena Vargas", photoUrl: "/sprites/e.png" },
  { id: "p-mateo-herrera", name: "Mateo Herrera", photoUrl: "/sprites/f.png" },
  { id: "p-natalia-pena", name: "Natalia Peña", photoUrl: "/sprites/g.png" },
];

function ranked(room: RankedRoom) {
  if (room.status !== "ranked") throw new Error(`status was ${room.status}`);
  return room;
}

/** Every string key reachable from the value, however deeply nested. */
function everyKey(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) everyKey(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      everyKey(child, found);
    }
  }
  return found;
}

describe("mockRankedRoom", () => {
  it("gives every lens something to paint: at least 5 entries in both bands", () => {
    // Not decoration. A lens that produced one band would leave the filter
    // chips with nothing to do, and AC-RANK-3 needs two pills with differing
    // computed backgrounds to have any subject at all.
    for (const lens of LENSES) {
      const room = ranked(mockRankedRoom(lens, VIEWER, CANDIDATES));
      expect(room.entries.length, lens).toBeGreaterThanOrEqual(5);
      const bands = new Set(room.entries.map((e) => e.band));
      expect(bands, lens).toEqual(new Set(["high", "mid"]));
    }
  });

  it("numbers positions 1..n with no gap and no repeat", () => {
    for (const lens of LENSES) {
      const room = ranked(mockRankedRoom(lens, VIEWER, CANDIDATES));
      const positions = room.entries.map((e) => e.position);
      expect(positions, lens).toEqual(
        Array.from({ length: positions.length }, (_, i) => i + 1)
      );
    }
  });

  it("never ranks the viewer against themselves (R12)", () => {
    // The bug this replaces: a hardcoded viewer meant Laura opened her own
    // ranking and found Laura in it.
    for (const lens of LENSES) {
      const room = ranked(mockRankedRoom(lens, VIEWER, CANDIDATES));
      expect(room.viewer.id, lens).toBe(VIEWER.id);
      expect(room.viewer.name, lens).toBe(VIEWER.name);
      expect(
        room.entries.map((e) => e.id),
        lens
      ).not.toContain(VIEWER.id);
    }
  });

  it("invents nobody: every entry is a candidate that was handed in", () => {
    const given = new Set(CANDIDATES.map((c) => c.id));
    for (const lens of LENSES) {
      const room = ranked(mockRankedRoom(lens, VIEWER, CANDIDATES));
      for (const entry of room.entries) {
        expect(given.has(entry.id), `${lens}: ${entry.id}`).toBe(true);
        const source = CANDIDATES.find((c) => c.id === entry.id);
        expect(entry.name).toBe(source?.name);
        // Photo presence may be DROPPED but never invented: a fixture may say
        // "this person has not uploaded one yet", which is a render state, and
        // may not conjure a photo for someone who has none.
        if (entry.photoUrl !== null) {
          expect(entry.photoUrl).toBe(source?.photoUrl);
        }
      }
    }
  });

  it("gives the photoless placeholder a subject in every room", () => {
    // Without this, `rank-card.tsx`'s placeholder branch and `avatar-stage`'s
    // are code no test and no demo has ever rendered. Two verify passes called
    // that CRITICAL before it was closed.
    for (const lens of LENSES) {
      const room = ranked(mockRankedRoom(lens, VIEWER, CANDIDATES));
      const photoless = room.entries.filter((e) => e.photoUrl === null);
      expect(photoless.length, lens).toBe(1);
    }
  });

  it("carries no score anywhere in the object graph (AC-PORT-3)", () => {
    // The type already forbids these, but a fixture is exactly where a stray
    // `sim` gets added "just for debugging" and then serialised to the client.
    // Walking the graph catches it wherever it is buried.
    const forbidden = ["rank", "sim", "score", "contribution", "shortfall"];
    for (const lens of LENSES) {
      const keys = everyKey(mockRankedRoom(lens, VIEWER, CANDIDATES));
      for (const key of forbidden) {
        expect(keys.has(key), `${lens} leaks "${key}"`).toBe(false);
      }
    }
  });

  it("is deterministic: the same room twice is the same ranking", () => {
    // The screen is a Server Component, so an unstable fixture would reorder
    // between the prerender and the demo without anyone touching anything.
    for (const lens of LENSES) {
      expect(mockRankedRoom(lens, VIEWER, CANDIDATES)).toEqual(
        mockRankedRoom(lens, VIEWER, CANDIDATES)
      );
    }
  });

  it("makes the lens change the ranking, or the lens picker is theatre", () => {
    const orders = LENSES.map((lens) =>
      ranked(mockRankedRoom(lens, VIEWER, CANDIDATES))
        .entries.map((e) => e.id)
        .join(",")
    );
    expect(new Set(orders).size).toBe(LENSES.length);
  });

  it("renders a card without friction rather than dropping the card", () => {
    // AC-RANK-2: friction is optional, and the layout must not collapse. If the
    // fixture gave everyone friction, the null branch would never be exercised.
    const entries = ranked(
      mockRankedRoom("romantic", VIEWER, CANDIDATES)
    ).entries;
    expect(entries.some((e) => e.friction === null)).toBe(true);
    expect(entries.some((e) => e.friction !== null)).toBe(true);
  });

  it("survives a room too small to rank, without inventing people", () => {
    const room = mockRankedRoom("romantic", VIEWER, []);
    if (room.status === "ranked") expect(room.entries).toEqual([]);
  });
});
