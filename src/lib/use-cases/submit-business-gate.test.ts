import { describe, expect, it } from "vitest";
import type {
  BusinessGate,
  DeclaredProfile,
  Participant,
  ParticipantId,
  SessionToken,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import { submitBusinessGate } from "./submit-business-gate";

/**
 * `submitBusinessGate` use case (issue #8): resolves the participant by session
 * token, refuses when `consent_business` is false, refuses a band outside its
 * range (risk posture and exit horizon are 0..2, docs/domain.md §3) and
 * otherwise calls `upsertBusinessGate` with the participant's id.
 *
 * The test uses an inline in-memory ParticipantRepository -- no adapter
 * import, so the biome.json hexagon rule holds.
 */

const KNOWN_TOKEN = "tok-beto" as SessionToken;
const PARTICIPANT_ID: ParticipantId = "p-beto";

/** 3 is a valid declared band and an invalid business one -- 0..2 here. */
const OUT_OF_RANGE = 3 as BusinessGate["riskPosture"];

const DECLARED_COMPLETE: DeclaredProfile = {
  moneyPosture: 2,
  rootedness: 1,
  familyGravity: 0,
  capacityHoursBand: 3,
  distanceBand: 1,
  chronotype: 2,
  tags: [],
  acquaintances: [],
};

function unused(method: string): never {
  throw new Error(`${method} is not part of the submitBusinessGate contract`);
}

/** One consented participant; every upsert is recorded. */
function inMemoryParticipants(): {
  participants: ParticipantRepository;
  upserts: Array<{ id: ParticipantId; gate: BusinessGate }>;
} {
  const upserts: Array<{ id: ParticipantId; gate: BusinessGate }> = [];

  const beto: Participant = {
    id: PARTICIPANT_ID,
    roomId: "room-1",
    name: "Beto Díaz",
    photoUrl: "https://store.test/photos/p-beto.jpg",
    team: "hookai",
    track: "AI",
    consent: { romantic: false, business: true, friendship: false },
    declared: DECLARED_COMPLETE,
    declaredAt: new Date("2026-08-22T10:05:00.000Z"),
    quizCompletedAt: null,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
  };

  const participants: ParticipantRepository = {
    create: () => unused("create"),
    bySessionToken: async (token) => (token === KNOWN_TOKEN ? beto : null),
    setPhoto: () => unused("setPhoto"),
    setConsent: () => unused("setConsent"),
    saveDeclared: () => unused("saveDeclared"),
    upsertRomanticGate: () => unused("upsertRomanticGate"),
    upsertBusinessGate: async (id, gate) => {
      upserts.push({ id, gate });
    },
    markQuizCompleted: () => unused("markQuizCompleted"),
    byRoom: () => unused("byRoom"),
    byRoomForRanking: () => unused("byRoomForRanking"),
  };

  return { participants, upserts };
}

describe("submitBusinessGate", () => {
  it("AC-9 · refuses riskPosture 3 without writing, then upserts { riskPosture: 2, exitHorizon: 1, redlinesOk: true } for the participant", async () => {
    const { participants, upserts } = inMemoryParticipants();
    const deps = { participants };

    // The action is a public endpoint, so an out-of-range band that no screen
    // can produce is still refused here (docs/domain.md D6).
    const refused = await submitBusinessGate(
      {
        sessionToken: KNOWN_TOKEN,
        gate: { riskPosture: OUT_OF_RANGE, exitHorizon: 1, redlinesOk: true },
      },
      deps
    );
    expect(refused).toEqual({ ok: false, reason: "invalid" });
    expect(upserts).toEqual([]);

    const accepted = await submitBusinessGate(
      {
        sessionToken: KNOWN_TOKEN,
        gate: { riskPosture: 2, exitHorizon: 1, redlinesOk: true },
      },
      deps
    );
    expect(accepted).toEqual({ ok: true });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBe(PARTICIPANT_ID);
    expect(upserts[0].gate).toEqual({
      riskPosture: 2,
      exitHorizon: 1,
      redlinesOk: true,
    });
  });
});
