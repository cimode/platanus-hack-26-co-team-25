import { describe, it } from "vitest";

/**
 * `submitBusinessGate` use case (issue #8): resolves the participant by session
 * token, refuses when `consent_business` is false, refuses a band outside its
 * range (risk posture and exit horizon are 0..2, docs/domain.md §3) and
 * otherwise calls `upsertBusinessGate` with the participant's id.
 *
 * The test uses an inline in-memory ParticipantRepository -- no adapter
 * import, so the biome.json hexagon rule holds.
 */

describe("submitBusinessGate", () => {
  // TODO: un-skip when submitBusinessGate exists.
  // Blocked on: src/lib/use-cases/submit-business-gate.ts and
  // ParticipantRepository (#4).
  it.skip("AC-9 · refuses riskPosture 3 without writing, then upserts { riskPosture: 2, exitHorizon: 1, redlinesOk: true } for the participant", () => {});
});
