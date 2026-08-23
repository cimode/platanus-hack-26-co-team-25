/**
 * quiz-progress.ts — what to show a participant next (issue #9).
 *
 * Progress is read from the rows, never stored as a status (docs/domain.md §0):
 * the first unanswered position is the frontier, `answeredCount` is the count of
 * rows, and `completed` is `participants.quiz_completed_at !== null`.
 *
 * Under D16 the block itself is *this participant's* own, read from the
 * stored `generated_blocks` rows. This use case never generates: a read that
 * could wake a model is a page render that can take a minute, and the
 * generation pipeline (`ensure-quiz-batch.ts`) is claim-guarded so that the
 * screen can simply fire it in `after()` and come back. When the block at
 * `nextPosition` is not stored yet — or only stored as a `fallback` row, the
 * committed instrument that nobody should read any more — the view is
 * `pending` and carries no block; the screen shows a wait and retries.
 *
 * The room's structural version is checked first (docs/domain.md D2 / §5 /
 * §10.1(b)): `rooms.byId(participant.roomId)`, and a mismatch throws
 * `InstrumentVersionMismatchError` before a single response or generated block
 * is read.
 *
 * Only `PublicBlock` leaves this module: `pillar`, `keyed`, `focusPillar`,
 * `domain` and `source` stay on the server (PILLARS.md §8 rule 1, AUDIT.md F1).
 */

import type { ParticipantId, SessionToken } from "../domain/participant";
import type { Avatar } from "../domain/participant/avatar";
import type { Block, BlockResponse, OptionKey } from "../domain/quiz/index.ts";
import { BLOCK_COUNT, batchOf, INSTRUMENT } from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type { GeneratedBlockRepository } from "../ports/generated-block-repository";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { RoomRepository } from "../ports/room-repository";

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
  generatedBlocks: GeneratedBlockRepository;
}

export interface QuizProgressInput {
  sessionToken: SessionToken;
  /** `?block=N` — clamped to the first unanswered position. */
  at?: number;
}

export interface QuizProgressView {
  participantId: ParticipantId;
  /** The screen fires the generation chain for this room when `pending`. */
  roomId: string;
  /** The plate this person wears, so the wait and the block can draw them. */
  avatar: Avatar | null;
  /** The position on screen: the frontier, or `at` when it is behind it. */
  nextPosition: number;
  batch: number;
  answeredCount: number;
  completed: boolean;
  /**
   * True when the block at `nextPosition` has not been written for this
   * participant yet. `block` and `shownOrder` are null; nothing was generated.
   */
  pending: boolean;
  /** Null when the quiz is complete or the block is still pending. */
  block: PublicBlock | null;
  /** `shownOrderFor(participantId, nextPosition)`; null when complete or pending. */
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

  const base = {
    participantId: participant.id,
    roomId: participant.roomId,
    avatar: participant.avatar,
    answeredCount: rows.length,
  };

  if (completed) {
    return {
      ...base,
      nextPosition: frontier,
      batch: batchOf(frontier),
      completed: true,
      pending: false,
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
  const existing = rows.find((row) => row.position === position) ?? null;
  const stored = await deps.generatedBlocks.byBatch(participant.id, batch);
  const row = stored.find((candidate) => candidate.block.position === position);
  // A fallback row is the committed instrument, not this person's block, and
  // the chain will replace it — unless they already answered it, in which
  // case it is the question their answer refers to and is shown as such.
  const usable =
    row !== undefined && (row.source !== "fallback" || existing !== null);

  if (!usable) {
    return {
      ...base,
      nextPosition: position,
      batch,
      completed: false,
      pending: true,
      block: null,
      shownOrder: null,
      existing,
    };
  }

  return {
    ...base,
    nextPosition: position,
    batch,
    completed: false,
    pending: false,
    block: toPublicBlock(row.block),
    shownOrder: shownOrderFor(participant.id, position),
    existing,
  };
}
