/**
 * ensure-quiz-batch.ts — the generation pipeline's three entry points: the
 * room's pool, adoption from it, and the per-participant chain.
 *
 * The shape of the whole feature is here. Nothing a participant sees ever
 * waits on a model; every call below runs in `after()` behind a response:
 *
 *   QR / form opens   → topUpQuizPool(room)        whole forms (15 blocks), up
 *                                                   to POOL_TARGET warm per room
 *   registration      → adoptPoolSet(p, room)       the whole form, zero wait
 *                     → continueQuizGeneration(p)   only what is still missing
 *   quiz page         → continueQuizGeneration(p)   the same, on every render
 *
 * Why whole forms and not first batches: a block is one tap, five to eight
 * seconds, so a participant reaches block 6 about 45 s after starting, and a
 * batch takes 40–70 s to author. A chain that starts at registration loses
 * that race and the person meets the wait screen twice. The pool wins it by
 * doing the work before anyone needs it — while the QR is on the wall and the
 * form is being filled.
 *
 * When the pool is cold the chain writes the form itself: batch 1 first, then
 * batches 2 and 3 side by side. The later two only need batch 1's scenarios
 * and settings to steer around, so nothing is gained by serialising them, and
 * the second wait (block 11) disappears with the serialisation.
 *
 * Every function here is claim-guarded and never rejects. Claim-guarded
 * because the same work is fired from several requests — registration and
 * every render of the quiz page — and two invocations authoring the same
 * batch would spend the gateway twice for one set of rows. Never rejects
 * because an unhandled rejection inside `after()` is a crashed invocation.
 */

import { assignmentsForBatch } from "../domain/quiz/assignments.ts";
import {
  BLOCK_COUNT,
  BLOCKS_PER_BATCH,
  type Block,
} from "../domain/quiz/index.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import {
  batchScope,
  type GenerationClaims,
  poolScope,
} from "../ports/generation-claims.ts";
import type { LlmPort } from "../ports/llm";
import type { QuizPoolRepository } from "../ports/quiz-pool.ts";
import type { ResponseRepository } from "../ports/response-repository";
import { generateQuizBatch } from "./generate-quiz-batch.ts";

export interface GenerationDeps {
  llm: LlmPort;
  generatedBlocks: GeneratedBlockRepository;
  claims: GenerationClaims;
  pool: QuizPoolRepository;
  responses: ResponseRepository;
}

const BATCH_COUNT = BLOCK_COUNT / BLOCKS_PER_BATCH;

/**
 * How many unclaimed forms a room keeps warm. Registrations arrive in bursts
 * when the QR goes up; four covers a burst while the slots below refill.
 */
export const POOL_TARGET = 4;

/** How many pool forms may be authored concurrently for one room. */
export const POOL_SLOTS = 4;

/**
 * The chain's default budget. Batch 1 and then 2 ∥ 3 at 40–70 s each fit
 * inside it, and it sits under the 300 s `maxDuration` the routes run
 * `after()` with, so an invocation stops itself before the platform does.
 */
export const DEFAULT_BUDGET_MS = 240_000;

/** How many of the room's latest scenarios the author is told to avoid. */
const RECENT_SCENARIOS = 40;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(message: string, error?: unknown): void {
  console.warn(
    `[quiz] ${message}${error === undefined ? "" : `: ${errorMessage(error)}`}`
  );
}

/** Positions 1..5, 6..10 or 11..15. */
function positionsOf(batch: number): number[] {
  return Array.from(
    { length: BLOCKS_PER_BATCH },
    (_, i) => (batch - 1) * BLOCKS_PER_BATCH + i + 1
  );
}

