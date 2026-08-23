/**
 * quiz-pool.ts — whole forms authored before anyone needs them, per room.
 *
 * A block is one tap, so a participant outruns any batch written after they
 * registered: block 6 arrives ~45 s in, a batch takes 40–70 s. The pool is the
 * answer: showing the QR or opening the form tops it up in the background, and
 * registration adopts one form — all fifteen positions — as the new
 * participant's own, zero wait anywhere. A set written before 2026-08-23 holds
 * only batch 1; adoption copes, and the chain writes the rest.
 *
 * Owned by the core, implemented in `src/lib/adapters/db/`. Returns domain
 * `Block`s, never rows (`data-access` §1).
 */

import type { Block } from "../domain/quiz/index.ts";

export interface QuizPoolRepository {
  /** Store one authored form (positions 1..15) for `roomId`. */
  add(roomId: string, blocks: Block[]): Promise<void>;

  /**
   * Atomically take the oldest unclaimed set of the room for `participantId`,
   * or null when the pool is empty. Two registrations racing for the last set
   * cannot both receive it.
   */
  adopt(roomId: string, participantId: string): Promise<Block[] | null>;

  unclaimedCount(roomId: string): Promise<number>;

  /**
   * The newest scenarios written anywhere in the room — participants'
   * generated blocks and pool sets alike, claimed or not — newest first, at
   * most `limit`. Fed to the author as the avoid list, so two people sitting
   * next to each other do not read each other's joke.
   */
  recentScenarios(roomId: string, limit: number): Promise<string[]>;
}
