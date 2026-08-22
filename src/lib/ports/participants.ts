import type { Participant } from "../domain/participants/participant";

/**
 * The seam between the app and wherever the roster actually lives.
 *
 * Today that is a hardcoded module (`adapters/participants/roster.ts`): the
 * intake flow does not exist yet, so there is no `participants` table to read.
 * When it lands, a Drizzle-backed implementation replaces the adapter and
 * nothing above this line changes.
 */
export interface ParticipantsPort {
  list(): Promise<readonly Participant[]>;
}
