import { randomBytes } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { createDb } from "../../src/lib/adapters/db/client";
import { createGeneratedBlockRepository } from "../../src/lib/adapters/db/generated-block-repository";
import { createParticipantRepository } from "../../src/lib/adapters/db/participant-repository";
import { createResponseRepository } from "../../src/lib/adapters/db/response-repository";
import { createRoomRepository } from "../../src/lib/adapters/db/room-repository";
import type { SessionToken } from "../../src/lib/domain/participant";
import type {
  Block,
  BlockResponse,
  OptionKey,
} from "../../src/lib/domain/quiz";
import { INSTRUMENT } from "../../src/lib/domain/quiz";
import { shownOrderFor } from "../../src/lib/domain/quiz/shown-order";
import type { StoredBlock } from "../../src/lib/ports/generated-block-repository";

/**
 * The quiz fixture (issue #9, docs/domain.md D9, D16).
 *
 * Each participant gets its OWN `e2e-<run>-q<n>` room -- never the real
 * `platanus-hack-26-bogota`, and never the shared room `e2e/global-setup.ts`
 * creates -- so "no other row exists for this room" is an assertion a test can
 * actually make while the suite runs in parallel.
 *
 * The important part is what it seeds: all fifteen `generated_blocks` rows,
 * written through `GeneratedBlockRepository.saveBatch` from the committed
 * constant as `source: "fallback"`, three batches of five. Under D16 the quiz
 * reads a participant's blocks through `ensureQuizBatch`, which authors only
 * when a batch is missing -- so a fully seeded participant means every
 * `ensureQuizBatch` and `prefetchQuizBatch` on the e2e path is one SELECT and
 * **no model is ever called in e2e**.
 *
 * Everything is created and read back through the repositories, so #4's real
 * `byId`, #13's real `save` (which resolves the answer's texts from the
 * participant's own generated block) and the branch's real
 * `GeneratedBlockRepository` are on the path of every e2e criterion.
 *
 * Playwright does not read `.env`; `next dev` does. Loaded the same guarded way
 * `e2e/global-setup.ts` does -- variables already in the environment win.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout (CI, or a clone that never ran `neon link`).
}

/**
 * The session cookie, spelled out rather than imported: the one module that
 * owns it (`src/lib/adapters/http/session.ts`) imports `next/headers`, which
 * has no meaning outside a request.
 */
const SESSION_COOKIE = "hookai_session";

const MISSING_URL =
  "DATABASE_URL is not set, so e2e/helpers/quiz-participant.ts cannot seed a " +
  "quiz participant. Point .env at a migrated Neon branch " +
  "(`neon checkout dev-domain`).";

let created = 0;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(MISSING_URL);
  return createDb(url);
}

export interface QuizParticipant {
  participantId: string;
  roomId: string;
  roomSlug: string;
  sessionToken: string;
  /** This participant's own fifteen blocks, read back from the database. */
  blocks: Block[];
  /** The stored block at `position` (1..15). */
  blockAt(position: number): Block;
  /** The text of one option of the stored block at `position`. */
  optionText(position: number, key: OptionKey): string;
  /** The four option texts of the stored block at `position`. */
  optionTexts(position: number): string[];
  /** This participant's `quiz_responses`, ascending by position. */
  responses(): Promise<BlockResponse[]>;
  /** This participant's `generated_blocks` rows. */
  storedBlocks(): Promise<StoredBlock[]>;
  /** `participants.quiz_completed_at`. */
  completedAt(): Promise<Date | null>;
  /** Every `quiz_responses` row belonging to any participant of this room. */
  responsesInRoom(): Promise<BlockResponse[]>;
}

export interface QuizParticipantOptions {
  /** When given, the participant's session cookie is set on it. */
  context?: BrowserContext;
  name?: string;
  /** Seed responses for positions 1..answered (most a, least b). */
  answered?: number;
}

/**
 * A room, a participant, its session cookie, its fifteen generated blocks and
 * optionally its first `answered` responses.
 */
export async function createQuizParticipant(
  options: QuizParticipantOptions = {}
): Promise<QuizParticipant> {
  const handle = db();
  const rooms = createRoomRepository(handle);
  const participants = createParticipantRepository(handle);
  const generatedBlocks = createGeneratedBlockRepository(handle);
  const responses = createResponseRepository(handle);

  created += 1;
  const run = process.env.E2E_RUN_ID ?? randomBytes(3).toString("hex");
  const slug = `e2e-${run}-q${created}-${randomBytes(2).toString("hex")}`;

  const room = await rooms.create({
    slug,
    name: `E2E quiz ${slug}`,
    // The STRUCTURAL version (docs/domain.md D2): every generated form shares
    // it, and both quiz use cases refuse to serve a room that does not.
    instrumentVersion: INSTRUMENT.version,
  });

  const { participant, sessionToken } = await participants.create({
    roomId: room.id,
    gender: "F",
    birthdate: "1996-05-04",
    consent: { romantic: true, business: true, friendship: true },
    name: options.name ?? "Quiz participant",
    team: "hookai",
    track: "AI",
  });

  // Three saveBatch calls of five: the participant's own form, served from the
  // committed constant so nothing here reaches a model.
  for (const batch of [1, 2, 3]) {
    const stored: StoredBlock[] = INSTRUMENT.blocks
      .filter((block) => block.batch === batch)
      .map((block) => ({ block, source: "fallback" as const }));
    await generatedBlocks.saveBatch(participant.id, stored);
  }

  for (let position = 1; position <= (options.answered ?? 0); position++) {
    await responses.save({
      participantId: participant.id,
      position,
      mostKey: "a",
      leastKey: "b",
      shownOrder: shownOrderFor(participant.id, position),
      answeredAt: new Date(),
    });
  }

  if (options.context) {
    await options.context.addCookies([
      {
        name: SESSION_COOKIE,
        value: sessionToken,
        domain: "localhost",
        path: "/",
      },
    ]);
  }

  const seeded = await generatedBlocks.byParticipant(participant.id);
  const blocks = seeded.map((row) => row.block);

  const blockAt = (position: number): Block => {
    const block = blocks.find((candidate) => candidate.position === position);
    if (!block) {
      throw new Error(
        `participant ${participant.id} has no generated block at position ${position}`
      );
    }
    return block;
  };

  return {
    participantId: participant.id,
    roomId: room.id,
    roomSlug: slug,
    sessionToken: sessionToken as string,
    blocks,
    blockAt,
    optionText(position, key) {
      const option = blockAt(position).options.find(
        (candidate) => candidate.key === key
      );
      if (!option) {
        throw new Error(`block ${position} has no option "${key}"`);
      }
      return option.text;
    },
    optionTexts(position) {
      return blockAt(position).options.map((option) => option.text);
    },
    responses() {
      return responses.byParticipant(participant.id);
    },
    storedBlocks() {
      return generatedBlocks.byParticipant(participant.id);
    },
    async completedAt() {
      const fresh = await participants.bySessionToken(
        sessionToken as SessionToken
      );
      return fresh?.quizCompletedAt ?? null;
    },
    async responsesInRoom() {
      const members = await participants.byRoom(room.id);
      const rows: BlockResponse[] = [];
      for (const member of members) {
        rows.push(...(await responses.byParticipant(member.id)));
      }
      return rows;
    },
  };
}
