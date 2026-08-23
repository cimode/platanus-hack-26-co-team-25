/**
 * Where a participant resumes (docs/domain.md §0 as amended by D18 and D20).
 *
 * Progress is read from the rows and never from a status column, so this is a
 * pure function of the row and every screen in the flow agrees with it by
 * calling it rather than by re-deriving the rule.
 *
 * Two steps only: registration, then the questions. The declared round is out
 * of the flow (D20) -- a registered row goes straight to `/quiz`, and the
 * declared columns it never wrote stay null without holding it anywhere.
 *
 * A row with no photo is a registration that did not finish -- the photo is
 * stored in the same action that creates the row, so a null `photo_url` means
 * the store refused and the person is looking at the registration screen again.
 */
import type { Participant } from "./participant";

export type IntakeStep = "register" | "quiz";

export function intakeStepOf(participant: Participant | null): IntakeStep {
  if (!participant) return "register";
  if (
    participant.photoUrl === null ||
    participant.gender === null ||
    participant.birthdate === null
  ) {
    return "register";
  }
  return "quiz";
}
