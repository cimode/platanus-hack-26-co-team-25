/**
 * generation-claims.ts — the lock that keeps two invocations from authoring
 * the same batch.
 *
 * Generation runs in `after()`, fired by whichever request noticed a batch
 * was missing: registration, the quiz page while a participant waits, the form
 * opening for a cold room. Several of those can fire within seconds for one
 * participant, and each would otherwise spend 40–70 s of model time writing
 * five blocks the other is also writing. A claim is taken before the model is
 * touched and released after the rows land; a lost claim means "someone else
 * is on it", and the caller simply stops.
 *
 * Implemented in `src/lib/adapters/db/` as one INSERT ... ON CONFLICT
 * statement, because neon-http has no interactive transaction to lock with.
 * A claim older than the takeover window with no release is a crashed
 * invocation and may be taken; a released claim may be taken again, because a
 * finished batch can legitimately need regenerating.
 */

export type ClaimOutcome = "ready" | "failed";

export interface GenerationClaims {
  /** True when this caller now owns `scope` and must `release` it. */
  claim(scope: string): Promise<boolean>;
  release(scope: string, outcome: ClaimOutcome): Promise<void>;
}

/** The scope of one participant's batch: `participant:<id>:batch:<n>`. */
export function batchScope(participantId: string, batch: number): string {
  return `participant:${participantId}:batch:${batch}`;
}

/** One of a room's pool slots: `pool:<roomId>:<k>`. */
export function poolScope(roomId: string, slot: number): string {
  return `pool:${roomId}:${slot}`;
}
