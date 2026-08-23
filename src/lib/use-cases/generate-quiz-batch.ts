/**
 * generate-quiz-batch.ts — author five blocks for one participant, live.
 *
 * Runs in the background behind the screens (`ensure-quiz-batch.ts` is the
 * orchestration): batch 1 is adopted from the room's pool at registration or
 * written while the person reads the opening screen, batch 2 while they answer
 * batch 1, batch 3 while they answer batch 2 — roughly 100 seconds of runway
 * each, against 40–70 seconds of work.
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
 * There is NO fallback. The committed instrument used to cover any position
 * the model could not write, and a room full of fallbacks meant everyone read
 * the same fifteen blocks while the logs said nothing. Now the pipeline either
 * returns five blocks written for this person or throws `QuizAuthoringError`
 * naming the positions it could not fill, and the participant sees a wait
 * screen that tries again rather than a block a hundred people share.
 *
 * Five stages, each narrowing what is still missing:
 *   1. author the batch — up to three attempts if the model itself fails
 *   2. validate every candidate: length rules, structure, and whether it
 *      retells a scenario the participant (or the room) has already read
 *   3. judge the survivors for tone — plain, predictable, un-anchored or
 *      repeated blocks are rejected exactly like structurally broken ones
 *   4. repair only the positions that failed, once, quoting the complaints
 *   5. one last author call for whatever is still missing
 *
 * Stage 3 is the only stage whose failure costs nothing: a dead or confused
 * judge is treated as "no objection", because a structurally valid block with
 * a dull scenario is still this person's own.
 */

import {
  type Assignment,
  assignmentsForBatch,
  replanSetting,
} from "../domain/quiz/assignments.ts";
import {
  type AuthoredBlock,
  type AuthoredBlocks,
  authoredBlockProblem,
  authoredBlocksSchema,
  authorPrompt,
  judgePrompt,
  verdictsSchema,
} from "../domain/quiz/authoring.ts";
import { type Block, validateBlock } from "../domain/quiz/instrument.ts";
import { repeatedBy } from "../domain/quiz/similarity.ts";
import type { LlmPort } from "../ports/llm";

export interface GenerateQuizBatchInput {
  participantId: string;
  /** 1, 2 or 3. */
  batch: number;
  /**
   * Scenarios already written for this participant — and lately for the room.
   * Passed into the prompt, the judge and the similarity check, so batch 3
   * cannot reuse batch 1's joke and two neighbours do not read the same one.
   */
  previousScenarios?: string[];
  /**
   * Domains already stored for this participant in other batches. A batch 1
   * adopted from the pool was planned for another seed, so this batch's plan
   * steps around the settings and themes it used.
   */
  storedDomains?: string[];
  language?: string;
}

export interface GenerateQuizBatchResult {
  blocks: Block[];
  /** Positions that needed a repair or final pass before they validated. */
  repairedAt: number[];
}

/** A bad argument, never a model failure. */
export class QuizGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizGenerationError";
  }
}

/**
 * The model could not produce a valid block for every position, after every
 * stage. The caller releases its claim as failed and the next request tries
 * again; the positions are named so the logs say which ones kept failing.
 */
export class QuizAuthoringError extends Error {
  readonly positions: number[];
  constructor(
    participantId: string,
    batch: number,
    positions: number[],
    detail: string,
    cause?: unknown
  ) {
    super(
      `participant ${participantId}, batch ${batch}: no valid block for ` +
        `position${positions.length === 1 ? "" : "s"} ${positions.join(", ")}` +
        (detail ? ` (${detail})` : "")
    );
    this.name = "QuizAuthoringError";
    this.positions = positions;
    this.cause = cause;
  }
}

/** How many times the first author call is retried when the model itself fails. */
const AUTHOR_ATTEMPTS = 3;

/**
 * Assemble a domain `Block` from what the model wrote plus what we planned.
 *
 * `batch` and `focusPillar` come from the assignment, never from the response:
 * the model echoes `position` back so a mis-ordered batch is detectable, but it
 * is not trusted with the fields the metric depends on.
 */
