/**
 * answer-block.ts — one block answered (issue #9).
 *
 * The write path of the quiz, and the only one. It resolves the participant
 * from the session token, checks the room's structural version
 * (`InstrumentVersionMismatchError` from `quiz-progress.ts`), then loads *this
 * participant's* block at `position` through
 * `generatedBlocks.byBatch(participantId, batchOf(position))` — a write never
 * authors, so neither `continueQuizGeneration` nor `saveBatch` is called here
 * (D16/D20) —
 * and validates the submitted keys against that block before anything is
 * written.
 *
 * Every write goes through `ResponseRepository.save` (docs/domain.md §7). The
 * block-15 write that completes the set passes `{ completedAt: now }`, whose
 * adapter sets `participants.quiz_completed_at` in the same `db.batch()`;
 * `participants.markQuizCompleted` is never called from here.
 */

import type {
  ParticipantId,
  RoomId,
  SessionToken,
} from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz/index.ts";
import {
  BLOCK_COUNT,
  batchOf,
  validateResponse,
} from "../domain/quiz/index.ts";
import { shownOrderFor } from "../domain/quiz/shown-order.ts";
import type { GeneratedBlockRepository } from "../ports/generated-block-repository";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { RoomRepository } from "../ports/room-repository";
import { firstUnanswered, requireCurrentRoom } from "./quiz-progress.ts";

export interface AnswerBlockDeps {
  participants: ParticipantRepository;
  responses: ResponseRepository;
  rooms: RoomRepository;
  generatedBlocks: GeneratedBlockRepository;
}

export interface AnswerBlockInput {
  sessionToken: SessionToken;
  /** 1..15. */
  position: number;
  mostKey: OptionKey;
  /** Required unless `singlePick`; stored as null under it. */
  leastKey?: OptionKey | null;
  /** Read server-side from `HOOKAI_QUIZ_SINGLE_PICK`, never from the form. */
  singlePick?: boolean;
  now: Date;
}

export interface AnswerBlockResult {
  participantId: ParticipantId;
  /**
   * The room this write was administered in. Already loaded and version-checked
   * by `requireCurrentRoom` below, so reporting it costs nothing -- and it is
   * what the completing caller needs to schedule scoring without a second
   * round trip to rediscover who the participant is.
   */
  roomId: RoomId;
  /**
   * The first unanswered position AFTER the write, recomputed from the rows —
   * never `position + 1`. 15 when every position is answered.
   */
  nextPosition: number;
  /** True only when this write moved the frontier (the position had no row). */
  advanced: boolean;
  /** True only on the block-15 write that completed the quiz. */
  completed: boolean;
}

export async function answerBlock(
  input: AnswerBlockInput,
  deps: AnswerBlockDeps
): Promise<AnswerBlockResult> {
  const participant = await deps.participants.bySessionToken(
    input.sessionToken
  );
  if (!participant) {
    // A Server Action is a public HTTP endpoint: an unknown session token is a
    // rejected write, not an anonymous one.
    throw new Error("no participant holds that session token");
  }

  await requireCurrentRoom(participant.roomId, deps.rooms);

  const { position } = input;
  if (!Number.isInteger(position) || position < 1 || position > BLOCK_COUNT) {
    throw new Error(`position must be 1..${BLOCK_COUNT}, got ${position}`);
  }

  // *This participant's* block, never the constant, and never authored here: a
  // write for a block nobody was shown is a write with no question behind it.
  const batch = batchOf(position);
  const stored = await deps.generatedBlocks.byBatch(participant.id, batch);
  const block = stored.find((row) => row.block.position === position)?.block;
  if (!block) {
    throw new Error(
      `participant ${participant.id} has no stored block at position ${position}`
    );
  }

  const keys = new Set(block.options.map((option) => option.key));
  if (!keys.has(input.mostKey)) {
    throw new Error(
      `position ${position}: "${input.mostKey}" is not an option key of this participant's block`
    );
  }

  // The flag is the server's, so a form that simply omits "Menos yo" is a
  // rejected submission rather than a waived one (§4, PILLARS.md §8).
  const singlePick = input.singlePick === true;
  const leastKey: OptionKey | null = singlePick
    ? null
    : (input.leastKey ?? null);
  if (!singlePick && leastKey === null) {
    throw new Error(`position ${position}: leastKey ("Menos yo") is required`);
  }
  if (leastKey !== null && !keys.has(leastKey)) {
    throw new Error(
      `position ${position}: "${leastKey}" is not an option key of this participant's block`
    );
  }
  if (leastKey !== null && leastKey === input.mostKey) {
    throw new Error(
      `position ${position}: mostKey and leastKey may not both be "${input.mostKey}"`
    );
  }

  const response: BlockResponse = {
    participantId: participant.id,
    position,
    mostKey: input.mostKey,
    leastKey,
    // Recomputed, never submitted: the order the participant saw is a function
    // of who they are and which block it is (docs/domain.md D10).
    shownOrder: shownOrderFor(participant.id, position),
    answeredAt: input.now,
  };
  validateResponse(response);

  const rows = await deps.responses.byParticipant(participant.id);
  const answered = new Set(rows.map((row) => row.position));
  const advanced = !answered.has(position);

  // The completing write (docs/domain.md §7): the 15th distinct position, with
  // the timestamp still null. One `save`, one `db.batch()`, no second path.
  const completesTheSet =
    position === BLOCK_COUNT &&
    participant.quizCompletedAt === null &&
    everyOtherPositionAnswered(answered);

  if (completesTheSet) {
    await deps.responses.save(response, { completedAt: input.now });
  } else {
    await deps.responses.save(response);
  }

  answered.add(position);
  return {
    participantId: participant.id,
    roomId: participant.roomId,
    // From the rows after the write, never `position + 1`: a re-answer behind
    // the frontier leaves the frontier where it was.
    nextPosition: firstUnanswered(answered),
    advanced,
    completed: completesTheSet,
  };
}

/** Positions 1..14 all hold a row, so position 15 is the fifteenth. */
function everyOtherPositionAnswered(answered: ReadonlySet<number>): boolean {
  for (let position = 1; position < BLOCK_COUNT; position++) {
    if (!answered.has(position)) return false;
  }
  return true;
}
