import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSENT,
  type Participant,
  type SessionToken,
} from "@/lib/domain/participant";
import { type ViewerDeps, viewerIdFrom } from "./viewer";

/**
 * `viewerIdFrom` — the two-cookie identity rule.
 *
 * The bug this pins: `/intake` wrote `dipia_session` and only `/quiz` read it,
 * while the demo chooser wrote `dipia_impersonating` and only `/room`,
 * `/rank`, `/profile` and `/simulate` read it. Nothing bridged them, so
 * somebody who registered and finished the quiz was nobody on every screen
 * after it — `/room` bounced them to `/`, the internal console that lists the
 * whole roster by name.
 *
 * The rule under test is the ORDER, and the order is not symmetric:
 * impersonation is the demo control and has to beat a real session, or an
 * operator whose browser registered earlier can never stand in for anyone.
 *
 * `resolveViewerId` — the same rule over `cookies()` — is not unit-tested:
 * it is three lines of cookie reading around this function, and asserting it
 * would need a request scope Vitest has no business faking. `e2e/` exercises
 * it against a real server.
 */

const SESSION_TOKEN = "5b7d0e2f-0000-4000-8000-000000000001" as SessionToken;
const SESSION_OWNER = "p-registered";
const IMPERSONATED = "p-impersonated";

function participant(id: string): Participant {
  return {
    id,
    roomId: "room-1",
    name: "Alguien",
    gender: null,
    birthdate: null,
    avatar: null,
    photoUrl: null,
    team: null,
    track: null,
    consent: DEFAULT_CONSENT,
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
    dataConsentAt: null,
    declaredAt: null,
    quizCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

/** Counts its own calls, so "never asked the database" is assertable. */
function participantsFake(): ViewerDeps["participants"] & { calls: number } {
  const fake = {
    calls: 0,
    bySessionToken(token: SessionToken): Promise<Participant | null> {
      fake.calls++;
      return Promise.resolve(
        token === SESSION_TOKEN ? participant(SESSION_OWNER) : null
      );
    },
  };
  return fake;
}

describe("viewerIdFrom", () => {
  it("resolves the participant behind dipia_session when nobody is impersonated", async () => {
    const participants = participantsFake();

    const id = await viewerIdFrom(
      { impersonating: undefined, sessionToken: SESSION_TOKEN },
      { participants }
    );

    expect(id).toBe(SESSION_OWNER);
  });

  it("lets impersonation win over a live session, without reading the session at all", async () => {
    const participants = participantsFake();

    const id = await viewerIdFrom(
      { impersonating: IMPERSONATED, sessionToken: SESSION_TOKEN },
      { participants }
    );

    // The demo control overrides the real identity — that is the whole point
    // of it. And the repository is never touched: the answer was already in
    // hand, and `serverDeps().participants` is a getter that opens a
    // connection when it is read.
    expect(id).toBe(IMPERSONATED);
    expect(participants.calls).toBe(0);
  });

  it("is null when neither cookie is set", async () => {
    const participants = participantsFake();

    const id = await viewerIdFrom(
      { impersonating: undefined, sessionToken: null },
      { participants }
    );

    expect(id).toBeNull();
    expect(participants.calls).toBe(0);
  });

  it("is null for a session token nobody holds, rather than throwing", async () => {
    const participants = participantsFake();

    const id = await viewerIdFrom(
      {
        impersonating: undefined,
        sessionToken: "5b7d0e2f-0000-4000-8000-00000000dead" as SessionToken,
      },
      { participants }
    );

    // A stale or tampered cookie is a stranger, not a 500: every screen then
    // takes its own no-identity path instead of the error boundary.
    expect(id).toBeNull();
    expect(participants.calls).toBe(1);
  });

  it("treats an empty impersonation cookie as unset and falls through to the session", async () => {
    const participants = participantsFake();

    const id = await viewerIdFrom(
      { impersonating: "", sessionToken: SESSION_TOKEN },
      { participants }
    );

    expect(id).toBe(SESSION_OWNER);
  });
});
