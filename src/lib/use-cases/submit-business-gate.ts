import {
  type BusinessGate,
  type SessionToken,
  validateBusinessGate,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";

/**
 * Step 5 of intake (issue #8): the business gate.
 *
 * Same shape as `submit-romantic-gate.ts`: the consent refusal is a use-case
 * invariant (docs/domain.md §5, D5), not a UI convention. Risk posture and
 * exit horizon are 0..2 here, not 0..3 (docs/domain.md §3).
 */

/**
 * `no-session` -- the cookie matches no participant.
 * `consent` -- `consent_business` is false; nothing is written.
 * `invalid` -- `riskPosture` or `exitHorizon` outside 0..2.
 */
export type SubmitBusinessGateReason = "no-session" | "consent" | "invalid";

export type SubmitBusinessGateResult =
  | { ok: true }
  | { ok: false; reason: SubmitBusinessGateReason };

export interface SubmitBusinessGateInput {
  sessionToken: SessionToken;
  gate: BusinessGate;
}

export interface SubmitBusinessGateDeps {
  participants: ParticipantRepository;
}

export async function submitBusinessGate(
  input: SubmitBusinessGateInput,
  deps: SubmitBusinessGateDeps
): Promise<SubmitBusinessGateResult> {
  const me = await deps.participants.bySessionToken(input.sessionToken);
  if (!me) return { ok: false, reason: "no-session" };

  if (!me.consent.business) return { ok: false, reason: "consent" };

  try {
    validateBusinessGate(input.gate);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  await deps.participants.upsertBusinessGate(me.id, input.gate);
  return { ok: true };
}
