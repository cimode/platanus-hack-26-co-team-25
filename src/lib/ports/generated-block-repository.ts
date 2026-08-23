/**
 * generated-block-repository.ts — where a participant's authored blocks live.
 *
 * Owned by the core, implemented in `src/lib/adapters/db/`. Each participant
 * answers twelve of the four hundred committed bank blocks, chosen from their
 * id alone, so these rows are the record of what a given person was actually
 * asked — scoring reads them, `response-repository` denormalises the question
 * text onto the answer from them, and so would any later audit of a result
 * someone disputes.
 *
 * The repository returns domain `Block`s, never Drizzle rows (`data-access` §1):
 * returning the row would leak the schema into the core and make every column
 * rename a domain change.
 */

import type { Block } from "../domain/quiz/index.ts";

/**
 * How a stored block came to exist.
 *
 * `bank` is the only one anything writes now: the block was dealt from
 * `quiz/bank/*.json` by `formFor(participantId)`. `generated` and `fallback`
 * are read-only history — rows written while the form was authored live, kept
 * because a participant who answered one answered *that* question and the
 * answer row points back at it.
 */
export type BlockSource = "bank" | "generated" | "fallback";

export interface StoredBlock {
  block: Block;
  source: BlockSource;
}

export interface GeneratedBlockRepository {
  /** The four blocks of one batch, ordered by position. Empty if none stored. */
  byBatch(participantId: string, batch: number): Promise<StoredBlock[]>;

  /** Every block stored for this participant, ordered by position. */
  byParticipant(participantId: string): Promise<StoredBlock[]>;

  /**
   * Persist blocks. Idempotent on `(participantId, position)`, so assigning the
   * same form twice — registration, then a self-healing read — writes the same
   * twelve rows rather than duplicating them.
   */
  saveBatch(participantId: string, blocks: StoredBlock[]): Promise<void>;
}
