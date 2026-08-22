/**
 * generated-block-repository.ts — where a participant's authored blocks live.
 *
 * Owned by the core, implemented in `src/lib/adapters/db/`. Under D15 each
 * participant answers their own generated form, so these rows are the only
 * record of what a given person was actually asked — scoring reads them, and so
 * would any later audit of a result someone disputes.
 *
 * The repository returns domain `Block`s, never Drizzle rows (`data-access` §1):
 * returning the row would leak the schema into the core and make every column
 * rename a domain change.
 */

import type { Block } from "../domain/quiz/index.ts";

/**
 * How a stored block came to exist.
 *
 * `fallback` means live authoring failed at that position and the committed
 * instrument covered it. Recorded rather than hidden: a room full of fallbacks
 * means the model was struggling all evening, which is otherwise invisible.
 */
export type BlockSource = "generated" | "fallback";

export interface StoredBlock {
  block: Block;
  source: BlockSource;
}

export interface GeneratedBlockRepository {
  /** The five blocks of one batch, ordered by position. Empty if not authored yet. */
  byBatch(participantId: string, batch: number): Promise<StoredBlock[]>;

  /** Everything authored for this participant so far, ordered by position. */
  byParticipant(participantId: string): Promise<StoredBlock[]>;

  /**
   * Persist one batch. Idempotent on `(participantId, position)`, so a retried
   * generation overwrites rather than duplicating, and a crashed run resumes
   * without leaving a participant with eleven blocks.
   */
  saveBatch(participantId: string, blocks: StoredBlock[]): Promise<void>;
}
