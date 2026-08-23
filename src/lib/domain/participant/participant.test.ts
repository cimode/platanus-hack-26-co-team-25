import { describe, expect, it } from "vitest";
import {
  ageBandOf,
  ageOn,
  type BusinessGate,
  bandToUnit,
  birthdateProblem,
  type DeclaredProfile,
  floorReason,
  isDeclaredComplete,
  type Lens,
  meetsFloor,
  mvpBusinessGate,
  mvpRomanticGate,
  type Participant,
  type RankableParticipant,
  type RomanticGate,
  type RoomMember,
  toRoomMember,
} from ".";

/**
 * The participant aggregate (issue #4, docs/domain.md §2): `Participant` is the
 * subject's own full view, `RoomMember` is the only shape other participants
 * may ever see, and the session token lives in its own table (D4) -- never on
 * the aggregate.
 *
 * AC-8 is `kind: safety`, so it RUNS, and it asserts over the real module
 * rather than a stand-in. Two of its assertions are type-level and only `tsc`
 * enforces them: a widened `RoomMember` or a `sessionToken` on `Participant`
 * fails the build even when the runtime strip still works.
 *
 * AC-3 is the §0 floor -- the rule every rankable read applies, stated once so
 * that "suppressed with a reason, never ranked" (AUDIT.md S15) has one home.
 */

/** What other participants may see of one another -- nothing else. */
const ROOM_MEMBER_KEYS = ["id", "name", "photoUrl"] as const;
type RoomMemberKey = (typeof ROOM_MEMBER_KEYS)[number];

/** Substrings that must never appear in a serialised RoomMember. */
const LEAKS = [
  "interested_in",
  "interestedIn",
  "gender",
  "single",
  "wants_kids",
  "wantsKids",
  "consent_",
  "consent",
  "ageBand",
  "sessionToken",
  "token",
];

const LENSES: Lens[] = ["romantic", "business", "friendship"];

