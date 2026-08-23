/**
 * generate-quiz-batch.ts — author five blocks for one participant, live.
 *
 * The participant registers, and while they spend 2.5–3.5 minutes on the
 * declared round (`PILLARS.md` §8) this runs in the background and writes their
 * batch 1. Batch 2 is generated while they answer batch 1, batch 3 while they
 * answer batch 2 — roughly 100 seconds of runway each, against ~40 seconds of
 * work. Generation is designed to stay ahead of the participant, never to be
 * waited on.
 *
 * The guarantee this use case owes the rest of the system: **every block it
 * returns satisfies `validateBlock`.** That is not a quality nicety — it is what
 * makes a generated form scoreable on the same metric as anyone else's. The
 * estimator uses authored item parameters (`AUDIT.md` S8), so the likelihood of
 * a block depends on which pillar was picked and how it was keyed, never on the
 * scenario text; identical structure is therefore identical measurement. A block
 * with two reversed options or a missing pillar does not fail loudly later, it
 * silently biases that person's estimates.
 *
 * So the pipeline degrades rather than throws, in four steps:
 *   1. author five blocks
 *   2. judge the five for tone — plain, predictable or un-anchored blocks are
 *      rejected exactly like structurally broken ones
 *   3. repair only the positions that failed, once, carrying the judge's own
 *      words back to the author
 *   4. fall back to the committed `INSTRUMENT` block at that position
 *
 * Step 2 is the only step whose failure costs nothing: a dead or confused judge
 * is treated as "no objection", because a structurally valid block with a dull
 * scenario is strictly better for the participant than the fallback everybody
 * else is also seeing.
 *
 * Step 3 is why the fifteen reviewed blocks stay in the repo. They are no longer
 * what everyone answers; they are what nobody has to see an error instead of.
 */

import {
  type Assignment,
  assignmentsForBatch,
} from "../domain/quiz/assignments.ts";
import {
  type AuthoredBatch,
  authoredBatchShapeSchema,
  authoredBlockProblem,
  authorPrompt,
  judgePrompt,
  verdictsSchema,
} from "../domain/quiz/authoring.ts";
import {
  type Block,
  INSTRUMENT,
  validateBlock,
} from "../domain/quiz/instrument.ts";
import type { LlmPort } from "../ports/llm";

export interface GenerateQuizBatchInput {
  participantId: string;
  /** 1, 2 or 3. */
  batch: number;
  /**
   * Scenarios already written for this participant. Passed into the prompt so
   * batch 3 cannot reuse batch 1's joke — the failure the offline pipeline hit
   * when each batch was judged in isolation.
   */
  previousScenarios?: string[];
  language?: string;
}

export interface GenerateQuizBatchResult {
  blocks: Block[];
  /** Positions served from the committed instrument because authoring failed. */
  fellBackAt: number[];
  /** Positions that needed a repair pass before they validated. */
  repairedAt: number[];
}

/** Thrown only when nothing usable could be produced at all. */
export class QuizGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizGenerationError";
  }
}

/** The committed block at this position — the always-valid last resort. */
function fallbackBlock(position: number): Block {
  const block = INSTRUMENT.blocks[position - 1];
  if (!block) {
    throw new QuizGenerationError(
      `no fallback block at position ${position}; the instrument is not loaded`
    );
  }
  return block;
}

/**
 * Assemble a domain `Block` from what the model wrote plus what we planned.
 *
 * `batch` and `focusPillar` come from the assignment, never from the response:
 * the model echoes `position` back so a mis-ordered batch is detectable, but it
 * is not trusted with the fields the metric depends on.
 */
function toBlock(
  authored: AuthoredBatch["blocks"][number],
  plan: Assignment
): Block {
  return {
    position: plan.position,
    batch: plan.batch,
    focusPillar: plan.focusPillar,
    domain: plan.domain,
    scenario: authored.scenario.trim(),
    options: authored.options.map((o) => ({
      key: o.key,
      text: o.text.trim(),
      pillar: o.pillar,
      keyed: o.keyed,
    })),
  };
}

