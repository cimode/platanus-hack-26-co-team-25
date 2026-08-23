import { describe, expect, it } from "vitest";
import type {
  Lens,
  Participant,
  RankableParticipant,
  RomanticGate,
} from "../participant";
import { meetsFloor } from "../participant";
import { rankRoom, scorePair } from "./engine";
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
 * `photo_url is not null`.
 *
 * A null declared band ⇒ an ABSENT field (D20): the declared round is no
 * longer asked, so the mapper no longer throws on it, and the engine scores
 * the unmeasured term at its neutral midpoint with the weights untouched.
 *
 * The parameter is the landed NESTED `RankableParticipant`
 * (src/lib/domain/participant/floor.ts): `{ participant, romanticGate?,
 * businessGate?, acquaintances }`. The flat stand-in the first draft of these
 * tests declared is gone.
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
  avatar: null,
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
  dataConsentAt: null,
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

/**
 * D20: the declared round is out of the flow, so every band is null for
 * everyone registered since. Two such participants -- registered, quiz
 * complete, scored -- have to rank each other under every lens, and on a
 * finite score rather than on a throw, a NaN or a fabricated zero.
 */
const LENSES: Lens[] = ["romantic", "business", "friendship"];

function undeclared(id: string, name: string): RankableParticipant {
  return {
    participant: {
      ...PARTICIPANT,
      id,
      name,
      consent: { romantic: true, business: true, friendship: true },
      declared: {
        moneyPosture: null,
        rootedness: null,
        familyGravity: null,
        capacityHoursBand: null,
        distanceBand: null,
        chronotype: null,
        tags: [],
        acquaintances: [],
      },
      declaredAt: null,
      quizCompletedAt: new Date("2026-08-22T19:30:00.000Z"),
    },
    // No stored gate rows either (D18): both are derived from the identity.
    acquaintances: [],
  };
}

const MEASURED = {
  regulation: { mean: 0.62, se: 0.1 },
  politeness: { mean: 0.55, se: 0.1 },
  reliability: { mean: 0.7, se: 0.1 },
  agency: { mean: 0.4, se: 0.1 },
};

describe("toPerson without declared data (D20)", () => {
  it("maps every null band to an absent field instead of throwing", () => {
    const person = toPerson(undeclared(P_ID, "Ana"), MEASURED, 0);

    expect(person.declared.distanceBand).toBeUndefined();
    expect(person.declared.chronotype).toBeUndefined();
    expect(person.declared.lifeShape).toEqual({
      moneyPosture: undefined,
      rootedness: undefined,
      familyGravity: undefined,
      capacityHoursBand: undefined,
    });
    expect(person.declared.tags).toEqual([]);
    // The identity-derived gates are still there, so no lens suppresses them.
    expect(person.gates.romantic).toBeDefined();
    expect(person.gates.business).toBeDefined();
  });

  it("two registered, quiz-complete participants with all declared fields null rank each other with a finite score under every lens", () => {
    const ana = undeclared(P_ID, "Ana");
    const bea = undeclared(KNOWS_A, "Bea");
    // Both clear the floor on registration alone: photo, identity, consent.
    for (const lens of LENSES) {
      expect(meetsFloor(ana, lens), lens).toBe(true);
      expect(meetsFloor(bea, lens), lens).toBe(true);
    }

    const people = [
      toPerson(ana, MEASURED, 0),
      toPerson(bea, { ...MEASURED, regulation: { mean: 0.58, se: 0.1 } }, 0),
    ];

    for (const lens of LENSES) {
      const pair = scorePair(people[0], people[1], lens);
      expect(pair.eligible, lens).toBe(true);
      expect(Number.isFinite(pair.rank), lens).toBe(true);
      expect(Number.isFinite(pair.sim), lens).toBe(true);
      expect(pair.rank, lens).toBeGreaterThanOrEqual(0);
      expect(pair.rank, lens).toBeLessThanOrEqual(1);
      // Every declared term sits at its neutral midpoint: unmeasured, not
      // zero, so the ranking is carried by the latents and the structure.
      for (const driver of pair.drivers) {
        expect(Number.isFinite(driver.score), `${lens} ${driver.term}`).toBe(
          true
        );
      }
      expect(
        pair.friction === null || Number.isFinite(pair.friction.score)
      ).toBe(true);

      const ranked = rankRoom(people, P_ID, lens);
      expect(
        ranked.map((entry) => entry.id),
        lens
      ).toEqual([KNOWS_A]);
      expect(Number.isFinite(ranked[0].rank), lens).toBe(true);
    }
  });
});