/** Exact type equality, so `keyof RoomMember` is pinned, not just covered. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

const ALL_BANDS: DeclaredProfile = {
  moneyPosture: 2,
  rootedness: 1,
  familyGravity: 0,
  capacityHoursBand: 3,
  distanceBand: 1,
  chronotype: 2,
  tags: ["tango", "ramen"],
  acquaintances: [],
};

const NO_BANDS: DeclaredProfile = {
  moneyPosture: null,
  rootedness: null,
  familyGravity: null,
  capacityHoursBand: null,
  distanceBand: null,
  chronotype: null,
  tags: [],
  acquaintances: [],
};

const ROMANTIC_GATE: RomanticGate = {
  gender: "F",
  interestedIn: ["M"],
  single: true,
  ageBand: 2,
  wantsKids: true,
};

const BUSINESS_GATE: BusinessGate = {
  riskPosture: 1,
  exitHorizon: 2,
  redlinesOk: true,
};

function participantFixture(
  id: string,
  overrides: Partial<Participant> = {}
): Participant {
  return {
    id,
    roomId: "22222222-2222-7222-8222-222222222222",
    name: "Ana Ramírez",
    gender: "M",
    birthdate: "1994-08-22",
    photoUrl: "https://blob.example/ana.jpg",
    team: "t-7",
    track: "fintech",
    consent: { romantic: true, business: true, friendship: true },
    declared: { ...ALL_BANDS },
    dataConsentAt: null,
    declaredAt: new Date("2026-08-22T18:00:00.000Z"),
    quizCompletedAt: new Date("2026-08-22T18:30:00.000Z"),
    createdAt: new Date("2026-08-22T17:45:00.000Z"),
    ...overrides,
  };
}

describe("floor", () => {
  it("AC-3 · floorReason names what keeps a participant below the floor under each lens", () => {
    // A: photo, consent to all three lenses, all six bands, both gates.
    const a: RankableParticipant = {
      participant: participantFixture("a"),
      romanticGate: ROMANTIC_GATE,
      businessGate: BUSINESS_GATE,
      acquaintances: [],
    };
    // B: photo and consent, but quit during the declared round.
    const b: RankableParticipant = {
      participant: participantFixture("b", {
        declared: { ...NO_BANDS },
        declaredAt: null,
      }),
      romanticGate: ROMANTIC_GATE,
      businessGate: BUSINESS_GATE,
      acquaintances: [],
    };
    // C: bands and consent, no photo.
    const c: RankableParticipant = {
      participant: participantFixture("c", { photoUrl: null }),
      romanticGate: ROMANTIC_GATE,
      businessGate: BUSINESS_GATE,
      acquaintances: [],
    };
    // D: photo and bands, consent to romantic and business only, no gate rows
    // at all -- which under D18 is every participant.
    const d: RankableParticipant = {
      participant: participantFixture("d", {
        consent: { romantic: true, business: true, friendship: false },
      }),
      acquaintances: [],
    };
    // E: registered before D18, so it has neither gender nor birthdate.
    const e: RankableParticipant = {
      participant: participantFixture("e", { gender: null, birthdate: null }),
      acquaintances: [],
    };

    for (const lens of LENSES) {
      expect(floorReason(a, lens), lens).toBeNull();
      expect(meetsFloor(a, lens), lens).toBe(true);

      expect(floorReason(b, lens), lens).toBe("declared-incomplete");
      expect(meetsFloor(b, lens), lens).toBe(false);

      expect(floorReason(c, lens), lens).toBe("no-photo");
      expect(meetsFloor(c, lens), lens).toBe(false);
    }
    // D18 dropped the gate-row clause: D passes the two lenses it consented to
    // with no gate row anywhere, and fails friendship on consent alone.
    expect(floorReason(d, "friendship")).toBe("no-consent");
    expect(floorReason(d, "romantic")).toBeNull();
    expect(floorReason(d, "business")).toBeNull();

    // E is a pre-D18 row: no identity, so no lens can rank it.
    for (const lens of LENSES) {
      expect(floorReason(e, lens), lens).toBe("no-identity");
      expect(meetsFloor(e, lens), lens).toBe(false);
    }

    // D6: the band is what was tapped; band / 3 is what the engine consumes.
    expect(bandToUnit(0)).toBe(0);
    expect(bandToUnit(1)).toBeCloseTo(1 / 3, 12);
    expect(bandToUnit(3)).toBe(1);

    // A quiz abandoner ranks; a declared-round abandoner does not (§0), so
    // "complete" has to mean all six bands and nothing less.
    expect(isDeclaredComplete(ALL_BANDS)).toBe(true);
    const bandKeys = [
      "moneyPosture",
      "rootedness",
      "familyGravity",
      "capacityHoursBand",
      "distanceBand",
      "chronotype",
    ] as const;
    for (const key of bandKeys) {
      const oneMissing: DeclaredProfile = { ...ALL_BANDS, [key]: null };
      expect(isDeclaredComplete(oneMissing), key).toBe(false);
    }
  });
});

describe("RoomMember", () => {
  // Runs (kind: safety). A room view renders faces and names; every other
  // column a participant holds -- consent, gates, declared bands, the session
  // token -- stays on the server (docs/domain.md §5, PILLARS.md A8).
  it("AC-8 · RoomMember is exactly id, name and photoUrl, and Participant never carries the session token", () => {
    const participant = participantFixture(
      "11111111-1111-7111-8111-111111111111"
    );
    const rankable: RankableParticipant = {
      participant,
      romanticGate: ROMANTIC_GATE,
      businessGate: BUSINESS_GATE,
      acquaintances: ["33333333-3333-7333-8333-333333333333"],
    };

    const member = toRoomMember(rankable.participant);
    expect(Object.keys(member).sort()).toEqual([...ROOM_MEMBER_KEYS].sort());
    expect(member).toEqual({
      id: participant.id,
      name: participant.name,
      photoUrl: participant.photoUrl,
    });

    const json = JSON.stringify(member);
    for (const leak of LEAKS) {
      expect(json).not.toContain(leak);
    }

    // D4: the credential is not a field of the aggregate. Removing the
    // directive is a type error, so no select, relation or serialiser of
    // Participant can carry it.
    // @ts-expect-error sessionToken is not a property of Participant.
    const credential: unknown = participant.sessionToken;
    expect(credential).toBeUndefined();

    // Type-level: keyof RoomMember is exactly the three keys. Adding a field
    // to the type -- even one toRoomMember() never populates -- turns this
    // false and fails tsc independently of the runtime strip.
    const exact: Equals<keyof RoomMember, RoomMemberKey> = true;
    expect(exact).toBe(true);

    // The literal still carries `consent` at runtime; it is the TYPE that
    // refuses it. Widening RoomMember leaves the directive unused -> tsc error.
    const widened: RoomMember = {
      id: participant.id,
      name: participant.name,
      photoUrl: participant.photoUrl,
      // @ts-expect-error RoomMember carries no consent (docs/domain.md §2).
      consent: participant.consent,
    };
    expect(Object.keys(widened)).toHaveLength(ROOM_MEMBER_KEYS.length + 1);
  });
});

/** AC-3's clock, passed in rather than read: the bands are edges of a year. */
const TODAY = new Date("2026-08-22T12:00:00.000Z");

