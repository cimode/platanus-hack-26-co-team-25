import { describe, expect, it } from "vitest";
import { mockRankedRoom, type RankCandidate } from "@/components/rank/mock";
import { TAG_TOKENS, tagFor } from "@/components/simulate/event-tag";
import type { EventKind, RankedRoom } from "@/lib/domain/reveal";
import { LENSES, type Lens } from "@/lib/domain/room/layout";
import { mockSimulatedLife } from "./mock";

/**
 * Screen 1f's fixture.
 *
 * The three properties that carry this file: the union is respected
 * structurally (friendship has no horizon KEY, not a null one), every one of
 * the sixteen `EventKind` members has a subject so AC-SIM-5 is not vacuous, and
 * both `Ending` outcomes are reachable somewhere in the roster so the ending
 * card's two branches are both live code.
 */

const VIEWER = { id: "p-laura-mendez", name: "Laura Méndez" };

const CANDIDATES: readonly RankCandidate[] = [
  { id: "p-ana-ramirez", name: "Ana Ramírez", photoUrl: "/sprites/a.png" },
  { id: "p-andres-gil", name: "Andrés Gil", photoUrl: "/sprites/b.png" },
  { id: "p-camila-soto", name: "Camila Soto", photoUrl: "/sprites/c.png" },
  { id: "p-diego-morales", name: "Diego Morales", photoUrl: "/sprites/d.png" },
  { id: "p-elena-vargas", name: "Elena Vargas", photoUrl: "/sprites/e.png" },
  { id: "p-mateo-herrera", name: "Mateo Herrera", photoUrl: "/sprites/f.png" },
  { id: "p-natalia-pena", name: "Natalia Peña", photoUrl: "/sprites/g.png" },
];

const EVENT_KINDS: readonly EventKind[] = [
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
  "exit",
  "decision",
  "dissolution",
  "epilogue",
  "vignette",
];

const room = (lens: Lens): RankedRoom =>
  mockRankedRoom(lens, VIEWER, CANDIDATES);

const life = (otherId: string, lens: Lens) =>
  mockSimulatedLife(otherId, room(lens), CANDIDATES);

/** Every id that is actually rankable under a lens. */
function ranked(lens: Lens): readonly string[] {
  const current = room(lens);
  if (current.status !== "ranked") throw new Error("not ranked");
  return current.entries.map((entry) => entry.id);
}

