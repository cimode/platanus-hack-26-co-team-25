import { describe, expect, it } from "vitest";
import { mockRankedRoom, type RankCandidate } from "@/components/rank/mock";
import { TAGS } from "@/lib/domain/participant/tags";
import type { RankedRoom } from "@/lib/domain/reveal/rank";
import { LENSES, type Lens } from "@/lib/domain/room/layout";
import { mockProfile, mockTagsFor } from "./mock";

/**
 * Screen 1d's fixture.
 *
 * The load-bearing property is that `standing` comes off the SAME `RankedRoom`
 * that screen 1c painted. Derive it a second way -- a second hash, a second
 * band rule -- and the ranking and the profile eventually disagree about the
 * same pair, which is the kind of bug nobody finds until a demo.
 *
 * Everything about suppression is asserted as INDISTINGUISHABILITY, never as
 * "returns null for reason X". If the four causes were distinguishable, the
 * 404 itself becomes an oracle for who is in the room (AC-PROF-2).
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

const room = (lens: Lens): RankedRoom =>
  mockRankedRoom(lens, VIEWER, CANDIDATES);

const profile = (id: string, lens: Lens) =>
  mockProfile(id, room(lens), CANDIDATES);

describe("mockProfile", () => {
  it("renders every person who is in the viewer's ranking", () => {
    for (const lens of LENSES) {
      const current = room(lens);
      if (current.status !== "ranked") throw new Error("not ranked");
      for (const entry of current.entries) {
        const found = profile(entry.id, lens);
        expect(found?.name, `${lens}/${entry.id}`).toBe(entry.name);
      }
    }
  });

  it("reads standing off the SAME ranking, never a second derivation", () => {
    for (const lens of LENSES) {
      const current = room(lens);
      if (current.status !== "ranked") throw new Error("not ranked");
      for (const entry of current.entries) {
        const found = profile(entry.id, lens);
        expect(found?.standing.position, `${lens}/${entry.id}`).toBe(
          entry.position
        );
        expect(found?.standing.band).toBe(entry.band);
        expect(found?.standing.bond).toEqual(entry.bond);
        expect(found?.standing.friction).toEqual(entry.friction);
      }
    }
  });

  it("suppresses an unknown id and the viewer themselves, identically", () => {
    // Same `null`, not two different falsy shapes: the caller renders one
    // `notFound()` and cannot leak which cause it was (AC-PROF-2).
    for (const lens of LENSES) {
      expect(profile("p-nobody-at-all", lens)).toBeNull();
      expect(profile(VIEWER.id, lens)).toBeNull();
      expect(profile("", lens)).toBeNull();
    }
  });

  it("refuses the viewer even when the ranking hands them back", () => {
    // The guard in `mockProfile` was MUTATION-DEAD: `mockRankedRoom` already
    // filters the viewer out, so deleting the check left every test green.
    // `sdd-verify` found that by deleting it. A defence nothing can observe
    // failing is not a defence -- so this hands in a room that DOES contain the
    // viewer, which is exactly what a real `RankingPort` might one day return.
    const current = room("romantic");
    if (current.status !== "ranked") throw new Error("not ranked");
    const withViewer: RankedRoom = {
      ...current,
      entries: [
        {
          id: VIEWER.id,
          name: VIEWER.name,
          photoUrl: null,
          position: 1,
          band: "high",
          bond: { term: "lifeShape", label: "les une: ritmo de vida" },
          friction: null,
        },
        ...current.entries,
      ],
    };

    // The viewer must be in CANDIDATES too, or the `source` lookup below the
    // guard returns null on its own and the guard is STILL unobservable. That
    // is what the first attempt at this test got wrong: it moved the shadow
    // from the ranking to the roster instead of removing it.
    const withViewerListed = [
      { id: VIEWER.id, name: VIEWER.name, photoUrl: "/sprites/z.png" },
      ...CANDIDATES,
    ];

    expect(mockProfile(VIEWER.id, withViewer, withViewerListed)).toBeNull();
  });

  it("shows exactly the intersection, never the other person's own tags", () => {
    // The fixture exposes `mockTagsFor` so this can compute the intersection
    // INDEPENDENTLY and compare results. Re-deriving the hash inside the test
    // would only prove the two copies agree, which is not the property --
    // AC-PROF-3 is that nothing the viewer does not also hold is presented as
    // common ground.
    for (const lens of LENSES) {
      const current = room(lens);
      if (current.status !== "ranked") throw new Error("not ranked");
      const mine = new Set(mockTagsFor(VIEWER.id));

      for (const entry of current.entries) {
        const theirs = mockTagsFor(entry.id);
        const shared = theirs.filter((tag) => mine.has(tag));
        const found = profile(entry.id, lens);

        expect([...(found?.tags ?? [])].sort(), `${lens}/${entry.id}`).toEqual(
          [...shared].sort()
        );
        for (const tag of found?.tags ?? []) {
          expect(TAGS, `${tag} is off-vocabulary`).toContain(tag);
        }
      }
    }
  });

  it("gives the empty-tags state a subject", () => {
    // AC-PROF-3 wants an explicit "nothing in common yet". If every pair
    // overlapped, that branch would never render and the test for it would be
    // vacuous.
    const current = room("romantic");
    if (current.status !== "ranked") throw new Error("not ranked");
    const empties = current.entries.filter(
      (entry) => (profile(entry.id, "romantic")?.tags.length ?? 1) === 0
    );
    expect(empties.length).toBeGreaterThan(0);
  });

  it("gives the photoless stage a subject too", () => {
    const current = room("romantic");
    if (current.status !== "ranked") throw new Error("not ranked");
    const photoless = current.entries.filter(
      (entry) => profile(entry.id, "romantic")?.photoUrl === null
    );
    expect(photoless.length).toBeGreaterThan(0);
  });

  it("carries nothing offspring-shaped and nothing numeric (AC-PORT-8, AC-PROF-3)", () => {
    const current = room("romantic");
    if (current.status !== "ranked") throw new Error("not ranked");
    const found = profile(current.entries[0].id, "romantic");
    const serialised = JSON.stringify(found);
    expect(serialised).not.toMatch(/beb[eé]|hijo|offspring|kid/i);
    for (const key of ["rank", "sim", "score", "contribution", "shortfall"]) {
      expect(serialised).not.toMatch(new RegExp(`"${key}"`));
    }
  });

  it("writes a bio from THEIR tags, never from the shared ones", () => {
    // A bio is a person describing themselves. Composing it from the
    // intersection would describe them as a function of whoever is looking,
    // and two viewers would read two different people.
    const a = room("romantic");
    const b = room("friendship");
    if (a.status !== "ranked" || b.status !== "ranked") throw new Error("x");
    const id = a.entries[0].id;
    expect(mockProfile(id, a, CANDIDATES)?.bio).toBe(
      mockProfile(id, b, CANDIDATES)?.bio
    );
  });

  it("keeps the bio in neutral Spanish", () => {
    // A REGRESSION GUARD with a story: the persona this assistant writes in is
    // Rioplatense, and it leaked into six UI strings on screens 1c and 1d
    // before anyone caught it. Generated prose is exactly where it would leak
    // again, so the rule is a test now rather than a note.
    const current = room("romantic");
    if (current.status !== "ranked") throw new Error("not ranked");
    for (const entry of current.entries) {
      const bio = mockProfile(entry.id, current, CANDIDATES)?.bio ?? "";
      expect(bio.length, entry.id).toBeGreaterThan(20);
      expect(bio, entry.id).not.toMatch(
        /\b(vos|sos|ten[eé]s|quer[eé]s|pod[eé]s|sab[eé]s)\b/i
      );
      // No gendered adjective: the roster carries names, not genders, and
      // "Madrugadora" on a person who declared none is a guess.
      expect(bio, entry.id).not.toMatch(/\b\w+(ador|adora|ito|ita)\b/);
      expect(bio.endsWith("."), entry.id).toBe(true);
    }
  });

  it("is deterministic across calls", () => {
    for (const lens of LENSES) {
      expect(profile("p-ana-ramirez", lens)).toEqual(
        profile("p-ana-ramirez", lens)
      );
    }
  });
});
