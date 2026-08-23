import { describe, expect, it } from "vitest";
import { intakeStepOf, type Participant } from ".";

/**
 * Where a participant resumes (docs/domain.md §0 as amended by D18 and D20).
 *
 * Two steps: registration, then the questions. There is no declared step in
 * between any more, so a registered row -- photo, gender, birthdate -- goes to
 * `/quiz` whatever its declared columns hold, and only a row that is missing
 * one of the three goes back to the form.
 */

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: "11111111-1111-7111-8111-111111111111",
    roomId: "22222222-2222-7222-8222-222222222222",
    name: "Ana Ramírez",
    gender: "F",
    birthdate: "1996-05-04",
    avatar: "avatar3",
    photoUrl: "https://blob.example/ana.jpg",
    team: null,
    track: null,
    consent: { romantic: true, business: true, friendship: true },
    dataConsentAt: new Date("2026-08-22T17:45:00.000Z"),
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
    quizCompletedAt: null,
    createdAt: new Date("2026-08-22T17:45:00.000Z"),
    ...overrides,
  };
}

describe("intakeStepOf", () => {
  it("sends nobody, and a row missing its photo or identity, to the registration screen", () => {
    expect(intakeStepOf(null)).toBe("register");
    expect(intakeStepOf(participant({ photoUrl: null }))).toBe("register");
    expect(intakeStepOf(participant({ gender: null }))).toBe("register");
    expect(intakeStepOf(participant({ birthdate: null }))).toBe("register");
  });

  it("sends a registered row straight to the questions, with every declared band null", () => {
    expect(intakeStepOf(participant())).toBe("quiz");
    // A quiz in progress, or finished, is still the quiz's business to route.
    expect(
      intakeStepOf(
        participant({ quizCompletedAt: new Date("2026-08-22T18:30:00.000Z") })
      )
    ).toBe("quiz");
  });
});
