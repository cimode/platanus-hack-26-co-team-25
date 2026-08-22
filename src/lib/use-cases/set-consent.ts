import type { Consent, SessionToken } from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";

/**
 * Step 3 of intake (issue #6): the three per-lens switches.
 *
 * All three arrive as explicit booleans, and "none of them" is a valid answer
 * -- a participant who consents to nothing is stored and never ranked
 * (docs/form-response.md §3). Nothing here defaults a switch ON: the default
 * lives in the column (`default false`) and in the screen, and this use case
 * only ever writes what was submitted.
 *
 * The token is resolved here rather than trusted from the caller's shape,
 * because a Server Action is a public HTTP endpoint.
 */

export type SetConsentReason = "no-session";

export class SetConsentError extends Error {
  readonly reason: SetConsentReason;

  constructor(reason: SetConsentReason) {
    super(reason);
    this.name = "SetConsentError";
    this.reason = reason;
  }
}

export interface SetConsentInput {
  sessionToken: SessionToken;
  consent: Consent;
}

export interface SetConsentDeps {
  participants: ParticipantRepository;
}

export async function setConsent(
  input: SetConsentInput,
  deps: SetConsentDeps
): Promise<Consent> {
  const participant = await deps.participants.bySessionToken(
    input.sessionToken
  );
  if (!participant) throw new SetConsentError("no-session");

  const consent: Consent = {
    romantic: input.consent.romantic === true,
    business: input.consent.business === true,
    friendship: input.consent.friendship === true,
  };

  await deps.participants.setConsent(participant.id, consent);
  return consent;
}
