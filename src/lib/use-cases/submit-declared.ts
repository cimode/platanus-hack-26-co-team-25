import {
  DECLARED_BAND_KEYS,
  type DeclaredBand,
  type DeclaredProfile,
  isDeclaredComplete,
  MAX_DECLARED_BAND,
  type SessionToken,
  validateTags,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";

/**
 * Step 4 of intake (issue #8): the declared round, saved one screen at a time.
 *
 * The round is four screens and each Continue persists what that screen asked
 * for, so a participant who closes the tab keeps the taps they made. That is
 * why the input is a PATCH rather than a whole profile: the use case reads the
 * saved profile through `bySessionToken`, merges the screen onto it and calls
 * `saveDeclared` once. `declared_at` is the repository's business
 * (docs/domain.md §0, §3) -- it is set only when all six bands are present --
 * and `complete` here reports the same fact to the screen so it knows whether
 * the next stop is another declared screen or the gates.
 *
 * `acquaintances` is always `[]`: the picker is cut from this issue
 * (docs/domain.md §3), and passing the saved list back would be a write nobody
 * asked for.
 *
 * The token is resolved here rather than trusted from the caller's shape,
 * because a Server Action is a public HTTP endpoint.
 */

/** One screen's worth of the declared round; every field is optional. */
export type DeclaredPatch = Partial<Omit<DeclaredProfile, "acquaintances">>;

/**
 * `no-session` -- the cookie matches no participant.
 * `invalid` -- a band outside 0..3 (D6).
 * `tags` -- a slug outside `TAGS`, or more than 12 of them.
 */
export type SubmitDeclaredReason = "no-session" | "invalid" | "tags";

export type SubmitDeclaredResult =
  | { ok: true; complete: boolean }
  | { ok: false; reason: SubmitDeclaredReason };

export interface SubmitDeclaredInput {
  sessionToken: SessionToken;
  patch: DeclaredPatch;
}

export interface SubmitDeclaredDeps {
  participants: ParticipantRepository;
}

/** `0..3`, integer -- the band that was tapped, never a float (D6). */
function isBand(value: number): value is DeclaredBand {
  return Number.isInteger(value) && value >= 0 && value <= MAX_DECLARED_BAND;
}

/**
 * The saved profile with the screen's answers written over it.
 *
 * A key the screen never asked for is absent from the patch, and an absent key
 * may not blank a band an earlier screen already stored -- so `undefined` is
 * skipped rather than spread (`{ ...saved, ...patch }` would overwrite with
 * `undefined` for a key the caller set explicitly to nothing).
 */
function merge(saved: DeclaredProfile, patch: DeclaredPatch): DeclaredProfile {
  const merged: DeclaredProfile = { ...saved, acquaintances: [] };
  for (const key of DECLARED_BAND_KEYS) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value;
  }
  if (patch.tags !== undefined) merged.tags = [...patch.tags];
  return merged;
}

export async function submitDeclared(
  input: SubmitDeclaredInput,
  deps: SubmitDeclaredDeps
): Promise<SubmitDeclaredResult> {
  const me = await deps.participants.bySessionToken(input.sessionToken);
  if (!me) return { ok: false, reason: "no-session" };

  const merged = merge(me.declared, input.patch);

  for (const key of DECLARED_BAND_KEYS) {
    const band = merged[key];
    if (band !== null && !isBand(band)) return { ok: false, reason: "invalid" };
  }

  try {
    validateTags(merged.tags);
  } catch {
    return { ok: false, reason: "tags" };
  }

  await deps.participants.saveDeclared(me.id, merged);
  return { ok: true, complete: isDeclaredComplete(merged) };
}