/** `validateBlock`'s complaint, or null when the block is sound. */
function problemWith(block: Block): string | null {
  try {
    validateBlock(block);
    return null;
  } catch (error) {
    // main's validateBlock throws a plain Error; the message is the contract.
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Ask the judge which of these blocks reads as dull, predictable or random.
 *
 * Returns one entry per *rejected* position, holding the judge's problems as it
 * wrote them — the repair prompt quotes them verbatim, so paraphrasing here
 * would throw away the only concrete instruction the second attempt gets.
 *
 * Never throws. See the note at the top of the file.
 */
async function judgeTone(
  blocks: Block[],
  deps: { llm: LlmPort },
  note: string
): Promise<Map<number, string[]>> {
  const rejected = new Map<number, string[]>();
  if (blocks.length === 0) return rejected;

  try {
    const judged = await deps.llm.generate({
      id: "quiz.judge",
      prompt: judgePrompt(blocks),
      schema: verdictsSchema,
      note,
    });

    for (const verdict of judged.verdicts) {
      if (verdict.pass) continue;
      rejected.set(
        verdict.position,
        verdict.problems.length > 0
          ? verdict.problems
          : ["rejected by the desirability judge, without a stated reason"]
      );
    }
  } catch {
    // No objection recorded: the block stands on its structure alone.
  }

  return rejected;
}

export async function generateQuizBatch(
  input: GenerateQuizBatchInput,
  deps: { llm: LlmPort }
): Promise<GenerateQuizBatchResult> {
  const { participantId, batch } = input;
  const language = input.language ?? "es";
  const previousScenarios = input.previousScenarios ?? [];

  if (![1, 2, 3].includes(batch)) {
    throw new QuizGenerationError(`batch must be 1, 2 or 3, got ${batch}`);
  }

  const plan = assignmentsForBatch(participantId, batch);
  const planAt = new Map(plan.map((a) => [a.position, a]));

  const accepted = new Map<number, Block>();
  const repairedAt: number[] = [];
  const problems = new Map<number, string>();

  // --- pass 1: author, then pass 2: repair only what failed -----------------
  for (let attempt = 0; attempt < 2; attempt++) {
    const missing = plan.filter((a) => !accepted.has(a.position));
    if (missing.length === 0) break;

    const notes =
      attempt === 0
        ? []
        : missing.map(
            (a) =>
              `position ${a.position} was rejected: ${problems.get(a.position)}`
          );

    let authored: AuthoredBatch;
    try {
      authored = await deps.llm.generate({
        id: `quiz.author.batch-${batch}${attempt > 0 ? ".repair" : ""}`,
        prompt: authorPrompt({
          assignments: plan,
          language,
          avoid: [...previousScenarios, ...notes],
        }),
        // Shape only: a length rule broken in one block is that block's
        // problem (repaired below), not a reason to reject the whole call.
        schema: authoredBatchShapeSchema,
        note: `participant ${participantId}, batch ${batch}`,
      });
    } catch {
      // A dead model is not an error the participant should ever meet; every
      // outstanding position falls back below.
      break;
    }

    const candidates = new Map<number, Block>();
    for (const raw of authored.blocks) {
      const assignment = planAt.get(raw.position);
      // A position outside this batch means the model lost the plan; drop it
      // rather than letting it overwrite a block from another batch.
      if (!assignment || accepted.has(raw.position)) continue;

      const block = toBlock(raw, assignment);
      // Length rules first — they are worded for the repair prompt — then the
      // structural contract every returned block must honour.
      const problem = authoredBlockProblem(raw) ?? problemWith(block);
      if (problem) {
        problems.set(raw.position, problem);
        continue;
      }
      candidates.set(raw.position, block);
    }

    // The judge runs on the first pass only. A repaired block it would reject
    // again has nowhere left to go but the fallback, and one flat scenario
    // written for this participant beats a block a hundred people share.
    if (attempt === 0) {
      const rejected = await judgeTone(
        [...candidates.values()],
        deps,
        `participant ${participantId}, batch ${batch}`
      );
      for (const [position, stated] of rejected) {
        if (!candidates.delete(position)) continue;
        problems.set(position, stated.join("; "));
      }
    }

    for (const [position, block] of candidates) {
      accepted.set(position, block);
      if (attempt > 0) repairedAt.push(position);
    }
  }

  // --- pass 3: the committed instrument covers whatever is still missing ----
  const fellBackAt: number[] = [];
  for (const assignment of plan) {
    if (!accepted.has(assignment.position)) {
      accepted.set(assignment.position, fallbackBlock(assignment.position));
      fellBackAt.push(assignment.position);
    }
  }

  const blocks = plan.map((a) => {
    const block = accepted.get(a.position);
    if (!block) {
      throw new QuizGenerationError(`position ${a.position} was never filled`);
    }
    return block;
  });

  // The invariant, restated at the boundary. Everything above is best-effort;
  // this is the promise.
  for (const block of blocks) {
    validateBlock(block);
  }

  return { blocks, fellBackAt, repairedAt };
}