function toBlock(authored: AuthoredBlock, plan: Assignment): Block {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask the judge which of these blocks reads as dull, predictable, random or
 * repeated.
 *
 * Returns one entry per *rejected* position, holding the judge's problems as it
 * wrote them — the repair prompt quotes them verbatim, so paraphrasing here
 * would throw away the only concrete instruction the second attempt gets.
 *
 * Never throws. See the note at the top of the file.
 */
async function judgeTone(
  blocks: Block[],
  previousScenarios: readonly string[],
  deps: { llm: LlmPort },
  note: string
): Promise<Map<number, string[]>> {
  const rejected = new Map<number, string[]>();
  if (blocks.length === 0) return rejected;

  try {
    const judged = await deps.llm.generate({
      id: "quiz.judge",
      prompt: judgePrompt(blocks, previousScenarios),
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
  } catch (error) {
    // No objection recorded: the block stands on its structure alone.
    console.warn(`[quiz] judge failed for ${note}: ${errorMessage(error)}`);
  }

  return rejected;
}

/** The complaint `candidatesIn` writes for a retold premise; `replanRepeats` keys on it. */
const REPEATS = "repeats the premise of";

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

  const plan = assignmentsForBatch(participantId, batch, input.storedDomains);
  const planAt = new Map(plan.map((a) => [a.position, a]));
  const note = `participant ${participantId}, batch ${batch}`;

  const accepted = new Map<number, Block>();
  const repairedAt: number[] = [];
  const problems = new Map<number, string>();

  // Read from `planAt`, not `plan`: a position re-planned into a fresh
  // setting (below) must be asked for in that setting.
  const missing = () =>
    [...planAt.values()].filter((a) => !accepted.has(a.position));
  const acceptedScenarios = () => [...accepted.values()].map((b) => b.scenario);

  /** One author call for `targets`; null when the model itself failed. */
  async function author(
    id: string,
    targets: Assignment[],
    withNotes: boolean
  ): Promise<AuthoredBlocks | null> {
    try {
      return await deps.llm.generate({
        id,
        prompt: authorPrompt({
          assignments: targets,
          language,
          avoid: previousScenarios,
          siblings: acceptedScenarios(),
          notes: withNotes
            ? targets.map(
                (a) =>
                  `position ${a.position} was rejected: ${problems.get(a.position)}`
              )
            : [],
        }),
        // Shape only: a length rule broken in one block is that block's
        // problem (repaired below), not a reason to reject the whole call.
        schema: authoredBlocksSchema,
        note,
      });
    } catch (error) {
      console.warn(`[quiz] ${id} failed for ${note}: ${errorMessage(error)}`);
      return null;
    }
  }

  /**
   * Every block of an answer that is in the plan, still missing, within the
   * length rules, structurally sound and not a retelling of anything the
   * participant has read — including the blocks accepted before it in this
   * same pass.
   */
  function candidatesIn(authored: AuthoredBlocks): Map<number, Block> {
    const candidates = new Map<number, Block>();
    for (const raw of authored.blocks) {
      const assignment = planAt.get(raw.position);
      // A position outside this batch means the model lost the plan; drop it
      // rather than letting it overwrite a block from another batch.
      if (!assignment || accepted.has(raw.position)) continue;

      const block = toBlock(raw, assignment);
      const seen = [
        ...previousScenarios,
        ...acceptedScenarios(),
        ...[...candidates.values()].map((b) => b.scenario),
      ];
      const repeated = repeatedBy(block.scenario, seen);
      // Length rules first — they are worded for the repair prompt — then the
      // structural contract every returned block must honour, then novelty.
      const problem =
        authoredBlockProblem(raw) ??
        problemWith(block) ??
        (repeated === null
          ? null
          : `position ${raw.position}: ${REPEATS}: "${repeated}"`);
      if (problem) {
        problems.set(raw.position, problem);
        continue;
      }
      candidates.set(raw.position, block);
    }
    return candidates;
  }

  /**
   * A position the model retold — its complaint is a repeat — gets a fresh
   * setting before it is asked for again. The note still quotes the premise
   * it repeated; the table row now names another domain and twist, so the
   * model has somewhere new to go instead of the same joke worded harder.
   */
  function replanRepeats(attempt: number): void {
    for (const assignment of missing()) {
      const problem = problems.get(assignment.position);
      if (!problem?.includes(REPEATS)) continue;
      const taken = [
        ...(input.storedDomains ?? []),
        ...[...planAt.values()].map((a) => a.domain),
        ...[...accepted.values()].map((b) => b.domain),
      ];
      const fresh = replanSetting(participantId, assignment, taken, attempt);
      planAt.set(assignment.position, fresh);
      problems.set(
        assignment.position,
        `${problem} — write it in a new setting: ${fresh.domain}`
      );
    }
  }

  function accept(candidates: Map<number, Block>, repaired: boolean): void {
    for (const [position, block] of candidates) {
      accepted.set(position, block);
      if (repaired) repairedAt.push(position);
    }
  }

  // --- stage 1: author the batch, retrying only a failed model ------------
  let authored: AuthoredBlocks | null = null;
  let lastFailure: unknown;
  for (let attempt = 1; attempt <= AUTHOR_ATTEMPTS && !authored; attempt++) {
    authored = await author(`quiz.author.batch-${batch}`, plan, false);
    if (!authored) lastFailure = `author attempt ${attempt} failed`;
  }
  if (!authored) {
    throw new QuizAuthoringError(
      participantId,
      batch,
      plan.map((a) => a.position),
      `the model failed ${AUTHOR_ATTEMPTS} times`,
      lastFailure
    );
  }

  // --- stages 2 and 3: validate, then judge what validated -----------------
  const candidates = candidatesIn(authored);
  const rejected = await judgeTone(
    [...candidates.values()],
    previousScenarios,
    deps,
    note
  );
  for (const [position, stated] of rejected) {
    if (!candidates.delete(position)) continue;
    problems.set(position, stated.join("; "));
  }
  accept(candidates, false);

  // --- stage 4: repair only what failed, quoting the complaints ------------
  if (missing().length > 0) {
    replanRepeats(1);
    const repaired = await author(
      `quiz.author.batch-${batch}.repair`,
      missing(),
      true
    );
    if (repaired) accept(candidatesIn(repaired), true);
  }

  // --- stage 5: one last call for whatever is still missing ----------------
  if (missing().length > 0) {
    replanRepeats(2);
    const final = await author(
      `quiz.author.batch-${batch}.final`,
      missing(),
      true
    );
    if (final) accept(candidatesIn(final), true);
  }

  const unfilled = missing();
  if (unfilled.length > 0) {
    throw new QuizAuthoringError(
      participantId,
      batch,
      unfilled.map((a) => a.position),
      unfilled
        .map(
          (a) => problems.get(a.position) ?? `position ${a.position}: no answer`
        )
        .join("; ")
    );
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

  repairedAt.sort((a, b) => a - b);
  return { blocks, repairedAt };
}
