/**
 * quiz-progress.ts — what to show a participant next (issue #9).
 *
 * Progress is read from the rows, never stored as a status (docs/domain.md §0):
 * the first unanswered position is the frontier, `answeredCount` is the count of
 * rows, and `completed` is `participants.quiz_completed_at !== null`.
 *
 * Under D16 the block itself is *this participant's* own, obtained through
 * `ensureQuizBatch({ participantId, batch }, { llm, generatedBlocks })` — the
 * stored `generated_blocks` rows, or authored and stored inline when the entry
 * prefetch has not landed yet. The constant is never read for content.
 *
 * The room's structural version is checked first (docs/domain.md D2 / §5 /
 * §10.1(b)): `rooms.byId(participant.roomId)`, and a mismatch throws
 * `InstrumentVersionMismatchError` before a single response or generated block
 * is read and before the model is touched.
 *
 * Only `PublicBlock` leaves this module: `pillar`, `keyed`, `focusPillar`,
 * `domain` and `source` stay on the server (PILLARS.md §8 rule 1, AUDIT.md F1).
 */

import type { ParticipantId, SessionToken } from "../domain/participant";
import type { Block, BlockResponse, OptionKey } from "../domain/quiz/index.ts";
import { BLOCK_COUNT, batchOf, INSTRUMENT } from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type { GeneratedBlockRepository } from "../ports/generated-block-repository";
import type { LlmPort } from "../ports/llm";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { RoomRepository } from "../ports/room-repository";
import { ensureQuizBatch } from "./ensure-quiz-batch.ts";

/** What a card renders, and nothing more. */
export interface PublicOption {
  key: OptionKey;
  text: string;
}

/** The block as the client island may see it (docs/domain.md D16, §5). */
export interface PublicBlock {
  position: number;
  scenario: string;
  options: PublicOption[];
}

export interface QuizProgressDeps {
  participants: ParticipantRepository;
  responses: ResponseRepository;
  rooms: RoomRepository;
  llm: LlmPort;
  generatedBlocks: GeneratedBlockRepository;
}

export interface QuizProgressInput {
  sessionToken: SessionToken;
  /** `?block=N` — clamped to the first unanswered position. */
  at?: number;
}

export interface QuizProgressView {
  participantId: ParticipantId;
  /** The position on screen: the frontier, or `at` when it is behind it. */
  nextPosition: number;
  batch: number;
  answeredCount: number;
  completed: boolean;
  /** Null only when the quiz is complete — no block is fetched then. */
  block: PublicBlock | null;
  /** `shownOrderFor(participantId, nextPosition)`; null when complete. */
  shownOrder: string | null;
  /** The row already stored at `nextPosition`, so the screen renders pre-marked. */
  existing: BlockResponse | null;
}

/**
 * The room was created for a different *structural* version of the form than
 * the running code enforces (docs/domain.md D2). An operator misconfiguration,
 * never a participant state: it propagates to the error boundary.
 */
export class InstrumentVersionMismatchError extends Error {
  constructor(roomVersion: string, expectedVersion: string) {
    super(
      `room instrument version "${roomVersion}" does not match the running ` +
        `structural version "${expectedVersion}"`
    );
    this.name = "InstrumentVersionMismatchError";
  }
}

/**
 * The room a participant belongs to, or the operator-side failure that stops
 * the request before it reads anything else.
 *
 * Shared with `answer-block` so the read and the write refuse the same rooms in
 * the same order: session first (an unknown token is not an error, it is a
 * stranger), then the room, then everything that costs a query.
 */
export async function requireCurrentRoom(
  roomId: string,
  rooms: RoomRepository
): Promise<void> {
  const room = await rooms.byId(roomId);
  if (!room) {
    // The participant's `room_id` is a non-null foreign key, so this is a room
    // deleted under a live session — an operator failure, named as one.
    throw new Error(`room ${roomId} no longer exists`);
  }
  if (room.instrumentVersion !== INSTRUMENT.version) {
    throw new InstrumentVersionMismatchError(
      room.instrumentVersion,
      INSTRUMENT.version
    );
  }
}

/**
 * The frontier: the first position 1..15 with no row, or 15 when every position
 * has one (docs/domain.md §0 — progress is read from the rows).
 *
 * Fifteen rows and no completion timestamp is the re-submit state from the
 * issue's Context: block 15 is served again, pre-marked, and answering it runs
 * the completing write.
 */
export function firstUnanswered(answered: ReadonlySet<number>): number {
  for (let position = 1; position <= BLOCK_COUNT; position++) {
    if (!answered.has(position)) return position;
  }
  return BLOCK_COUNT;
}

/** Everything a card needs, and nothing a pillar could be inferred from. */
function toPublicBlock(block: Block): PublicBlock {
  return {
    position: block.position,
    scenario: block.scenario,
    options: block.options.map((option) => ({
      key: option.key,
      text: option.text,
    })),
  };
}

export async function quizProgress(
  input: QuizProgressInput,
  deps: QuizProgressDeps
): Promise<QuizProgressView | null> {
  const participant = await deps.participants.bySessionToken(
    input.sessionToken
  );
  if (!participant) return null;

  await requireCurrentRoom(participant.roomId, deps.rooms);

  const rows = await deps.responses.byParticipant(participant.id);
  const answered = new Set(rows.map((row) => row.position));
  const frontier = firstUnanswered(answered);
  const completed = participant.quizCompletedAt !== null;

  if (completed) {
    return {
      participantId: participant.id,
      nextPosition: frontier,
      batch: batchOf(frontier),
      answeredCount: rows.length,
      completed: true,
      block: null,
      shownOrder: null,
      existing: null,
    };
  }

  // `?block=N` may look backwards, never forwards: the frontier is the ceiling.
  const requested = input.at;
  const position =
    typeof requested === "number" &&
    Number.isInteger(requested) &&
    requested >= 1 &&
    requested < frontier
      ? requested
      : frontier;

  const batch = batchOf(position);
  const blocks = await ensureQuizBatch(
    { participantId: participant.id, batch },
    { llm: deps.llm, generatedBlocks: deps.generatedBlocks }
  );
  const block = blocks.find((candidate) => candidate.position === position);
  if (!block) {
    throw new Error(
      `participant ${participant.id} has no block at position ${position} in batch ${batch}`
    );
  }

  return {
    participantId: participant.id,
    nextPosition: position,
    batch,
    answeredCount: rows.length,
    completed: false,
    block: toPublicBlock(block),
    shownOrder: shownOrderFor(participant.id, position),
    existing: rows.find((row) => row.position === position) ?? null,
  };
}
