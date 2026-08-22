/**
 * ensure-quiz-batch.ts — read-through access to a participant's blocks, and the
 * rolling prefetch that keeps generation ahead of them.
 *
 * The shape of the whole feature is here. `ensureQuizBatch` is the only way a
 * screen gets blocks, and it never *waits* for a model unless it truly has to:
 *
 *   registration  → prefetchQuizBatch(p, 1)   in after(), ~38s, unwatched
 *   declared round (2.5–3.5 min per PILLARS.md §8) covers it
 *   serve batch 1 → ensureQuizBatch(p, 1)     already stored, one SELECT
 *                 → prefetchQuizBatch(p, 2)   in after(), while they answer
 *   serve batch 2 → stored; prefetch batch 3
 *   serve batch 3 → stored
 *
 * Each batch of five takes a participant roughly 100 seconds to answer against
 * ~38 seconds to author, so after the first hop generation is never the thing
 * anyone is waiting on. `ensureQuizBatch` generating inline is the *degraded*
 * path — correct, just slower — for the participant who registered and reached
 * block 1 faster than the model could write it.
 */

import type { Block } from "../domain/quiz/index.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import type { LlmPort } from "../ports/llm";
import { generateQuizBatch } from "./generate-quiz-batch.ts";

export interface EnsureQuizBatchDeps {
  llm: LlmPort;
  generatedBlocks: GeneratedBlockRepository;
}

const BATCH_COUNT = 3;
const BLOCKS_PER_BATCH = 5;

/**
 * The five blocks of `batch` for this participant, authoring them first if they
 * do not exist yet.
 *
 * Safe to call concurrently with a prefetch of the same batch: the repository
 * upserts on `(participantId, position)`, so the loser of a race overwrites with
 * an equally valid block rather than creating duplicates. The participant may
 * see either set; both satisfy `validateBlock`, which is the only property that
 * has to hold.
 */
export async function ensureQuizBatch(
  input: { participantId: string; batch: number; language?: string },
  deps: EnsureQuizBatchDeps
): Promise<Block[]> {
  const { participantId, batch } = input;

  const stored = await deps.generatedBlocks.byBatch(participantId, batch);
  if (stored.length === BLOCKS_PER_BATCH) {
    return stored.map((s) => s.block);
  }

  // Not authored yet (or only partly — a crashed run). Author the whole batch;
  // the upsert makes redoing the positions that did land harmless.
  const previousScenarios = await scenariosBefore(participantId, batch, deps);

  const result = await generateQuizBatch(
    { participantId, batch, previousScenarios, language: input.language },
    { llm: deps.llm }
  );

  const toStore: StoredBlock[] = result.blocks.map((block) => ({
    block,
    source: result.fellBackAt.includes(block.position)
      ? ("fallback" as const)
      : ("generated" as const),
  }));
  await deps.generatedBlocks.saveBatch(participantId, toStore);

  return result.blocks;
}

/**
 * Author a batch ahead of time, ignoring the result.
 *
 * Called from `after()`, so it must never reject: an unhandled rejection in a
 * background task is a crashed invocation, and the participant would meet it as
 * a failed page rather than as a slightly slower next batch. A failure here just
 * means `ensureQuizBatch` will do the work inline when the batch is reached.
 */
export async function prefetchQuizBatch(
  input: { participantId: string; batch: number; language?: string },
  deps: EnsureQuizBatchDeps
): Promise<void> {
  if (input.batch < 1 || input.batch > BATCH_COUNT) return;
  try {
    await ensureQuizBatch(input, deps);
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Everything already written for this participant, so the author prompt can be
 * told not to reuse it.
 *
 * This is the fix for the failure the offline pipeline actually shipped: two
 * blocks with the same joke, because each batch was written and judged without
 * sight of the others.
 */
async function scenariosBefore(
  participantId: string,
  batch: number,
  deps: EnsureQuizBatchDeps
): Promise<string[]> {
  if (batch <= 1) return [];
  const all = await deps.generatedBlocks.byParticipant(participantId);
  return all.filter((s) => s.block.batch < batch).map((s) => s.block.scenario);
}
