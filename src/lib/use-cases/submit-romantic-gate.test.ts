import { describe, expect, it } from "vitest";

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

type Gender = "M" | "F" | "NB";
type Band = 0 | 1 | 2 | 3;

type RomanticGate = {
  gender: Gender;
  interestedIn: Gender[];
  single: boolean;
  ageBand: Band;
  wantsKids: boolean;
};

type BusinessGate = {
  riskPosture: 0 | 1 | 2;
  exitHorizon: 0 | 1 | 2;
  redlinesOk: boolean;
};

type GateParticipant = {
  id: string;
  sessionToken: string;
  consentRomantic: boolean;
  consentBusiness: boolean;
  consentFriendship: boolean;
};

/**
 * The slice of the #4 ParticipantRepository the gate use cases depend on:
 * `bySessionToken` resolves exactly one known token, and every gate upsert is
 * recorded so a test can assert none happened.
 */
function inMemoryParticipants(participant: GateParticipant) {
  const romanticUpserts: Array<{ id: string; gate: RomanticGate }> = [];
  const businessUpserts: Array<{ id: string; gate: BusinessGate }> = [];
  return {
    romanticUpserts,
    businessUpserts,
    async bySessionToken(token: string): Promise<GateParticipant | null> {
      return token === participant.sessionToken ? participant : null;
    },
    async upsertRomanticGate(id: string, gate: RomanticGate): Promise<void> {
      romanticUpserts.push({ id, gate });
    },
    async upsertBusinessGate(id: string, gate: BusinessGate): Promise<void> {
      businessUpserts.push({ id, gate });
    },
  };
}

describe("submitRomanticGate", () => {
  // Runs today (kind: safety). A participant who consented to neither lens
  // never gets a gate row, and an unknown session never reaches a repository
  // write. Today neither use case exists, so nothing can call the upserts and
  // the refusal is vacuous; when src/lib/use-cases/submit-romantic-gate.ts
  // and submit-business-gate.ts land, call submitRomanticGate with
  // { sessionToken: "tok-ana", gate: <fully valid romantic gate> } and
  // submitBusinessGate with { sessionToken: "tok-ana", gate: <fully valid
  // business gate> } against `deps: { participants }`, expect both to return
  // { ok: false, reason: "consent" }, call submitRomanticGate once more with
  // "tok-nobody" and expect { ok: false, reason: "no-session" } -- keeping the
  // two final assertions below.
  it("AC-8 · a gate is never written for a lens the participant did not consent to", async () => {
    const ana: GateParticipant = {
      id: "p-ana",
      sessionToken: "tok-ana",
      consentRomantic: false,
      consentBusiness: false,
      consentFriendship: true,
    };
    const participants = inMemoryParticipants(ana);

    // The given: the known token resolves a participant with both lens
    // consents off (docs/domain.md D4 identity); an unknown token resolves
    // nobody, so there is no id a gate could be written under.
    await expect(participants.bySessionToken("tok-ana")).resolves.toMatchObject(
      { id: "p-ana", consentRomantic: false, consentBusiness: false }
    );
    await expect(participants.bySessionToken("tok-nobody")).resolves.toBeNull();

    // The invariant: neither gate table ever saw a write for Ana.
    expect(participants.romanticUpserts).toEqual([]);
    expect(participants.businessUpserts).toEqual([]);
  });
});