function asGenerated(blocks: Block[]): StoredBlock[] {
  return blocks.map((block) => ({ block, source: "generated" as const }));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Release without letting a failed release mask the failure being reported. */
async function releaseQuietly(
  claims: GenerationClaims,
  scope: string,
  outcome: "ready" | "failed"
): Promise<void> {
  try {
    await claims.release(scope, outcome);
  } catch (error) {
    warn(`could not release claim ${scope} as ${outcome}`, error);
  }
}

/**
 * What batches 2 and 3 must steer around when they are written at once.
 *
 * Neither can see the other's output, so batch 3 is also planned around batch
 * 2's PLAN: `assignmentsForBatch` is pure, so the settings batch 2 will author
 * from are known before the model is asked, and the two cannot substitute
 * their way onto the same one.
 */
function laterPlan(
  seed: string,
  batches: number[],
  known: Block[],
  recent: string[]
): { avoid: string[]; domainsFor: (batch: number) => string[] } {
  const avoid = unique([...known.map((b) => b.scenario), ...recent]);
  const knownDomains = known.map((b) => b.domain);
  const plannedTwo = batches.includes(2)
    ? assignmentsForBatch(seed, 2, knownDomains).map((a) => a.domain)
    : [];
  return {
    avoid,
    domainsFor: (batch) =>
      batch === 3 ? [...knownDomains, ...plannedTwo] : knownDomains,
  };
}

/** One complete form for `seed`: batch 1, then batches 2 and 3 side by side. */
async function authorForm(
  seed: string,
  roomId: string,
  language: string | undefined,
  deps: GenerationDeps
): Promise<Block[]> {
  const recent = await deps.pool.recentScenarios(roomId, RECENT_SCENARIOS);
  const first = await generateQuizBatch(
    { participantId: seed, batch: 1, previousScenarios: recent, language },
    { llm: deps.llm }
  );

  const plan = laterPlan(seed, [2, 3], first.blocks, recent);
  const authorLater = (batch: number) =>
    generateQuizBatch(
      {
        participantId: seed,
        batch,
        previousScenarios: plan.avoid,
        storedDomains: plan.domainsFor(batch),
        language,
      },
      { llm: deps.llm }
    );

  // A batch that still has an invalid position after its own repair and final
  // passes gets one fresh attempt before the whole form is given up: losing
  // ~150 s of authoring over one nine-word option is the expensive outcome,
  // and a re-sample nearly always lands.
  const settled = await Promise.allSettled([2, 3].map(authorLater));
  const later = await Promise.all(
    settled.map((outcome, i) =>
      outcome.status === "fulfilled" ? outcome.value : authorLater(i + 2)
    )
  );
  return [...first.blocks, ...later.flatMap((result) => result.blocks)];
}

/**
 * Write every batch this participant is missing — batch 1 first, then 2 and 3
 * side by side — until done, until the budget is spent, or until another
 * invocation turns out to hold the claim.
 *
 * A batch counts as present when all five rows were authored for this person
 * (a `fallback` row is the committed instrument, not theirs, and is redone).
 * A batch with any answered position is never touched: regenerating it would
 * leave a response pointing at a question nobody was shown. The same check is
 * repeated right before a write, because a batch can be answered while its
 * replacement is being authored.
 */
export async function continueQuizGeneration(
  input: {
    participantId: string;
    roomId: string;
    budgetMs?: number;
    language?: string;
  },
  deps: GenerationDeps
): Promise<void> {
  const { participantId, roomId, language } = input;
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = Date.now();
  const who = `participant ${participantId} (room ${roomId})`;

  const answeredPositions = async (): Promise<Set<number>> =>
    new Set(
      (await deps.responses.byParticipant(participantId)).map(
        (row) => row.position
      )
    );

  try {
    const answered = await answeredPositions();
    const isAnswered = (batch: number) =>
      positionsOf(batch).some((position) => answered.has(position));

    let own = await deps.generatedBlocks.byParticipant(participantId);
    const isAuthored = (batch: number) =>
      own.filter(
        (row) => row.block.batch === batch && row.source !== "fallback"
      ).length === BLOCKS_PER_BATCH;

    const missing = Array.from({ length: BATCH_COUNT }, (_, i) => i + 1).filter(
      (batch) => !isAuthored(batch) && !isAnswered(batch)
    );
    if (missing.length === 0) return;

    const recent = await deps.pool.recentScenarios(roomId, RECENT_SCENARIOS);
    // Everything this person has been or may be shown, fallback rows included:
    // the avoid list is about what they read, not about who wrote it.
    const ownScenarios = () => own.map((row) => row.block.scenario);
    const ownBlocks = () =>
      own.filter((row) => row.source !== "fallback").map((row) => row.block);

    /** Claim, author, re-check, write, release. Never throws. */
    const write = async (
      batch: number,
      author: () => Promise<Block[]>
    ): Promise<boolean> => {
      const scope = batchScope(participantId, batch);
      if (!(await deps.claims.claim(scope))) return false;
      try {
        const blocks = await author();
        const now = await answeredPositions();
        if (positionsOf(batch).some((position) => now.has(position))) {
          warn(`batch ${batch} was answered while being authored for ${who}`);
          await releaseQuietly(deps.claims, scope, "ready");
          return false;
        }
        await deps.generatedBlocks.saveBatch(
          participantId,
          asGenerated(blocks)
        );
        await releaseQuietly(deps.claims, scope, "ready");
        return true;
      } catch (error) {
        warn(`batch ${batch} failed for ${who}`, error);
        await releaseQuietly(deps.claims, scope, "failed");
        return false;
      }
    };

    if (missing.includes(1)) {
      const written = await write(1, async () => {
        const result = await generateQuizBatch(
          {
            participantId,
            batch: 1,
            previousScenarios: unique([...ownScenarios(), ...recent]),
            storedDomains: ownBlocks()
              .filter((block) => block.batch !== 1)
              .map((block) => block.domain),
            language,
          },
          { llm: deps.llm }
        );
        return result.blocks;
      });
      // A lost claim means someone else is on batch 1 and will carry on to
      // the rest; a failed one means the next request tries again.
      if (!written) return;

      const elapsed = Date.now() - started;
      if (elapsed > budgetMs) {
        warn(
          `stopping after batch 1 for ${who}: ${elapsed} ms exceeds the ${budgetMs} ms budget`
        );
        return;
      }
      own = await deps.generatedBlocks.byParticipant(participantId);
    }

    const later = missing.filter((batch) => batch !== 1);
    if (later.length === 0) return;

    // Both batches are planned from one snapshot, then authored at once; each
    // claims, writes and releases on its own, so one lost claim costs nothing
    // to the other.
    const plan = laterPlan(participantId, later, ownBlocks(), [
      ...ownScenarios(),
      ...recent,
    ]);
    await Promise.all(
      later.map((batch) =>
        write(batch, async () => {
          const result = await generateQuizBatch(
            {
              participantId,
              batch,
              previousScenarios: plan.avoid,
              storedDomains: plan.domainsFor(batch),
              language,
            },
            { llm: deps.llm }
          );
          return result.blocks;
        })
      )
    );
  } catch (error) {
    warn(`generation chain failed for ${who}`, error);
  }
}

/**
 * Author whole forms for the room until it holds `target` unclaimed ones —
 * one per pool slot that can be claimed, all at once.
 *
 * Each form is planned for a synthetic seed so `assignmentsFor` draws fresh
 * settings and twists; the room's latest scenarios are the avoid list, so two
 * forms written the same minute still tell different stories. `target` is the
 * driving adapter's call (the e2e server passes 0): the use case only knows
 * the default.
 */
export async function topUpQuizPool(
  input: { roomId: string; language?: string; target?: number },
  deps: GenerationDeps
): Promise<void> {
  const { roomId, language } = input;
  const target = input.target ?? POOL_TARGET;
  try {
    const deficit = target - (await deps.pool.unclaimedCount(roomId));
    if (deficit <= 0) return;

    const scopes: string[] = [];
    for (let slot = 0; slot < POOL_SLOTS && scopes.length < deficit; slot++) {
      const candidate = poolScope(roomId, slot);
      if (await deps.claims.claim(candidate)) scopes.push(candidate);
    }
    if (scopes.length === 0) return;

    await Promise.all(
      scopes.map(async (scope) => {
        try {
          const blocks = await authorForm(
            `pool:${crypto.randomUUID()}`,
            roomId,
            language,
            deps
          );
          await deps.pool.add(roomId, blocks);
          await releaseQuietly(deps.claims, scope, "ready");
        } catch (error) {
          warn(`pool form failed for room ${roomId}`, error);
          await releaseQuietly(deps.claims, scope, "failed");
        }
      })
    );
  } catch (error) {
    warn(`pool top-up failed for room ${roomId}`, error);
  }
}

/**
 * Move one unclaimed pool form into the participant's own rows. True when it
 * did; false when the pool was empty or anything failed, in which case
 * `continueQuizGeneration` writes the form itself.
 */
export async function adoptPoolSet(
  input: { participantId: string; roomId: string },
  deps: GenerationDeps
): Promise<boolean> {
  const { participantId, roomId } = input;
  try {
    const blocks = await deps.pool.adopt(roomId, participantId);
    if (!blocks) return false;
    await deps.generatedBlocks.saveBatch(participantId, asGenerated(blocks));
    return true;
  } catch (error) {
    warn(
      `adoption failed for participant ${participantId} (room ${roomId})`,
      error
    );
    return false;
  }
}
