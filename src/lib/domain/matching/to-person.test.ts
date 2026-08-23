import { describe, expect, it } from "vitest";
import type {
  Participant,
  RankableParticipant,
  RomanticGate,
} from "../participant";
import { toPerson } from "./to-person";

/**
 * `toPerson(rankable, latents, cohort)` (issue #10, docs/domain.md §6): the
 * seam between a `RankableParticipant` row that has already passed the §0
 * floor and the engine's `Person` in ./engine.ts. Money posture, rootedness
 * and family gravity become `band / 3`; the capacity band, distance band,
 * chronotype and tags are copied as-is; `team` / `track` null ⇒ undefined; the
 * cohort is passed in (30-minute windows computed by the use case); gate rows
 * map to `gates.*` and an absent row ⇒ undefined; absent latent rows ⇒ an
 * ABSENT KEY so the engine imputes the prior (AUDIT.md S15); `hasPhoto` is
 * `photo_url is not null`. It throws on any null declared field -- the second
 * guard behind the repository's floor, never the first (docs/domain.md §5).
 *
 * The parameter is the landed NESTED `RankableParticipant`
 * (src/lib/domain/participant/floor.ts): `{ participant, romanticGate?,
 * businessGate?, acquaintances }`. The flat stand-in the first draft of these
 * tests declared is gone.
 *
 * The throw on the abandoned row is asserted by the `kind: safety` criterion
 * AC-4 in src/lib/use-cases/prepare-results.test.ts.
 */

const P_ID = "11111111-1111-7111-8111-111111111111";
const KNOWS_A = "22222222-2222-7222-8222-222222222222";
const KNOWS_B = "44444444-4444-7444-8444-444444444444";
const ROOM_ID = "33333333-3333-7333-8333-333333333333";

/**
 * The AC-2 romantic gate row. `wantsKids` is desire only -- timing was cut
 * (AUDIT.md S11) -- and the shape is the engine's own `RomanticGate`.
 */
const ROMANTIC: RomanticGate = {
  gender: "F",
  interestedIn: ["M", "NB"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};

/**
 * The AC-2 participant. Tags are closed-vocabulary slugs
 * (domain/participant/tags.ts): "escalada" is the criterion's climbing.
 */
const PARTICIPANT: Participant = {
  id: P_ID,
  roomId: ROOM_ID,
  name: "Ana",
  gender: "F",
  birthdate: "1996-05-04",
  photoUrl: "https://blob.example/ana.jpg",
  team: "alpha",
  track: null,
  consent: { romantic: true, business: false, friendship: true },
  declared: {
    moneyPosture: 3,
    rootedness: 0,
    familyGravity: 2,
    capacityHoursBand: 1,
    distanceBand: 3,
    chronotype: 2,
    tags: ["escalada", "ramen"],
    acquaintances: [KNOWS_A, KNOWS_B],
  },
  declaredAt: new Date("2026-08-22T19:00:00.000Z"),
  quizCompletedAt: new Date("2026-08-22T19:30:00.000Z"),
  createdAt: new Date("2026-08-22T18:00:00.000Z"),
};

const RANKABLE: RankableParticipant = {
  participant: PARTICIPANT,
  romanticGate: ROMANTIC,
  // No business gate row on purpose: D5's "no row ⇔ never asked".
  acquaintances: [KNOWS_A, KNOWS_B],
};

describe("toPerson", () => {
  it("AC-2 · maps a floor-passing participant to a Person: bands / 3, capacity as-is, gate rows to gates.*, absent rows to undefined, consent and hasPhoto copied", () => {
    const person = toPerson(
      RANKABLE,
      { regulation: { mean: 0.7, se: 0.1 } },
      1
    );

    expect(person.id).toBe(P_ID);
    expect(person.name).toBe("Ana");

    // band / 3 for the three 0..1 Life Shape floats (D6) ...
    expect(person.declared.lifeShape.moneyPosture).toBe(1);
    expect(person.declared.lifeShape.rootedness).toBe(0);
    expect(person.declared.lifeShape.familyGravity).toBeCloseTo(2 / 3, 12);
    // ... and NOT for the three the engine reads as 0..3 bands. A divided
    // capacity band would move every capacity gap and chronotype overlap.
    expect(person.declared.lifeShape.capacityHoursBand).toBe(1);
    expect(person.declared.distanceBand).toBe(3);
    expect(person.declared.chronotype).toBe(2);

    expect(person.declared.tags).toEqual(["escalada", "ramen"]);

    expect(person.structural.team).toBe("alpha");
    // null ⇒ undefined, so the engine's structural term sees "no track" rather
    // than a track named null.
    expect(person.structural.track).toBeUndefined();
    expect(person.structural.cohort).toBe(1);
    expect(person.structural.acquaintances).toEqual([KNOWS_A, KNOWS_B]);

    // A stored romantic row still wins where one exists (pre-D18 rows); the
    // business gate has none and is derived from `MVP_GATES` (D18, §6).
    expect(person.gates.romantic).toEqual(ROMANTIC);
    expect(person.gates.business).toEqual({
      riskPosture: 1,
      exitHorizon: 1,
      redlinesOk: true,
    });

    // The absent pillars are ABSENT KEYS, never a fabricated 0.5: the engine
    // imputes PRIOR_MEAN / PRIOR_SE from a missing key and reads row PRESENCE
    // as "measured" (AUDIT.md S15).
    expect(person.latents.regulation).toEqual({ mean: 0.7, se: 0.1 });
    expect(Object.keys(person.latents)).toEqual(["regulation"]);
    expect("politeness" in person.latents).toBe(false);
    expect("reliability" in person.latents).toBe(false);
    expect("agency" in person.latents).toBe(false);

    expect(person.consent).toEqual({
      romantic: true,
      business: false,
      friendship: true,
    });
    expect(person.hasPhoto).toBe(true);
  });
});
