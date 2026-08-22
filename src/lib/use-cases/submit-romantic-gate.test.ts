import { describe, expect, it } from "vitest";
import type {
  BusinessGate,
  Consent,
  DeclaredProfile,
  Participant,
  ParticipantId,
  RomanticGate,
  SessionToken,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import { submitBusinessGate } from "./submit-business-gate";
import { submitRomanticGate } from "./submit-romantic-gate";

/**
 * `submitRomanticGate` / `submitBusinessGate` use cases (issue #8): resolve
 * the participant by session token, refuse with `reason: "consent"` when
 * `consent_<lens>` is false, with `reason: "invalid"` on an out-of-range band
 * or an empty `interested in`, and otherwise upsert the gate for the
 * participant's id.
 *
 * AC-8 is `kind: safety` and therefore NOT skipped: gates are written only for
 * consented lenses (docs/domain.md §5 and D5, PILLARS.md A8 -- asking is a
 * disclosure event), and that refusal lives in the use case so it holds for a
 * hand-crafted POST too. The test uses an inline in-memory
 * ParticipantRepository -- no adapter import, so the biome.json hexagon rule
 * holds.
 */

const KNOWN_TOKEN = "tok-ana" as SessionToken;
const UNKNOWN_TOKEN = "tok-nobody" as SessionToken;
const PARTICIPANT_ID: ParticipantId = "p-ana";

/** Fully valid in every respect except the consent that was never given. */
const VALID_ROMANTIC: RomanticGate = {
  gender: "F",
  interestedIn: ["M", "NB"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};

const VALID_BUSINESS: BusinessGate = {
  riskPosture: 1,
  exitHorizon: 2,
  redlinesOk: true,
};

const DECLARED_COMPLETE: DeclaredProfile = {
  moneyPosture: 1,
  rootedness: 1,
  familyGravity: 1,
  capacityHoursBand: 1,
  distanceBand: 1,
  chronotype: 1,
  tags: [],
  acquaintances: [],
};

function unused(method: string): never {
  throw new Error(`${method} is not part of the gate use-case contract`);
}

/**
 * One participant, addressable by session token, with the consent flags the
 * test cares about. Every gate upsert is recorded, so "neither gate table ever
 * saw a write" is checkable rather than assumed.
 */
function inMemoryParticipants(consent: Consent): {
  participants: ParticipantRepository;
  romanticUpserts: Array<{ id: ParticipantId; gate: RomanticGate }>;
  businessUpserts: Array<{ id: ParticipantId; gate: BusinessGate }>;
} {
  const romanticUpserts: Array<{ id: ParticipantId; gate: RomanticGate }> = [];
  const businessUpserts: Array<{ id: ParticipantId; gate: BusinessGate }> = [];

  const ana: Participant = {
    id: PARTICIPANT_ID,
    roomId: "room-1",
    name: "Ana Ramírez",
    photoUrl: "https://store.test/photos/p-ana.jpg",
    team: "hookai",
    track: "AI",
    consent,
    declared: DECLARED_COMPLETE,
    declaredAt: new Date("2026-08-22T10:05:00.000Z"),
    quizCompletedAt: null,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
  };

  const participants: ParticipantRepository = {
    create: () => unused("create"),
    bySessionToken: async (token) => (token === KNOWN_TOKEN ? ana : null),
    setPhoto: () => unused("setPhoto"),
    setConsent: () => unused("setConsent"),
    saveDeclared: () => unused("saveDeclared"),
    upsertRomanticGate: async (id, gate) => {
      romanticUpserts.push({ id, gate });
    },
    upsertBusinessGate: async (id, gate) => {
      businessUpserts.push({ id, gate });
    },
    markQuizCompleted: () => unused("markQuizCompleted"),
    byRoom: () => unused("byRoom"),
    byRoomForRanking: () => unused("byRoomForRanking"),
  };

  return { participants, romanticUpserts, businessUpserts };
}

describe("submitRomanticGate", () => {
  it("AC-8 · a gate is never written for a lens the participant did not consent to", async () => {
    const { participants, romanticUpserts, businessUpserts } =
      inMemoryParticipants({
        romantic: false,
        business: false,
        friendship: true,
      });
    const deps = { participants };

    // The given: the known token resolves a participant with both lens
    // consents off (docs/domain.md D4 identity); an unknown token resolves
    // nobody, so there is no id a gate could be written under.
    await expect(
      participants.bySessionToken(KNOWN_TOKEN)
    ).resolves.toMatchObject({
      id: PARTICIPANT_ID,
      consent: { romantic: false, business: false },
    });
    await expect(
      participants.bySessionToken(UNKNOWN_TOKEN)
    ).resolves.toBeNull();

    // A perfectly formed gate is still refused: what is missing is consent,
    // and the refusal is the use case's, not the screen's.
    const romantic = await submitRomanticGate(
      { sessionToken: KNOWN_TOKEN, gate: VALID_ROMANTIC },
      deps
    );
    expect(romantic).toEqual({ ok: false, reason: "consent" });

    const business = await submitBusinessGate(
      { sessionToken: KNOWN_TOKEN, gate: VALID_BUSINESS },
      deps
    );
    expect(business).toEqual({ ok: false, reason: "consent" });

    const noSession = await submitRomanticGate(
      { sessionToken: UNKNOWN_TOKEN, gate: VALID_ROMANTIC },
      deps
    );
    expect(noSession).toEqual({ ok: false, reason: "no-session" });

    // The invariant: neither gate table ever saw a write for Ana.
    expect(romanticUpserts).toEqual([]);
    expect(businessUpserts).toEqual([]);
  });
});