/** A birthdate that makes someone exactly `age` on TODAY. */
function bornAgo(age: number): string {
  return `${2026 - age}-08-22`;
}

describe("ageBandOf", () => {
  it("AC-3 · ages 18, 24, 25, 31, 32, 39, 40 and 77 map to bands 0, 0, 1, 1, 2, 2, 3, 3", () => {
    const expected: Array<[number, 0 | 1 | 2 | 3]> = [
      [18, 0],
      [24, 0],
      [25, 1],
      [31, 1],
      [32, 2],
      [39, 2],
      [40, 3],
      [77, 3],
    ];
    for (const [age, band] of expected) {
      expect(ageOn(bornAgo(age), TODAY), `age ${age}`).toBe(age);
      expect(ageBandOf(bornAgo(age), TODAY), `age ${age}`).toBe(band);
    }

    // The day before the birthday is still the previous age -- the whole reason
    // `today` is a parameter.
    expect(ageOn("2008-08-23", TODAY)).toBe(17);
    expect(ageOn("2008-08-22", TODAY)).toBe(18);
  });

  it("AC-2 · a birthdate outside 18..100, or not a date at all, is refused", () => {
    expect(birthdateProblem(bornAgo(27), TODAY)).toBeNull();
    expect(birthdateProblem(bornAgo(18), TODAY)).toBeNull();
    expect(birthdateProblem(bornAgo(100), TODAY)).toBeNull();
    expect(birthdateProblem(bornAgo(15), TODAY)).toBe("too-young");
    expect(birthdateProblem(bornAgo(17), TODAY)).toBe("too-young");
    expect(birthdateProblem(bornAgo(101), TODAY)).toBe("too-old");
    expect(birthdateProblem("2026-02-30", TODAY)).toBe("malformed");
    expect(birthdateProblem("ayer", TODAY)).toBe("malformed");
    expect(birthdateProblem("", TODAY)).toBe("malformed");
  });
});

describe("MVP gate defaults", () => {
  // kind: edge. D18: no gate row is ever written, so the engine's gate inputs
  // are derived from the identity the one registration screen asks for.
  it("AC-7 · a D18 participant passes every lens floor and derives both gates", () => {
    const participant = participantFixture("f", {
      gender: "M",
      birthdate: bornAgo(27),
    });
    const rankable: RankableParticipant = { participant, acquaintances: [] };

    for (const lens of LENSES) {
      expect(meetsFloor(rankable, lens), lens).toBe(true);
    }

    const romantic = mvpRomanticGate(
      { gender: "M", birthdate: participant.birthdate as string },
      TODAY
    );
    expect(romantic.gender).toBe("M");
    expect([...romantic.interestedIn].sort()).toEqual(["F", "M", "NB"]);
    expect(romantic.single).toBe(true);
    expect(romantic.wantsKids).toBe(true);
    expect(romantic.ageBand).toBe(
      ageBandOf(participant.birthdate as string, TODAY)
    );

    expect(mvpBusinessGate()).toEqual({
      riskPosture: 1,
      exitHorizon: 1,
      redlinesOk: true,
    });
  });
});
