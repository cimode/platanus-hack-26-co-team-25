/**
 * assign-quiz-form.ts — the twelve blocks this participant will be asked.
 *
 * The form is a pure function of the participant id: `formFor(participantId)`
 * deals twelve of the four hundred committed bank blocks, three per pillar,
 * in an order that is theirs alone. No model is called here and none is
 * reachable from here — the deps carry a repository and nothing else.
 *
 * So why write rows at all, when the form could be recomputed on every read?
 * Because the rows are the *record*, not the source: `response-repository`
 * denormalises the scenario and the two option texts onto the answer from the
 * row at `(participant_id, position)` (docs/domain.md D15's surviving half),
 * and `score-participant` reads the item parameters of the blocks a person was
 * actually shown rather than of whatever the bank holds today. A bank block
 * edited after an evening would otherwise silently rewrite answered questions.
 *
 * Idempotent, and that is load-bearing: registration calls it once, and a read
 * that finds a position missing calls it again. `saveBatch` upserts on
 * `(participantId, position)`, so the second call is the same twelve rows.
 */

import type { Block } from "../domain/quiz/index.ts";
import { formFor } from "../domain/quiz/index.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";

export interface AssignQuizFormInput {
  participantId: string;
}

export interface AssignQuizFormDeps {
  generatedBlocks: GeneratedBlockRepository;
}

/**
 * The participant's twelve blocks, written and returned.
 *
 * Returned as well as written so the caller never needs a second read to show
 * the block it just assigned — a read that assigns must not also pay a round
 * trip to find out what it assigned.
 */
export async function assignQuizForm(
  input: AssignQuizFormInput,
  deps: AssignQuizFormDeps
): Promise<Block[]> {
  const blocks = formFor(input.participantId);

  const rows: StoredBlock[] = blocks.map((block) => ({
    block,
    // Not "generated": nothing was authored for this person. The value is what
    // tells a row written this evening from the live-authored rows that came
    // before it, which is the only reason the column still has three values.
    source: "bank" as const,
  }));

  // One saveBatch for all twelve, not three of four: they are decided
  // together, and a form written in three statements is a form that can be
  // half-written when the invocation is killed.
  await deps.generatedBlocks.saveBatch(input.participantId, rows);

  return blocks;
}
