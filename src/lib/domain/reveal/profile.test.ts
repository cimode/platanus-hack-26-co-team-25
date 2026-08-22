import { describe, expect, it } from "vitest";
// SINGULAR `participant/` -- the intake aggregate that owns consent, gates and
// the tag vocabulary. Not `participants/`, which is the demo roster.
import { TAGS } from "../participant/tags";
import type { PersonProfile } from "./profile";
import type { RankEntry } from "./rank";

const ENTRY: RankEntry = {
  id: "sofia",
  name: "Sofía Guzmán",
  photoUrl: "https://blob.example/sofia.jpg",
  position: 2,
  band: "high",
  bond: { term: "commonGround", label: "Gustos en común" },
  friction: { term: "distance", label: "Ritmos distintos" },
};

describe("PersonProfile", () => {
  it("reuses the rank's own band and reason vocabulary", () => {
    // This literal compiles ONLY because `standing` is built from RankBand and
    // RankReason rather than a parallel copy. A second vocabulary is how the
    // pill on /rank and the pill on /profile drift apart (AC-PROF-3).
    const profile: PersonProfile = {
      id: ENTRY.id,
      name: ENTRY.name,
      photoUrl: ENTRY.photoUrl,
      team: "equipo 03",
      tags: ["ramen", "tango"],
      standing: {
        position: ENTRY.position,
        band: ENTRY.band,
        bond: ENTRY.bond,
        friction: ENTRY.friction,
      },
    };

    expect(profile.standing.band).toBe("high");
    expect(profile.standing.bond.label).toBe("Gustos en común");
    // Slugs, from the closed picker vocabulary -- the Jaccard kernel compares
    // like with like, so free text here would score two coffee people as
    // strangers (AC-PROF-3).
    for (const tag of profile.tags) expect(TAGS).toContain(tag);
  });

  it("admits no third band, exactly like the rank row (AC-PORT-3)", () => {
    const fromAdapter = "low";
    // @ts-expect-error -- `standing.band` is RankBand: "high" | "mid". A
    // below-band person is ABSENT from the viewer's rank, so their profile is
    // a 404, not a greyed pill.
    const rejected: PersonProfile["standing"]["band"] = fromAdapter;
    expect(rejected).toBe("low");
  });

  it("admits no compatibility figure (AC-PORT-3)", () => {
    const scored = {
      id: ENTRY.id,
      name: ENTRY.name,
      photoUrl: null,
      team: null,
      tags: [],
      standing: {
        position: 1,
        band: "mid" as const,
        bond: ENTRY.bond,
        friction: null,
      },
      // @ts-expect-error -- no score, percentage or rank index crosses the
      // port. "87% match" and "3rd best" are the wording AC-PROF-3 forbids,
      // and the type is what makes them unwritable.
      matchPercent: 87,
    } satisfies PersonProfile;
    expect(scored.standing.position).toBe(1);
  });
});
