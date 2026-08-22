import {
  type RomanticGate,
  type SessionToken,
  validateRomanticGate,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";

/**
 * Step 5 of intake (issue #8): the romantic gate.
 *
 * The consent check lives HERE and not in the screen. Asking is a disclosure
 * event (PILLARS.md A8) and "gates only for consented lenses" is a use-case
 * invariant (docs/domain.md §5, D5), so a hand-crafted POST to the action gets
 * the same refusal a participant who never saw the screen would.
 */

/**
 * `no-session` -- the cookie matches no participant.
 * `consent` -- `consent_romantic` is false; nothing is written.
 * `invalid` -- an out-of-range band, or an empty `interestedIn`.
 */
export type SubmitRomanticGateReason = "no-session" | "consent" | "invalid";

export type SubmitRomanticGateResult =
  | { ok: true }
  | { ok: false; reason: SubmitRomanticGateReason };

export interface SubmitRomanticGateInput {
  sessionToken: SessionToken;
  gate: RomanticGate;
}

export interface SubmitRomanticGateDeps {
  participants: ParticipantRepository;
}

export async function submitRomanticGate(
  input: SubmitRomanticGateInput,
  deps: SubmitRomanticGateDeps
): Promise<SubmitRomanticGateResult> {
  const me = await deps.participants.bySessionToken(input.sessionToken);
  if (!me) return { ok: false, reason: "no-session" };

  // Consent is checked BEFORE the shape: a perfectly formed gate from someone
  // who never opted in is exactly the request this refusal exists for, and
  // reporting "invalid" instead would tell a prober which field to fix.
  if (!me.consent.romantic) return { ok: false, reason: "consent" };

  try {
    validateRomanticGate(input.gate);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  await deps.participants.upsertRomanticGate(me.id, input.gate);
  return { ok: true };
}
