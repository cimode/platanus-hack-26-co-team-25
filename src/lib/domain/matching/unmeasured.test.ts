import { describe, expect, it } from "vitest";
import { getWeights, type Person, rankRoom, unmeasuredTerms } from "./engine";

/**
 * What D20 did to the ranking, and what putting the weight back where it can
 * be earned does about it.
 *
 * The declared round went away, so every participant registers with no life
 * shape, no distance band and no acquaintances. Those terms carry 0.47 of the
 * romantic rank vector between them; a term nobody can score on is a constant,
 * and a constant ranks nobody above anybody -- it just shrinks the range the
 * band cutoffs were frozen against until the whole room reads "mid".
 */

/** A participant as registration writes one TODAY: latents, and nothing else. */
function asRegisteredToday(
  id: string,
  latents: Record<string, number>
): Person {
  return {
    id,
    name: id,
    latents: Object.fromEntries(
      Object.entries(latents).map(([k, mean]) => [k, { mean, se: 0.12 }])
    ),
    declared: { lifeShape: {}, tags: [] },
    structural: {},
    gates: {},
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  } as Person;
}

const ROOM = [
  asRegisteredToday("ancla", {
    regulation: 0.85,
    politeness: 0.75,
    reliability: 0.9,
    agency: 0.3,
  }),
  asRegisteredToday("motor", {
    regulation: 0.35,
    politeness: 0.4,
    reliability: 0.5,
    agency: 0.9,
  }),
  asRegisteredToday("puente", {
    regulation: 0.65,
    politeness: 0.9,
    reliability: 0.6,
    agency: 0.55,
  }),
  asRegisteredToday("gemelo", {
    regulation: 0.84,
    politeness: 0.76,
    reliability: 0.88,
    agency: 0.31,
  }),
  asRegisteredToday("opuesto", {
    regulation: 0.2,
    politeness: 0.25,
    reliability: 0.3,
    agency: 0.95,
  }),
];

describe("terms the instrument no longer collects", () => {
  it("names exactly what nothing feeds, and nothing else", () => {
    expect(unmeasuredTerms(ROOM).sort()).toEqual([
      "commonGround",
      "distance",
      "lifeShape",
      "structural",
    ]);
  });

  it("stops naming a term the moment one person supplies it", () => {
    const withTags = [
      { ...ROOM[0], declared: { ...ROOM[0].declared, tags: ["cafe"] } },
      ...ROOM.slice(1),
    ];
    expect(unmeasuredTerms(withTags)).not.toContain("commonGround");
    // and the rest are still dead
    expect(unmeasuredTerms(withTags)).toContain("lifeShape");
  });

  it("says nothing about a room that answered everything", () => {
    const complete = ROOM.map((p) => ({
      ...p,
      declared: {
        ...p.declared,
        lifeShape: { moneyPosture: 0.5 },
        tags: ["cafe"],
        distanceBand: 1,
      },
      structural: { cohort: 1 },
    }));
    expect(unmeasuredTerms(complete)).toEqual([]);
  });

  it("keeps the published ratios among the terms that survive", () => {
    const base = getWeights("romantic");
    const live = getWeights("romantic", {
      unmeasured: ["lifeShape", "commonGround", "structural", "distance"],
    });
    // Same order, same relative sizes -- only the scale changed.
    expect(live.rank.lifeShape).toBe(0);
    const ratioBefore = base.rank.regulation / base.rank.politeness;
    const ratioAfter = live.rank.regulation / live.rank.politeness;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 10);
    const total = Object.values(live.rank).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("spreads a room that used to collapse into one band", () => {
    // Friendship, because it is the lens with no eligibility gate (AUDIT S7)
    // and these people carry no gates -- the point here is the weight vector,
    // not who is admitted.
    const flat = rankRoom(ROOM, "ancla", "friendship", {
      unmeasured: [], // the old behaviour: weights untouched
    });
    const spread = rankRoom(ROOM, "ancla", "friendship"); // derives it itself
    expect(spread.length).toBeGreaterThan(2);

    const range = (xs: { rank: number }[]) =>
      Math.max(...xs.map((x) => x.rank)) - Math.min(...xs.map((x) => x.rank));

    // The ordering is a property of the latents and must not change: this is
    // a rescale, not a re-ranking.
    expect(spread.map((e) => e.id)).toEqual(flat.map((e) => e.id));
    // But the spread the band cutoffs read is materially wider.
    expect(range(spread)).toBeGreaterThan(range(flat) * 1.5);
  });
});