describe("mockSimulatedLife", () => {
  it("suppresses an unknown id, the viewer, and anyone unranked — identically", () => {
    // One `null`, three causes. If they were distinguishable the 404 becomes an
    // oracle for who is in the room (AC-SIM-2).
    for (const lens of LENSES) {
      expect(life("p-nobody-at-all", lens)).toBeNull();
      expect(life(VIEWER.id, lens)).toBeNull();
      expect(life("", lens)).toBeNull();
    }
  });

  it("names both people, and never a third", () => {
    for (const lens of LENSES) {
      for (const id of ranked(lens)) {
        const found = life(id, lens);
        expect(found?.subject.id, `${lens}/${id}`).toBe(VIEWER.id);
        expect(found?.other.id).toBe(id);
      }
    }
  });

  it("gives every one of the sixteen kinds a subject (AC-SIM-5)", () => {
    // Without this the chip mapping is 16 branches with 3 ever rendered, and
    // AC-SIM-5's "16 cards, each with exactly one chip" has nothing to count.
    for (const lens of LENSES) {
      const found = life(ranked(lens)[0], lens);
      const kinds = found?.events.map((event) => event.kind) ?? [];
      expect(new Set(kinds), lens).toEqual(new Set(EVENT_KINDS));
      expect(kinds.length, lens).toBe(EVENT_KINDS.length);
    }
  });

  it("resolves every event to exactly one of the seven tokens", () => {
    const found = life(ranked("romantic")[0], "romantic");
    for (const event of found?.events ?? []) {
      const tag = tagFor(event.kind);
      expect(TAG_TOKENS).toContain(tag.token);
      expect(tag.label.length).toBeGreaterThan(0);
    }
  });

  it("sorts events ascending by year, always", () => {
    for (const lens of LENSES) {
      for (const id of ranked(lens)) {
        const years = life(id, lens)?.events.map((e) => e.year) ?? [];
        expect([...years], `${lens}/${id}`).toEqual(
          [...years].sort((a, b) => a - b)
        );
      }
    }
  });

  it("keeps paired events inside the horizon it declared (AC-SIM-3)", () => {
    for (const lens of ["romantic", "business"] as const) {
      for (const id of ranked(lens)) {
        const found = life(id, lens);
        if (!found || found.lens === "friendship") throw new Error("paired");
        expect(found.horizonYears, `${lens}/${id}`).toBeGreaterThanOrEqual(
          lens === "romantic" ? 8 : 5
        );
        expect(found.horizonYears).toBeLessThanOrEqual(
          lens === "romantic" ? 14 : 10
        );
        for (const event of found.events) {
          expect(event.year).toBeGreaterThanOrEqual(1);
          expect(event.year).toBeLessThanOrEqual(found.horizonYears);
        }
      }
    }
  });

  it("gives friendship no horizon KEY and no ending KEY (AC-SIM-4)", () => {
    // Structural, not nullable. `"horizonYears" in x` is false, so nothing can
    // render the word "null" and nothing can read a duration off it.
    for (const id of ranked("friendship")) {
      const found = life(id, "friendship");
      expect(found?.lens).toBe("friendship");
      expect(Object.hasOwn(found ?? {}, "horizonYears"), id).toBe(false);
      expect(Object.hasOwn(found ?? {}, "ending"), id).toBe(false);
    }
  });

  it("makes both endings, and both epilogues, reachable in one roster", () => {
    // Otherwise the ending card ships with one of its two branches never
    // rendered -- which is the exact defect two verify passes found on 1c/1d.
    const outcomes = new Set<string>();
    const epilogues = new Set<boolean>();
    for (const lens of ["romantic", "business"] as const) {
      for (const id of ranked(lens)) {
        const found = life(id, lens);
        if (!found || found.lens === "friendship") throw new Error("paired");
        outcomes.add(found.ending.outcome);
        if (found.ending.outcome === "apart") {
          epilogues.add(found.ending.epilogue !== null);
          expect(found.ending.year).toBeGreaterThanOrEqual(1);
          expect(found.ending.year).toBeLessThanOrEqual(found.horizonYears);
        }
      }
    }
    expect(outcomes).toEqual(new Set(["together", "apart"]));
    expect(epilogues).toEqual(new Set([true, false]));
  });

  it("carries nothing offspring-shaped and no score (AC-PORT-8, AC-PORT-3)", () => {
    for (const lens of LENSES) {
      const serialised = JSON.stringify(life(ranked(lens)[0], lens));
      expect(serialised, lens).not.toMatch(/beb[eé]|hijo|offspring/i);
      for (const key of ["rank", "sim", "score", "probability", "survival"]) {
        expect(serialised, `${lens} leaks ${key}`).not.toMatch(
          new RegExp(`"${key}"`)
        );
      }
      // No percentage and no bare decimal anywhere in the narrated prose.
      expect(serialised, lens).not.toMatch(/\d+([.,]\d+)?\s*%/);
    }
  });

  it("narrates in neutral Spanish", () => {
    // Same regression guard as the profile bio: generated prose is where the
    // assistant's Rioplatense persona leaks back into the product.
    for (const lens of LENSES) {
      for (const event of life(ranked(lens)[0], lens)?.events ?? []) {
        expect(event.text.length, event.kind).toBeGreaterThan(10);
        expect(event.text, event.kind).not.toMatch(
          /\b(vos|sos|ten[eé]s|quer[eé]s|pod[eé]s)\b/i
        );
      }
    }
  });

  it("is deterministic across calls", () => {
    for (const lens of LENSES) {
      const id = ranked(lens)[0];
      expect(life(id, lens)).toEqual(life(id, lens));
    }
  });

  it("makes the lens change the life, or the whole flow is one story", () => {
    const id = ranked("romantic")[0];
    const stories = LENSES.map((lens) =>
      JSON.stringify(life(id, lens)?.events.map((e) => e.text))
    );
    expect(new Set(stories).size).toBe(LENSES.length);
  });
});
