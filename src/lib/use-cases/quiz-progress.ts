/**
 * quiz-progress.ts — what to show a participant next (issue #9).
 *
 * Progress is read from the rows, never stored as a status (docs/domain.md §0):
 * the first unanswered position is the frontier, `answeredCount` is the count of
 * rows, and `completed` is `participants.quiz_completed_at !== null`.
 *
 * The block itself is one of the twelve `formFor(participantId)` deals from the
 * committed bank — a pure function of who the participant is. The rows in
 * `generated_blocks` are the record of what they were shown, written once at
 * registration (`assignQuizForm`), and this read serves the stored row.
 *
 * There is nothing to wait for. When the row at `nextPosition` is missing — a
 * participant registered before the form was assigned, or one carrying the
 * legacy `source = 'fallback'` rows nobody should read any more — this use case
 * assigns the form itself and serves the block it just wrote. That costs one
 * INSERT and no model call, so the self-healing path renders a question rather
 * than a spinner.
 *
 * The room's structural version is checked first (docs/domain.md D2 / §5 /
 * §10.1(b)): `rooms.byId(participant.roomId)`, and a mismatch throws
 * `InstrumentVersionMismatchError` before a single response or stored block
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
import { assignQuizForm } from "./assign-quiz-form.ts";

/** What a card renders, and nothing more. */
export interface PublicOption {
  key: OptionKey;
  text: string;
}

/** The block as the client island may see it (docs/domain.md §5). */
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
  /** The room this person registered into; the screen carries it onward. */
  roomId: string;
  /** The plate this person wears, so the block can draw them. */
  avatar: Avatar | null;
  /**
   * The viewer's OWN photo, so the avatar telling the scene has their face on
   * it. Their own is the first exception D11 names to "a photo URL never
   * leaves the server": this view is resolved from a session token, so the
   * only photo it can carry is the photo of whoever is holding it.
   */
  photoUrl: string | null;
  /** The position on screen: the frontier, or `at` when it is behind it. */
  nextPosition: number;
  batch: number;
  answeredCount: number;
  completed: boolean;
  /** Null only when the quiz is complete. */
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
 * The frontier: the first position 1..12 with no row, or 12 when every position
 * has one (docs/domain.md §0 — progress is read from the rows).
 *
 * Twelve rows and no completion timestamp is the re-submit state from the
 * issue's Context: the last block is served again, pre-marked, and answering it
 * runs the completing write.
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
    photoUrl: participant.photoUrl,
    answeredCount: rows.length,
  };

  if (completed) {
    return {
      ...base,
      nextPosition: frontier,
      batch: batchOf(frontier),
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
  const existing = rows.find((row) => row.position === position) ?? null;
  const stored = await deps.generatedBlocks.byBatch(participant.id, batch);
  const row = stored.find((candidate) => candidate.block.position === position);
  // A `fallback` row is the old committed instrument, not a bank block, and
  // assigning the form replaces it — unless they already answered it, in which
  // case it is the question their answer refers to and is shown as such.
  const usable =
    row !== undefined && (row.source !== "fallback" || existing !== null);

  // Self-healing, and cheap: the form is `formFor(participant.id)` either way,
  // so the only thing missing is the row, and one INSERT supplies it.
  const block = usable
    ? row.block
    : (await assignQuizForm({ participantId: participant.id }, deps)).find(
        (candidate) => candidate.position === position
      );

  if (!block) {
    // `formFor` deals positions 1..BLOCK_COUNT and `position` is clamped to the
    // frontier, which is one of them. Reaching this means the bank and the
    // instrument disagree about how long a form is — a boot-time invariant
    // that has come apart, not a state a participant can be in.
    throw new Error(
      `no block at position ${position} in the form assigned to participant ` +
        `${participant.id}`
    );
  }

  return {
    ...base,
    nextPosition: position,
    batch,
    completed: false,
    block: toPublicBlock(block),
    shownOrder: shownOrderFor(participant.id, position),
    existing,
  };
}
