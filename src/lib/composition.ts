import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import { createGeneratedBlockRepository } from "./adapters/db/generated-block-repository";
import { createParticipantRepository } from "./adapters/db/participant-repository";
import { createResponseRepository } from "./adapters/db/response-repository";
import { createRoomRepository } from "./adapters/db/room-repository";
import { createGatewayLlm } from "./adapters/llm/gateway";
import { rosterParticipants } from "./adapters/participants/roster";
import type { GeneratedBlockRepository } from "./ports/generated-block-repository";
import type { LlmPort } from "./ports/llm";
import type { ParticipantRepository } from "./ports/participant-repository";
import type { ParticipantsPort } from "./ports/participants";
import type { ResponseRepository } from "./ports/response-repository";
import type { RoomRepository } from "./ports/room-repository";

/**
 * The composition root: the ONLY module allowed to know which adapter
 * implements which port.
 *
 * Everything inside the hexagon -- `domain/`, `use-cases/`, `ports/` -- is
 * forbidden by `biome.json` from importing an adapter or an SDK. That rule is
 * what keeps the core testable, and this file is the deliberate hole in it.
 * Driving adapters (route handlers, server actions, server components) call
 * `serverDeps()` and pass the result into a use case:
 *
 *     const result = await submitIntake(input, serverDeps());
 *
 * They must not reach for `getDb()` themselves.
 *
 * Two participant-shaped dependencies coexist on purpose:
 *
 *   - `roster` -- the hard-coded demo roster behind the impersonation screen
 *     (`adapters/participants/roster.ts`). It needs no database.
 *   - `participants` -- the real `ParticipantRepository` over Postgres (#4),
 *     which the intake, quiz and ranking use cases depend on.
 *
 * Every database-backed member is a getter, so calling `serverDeps()` on a page
 * that only needs the roster never opens a connection -- and `next build` can
 * prerender such pages with no `DATABASE_URL` configured.
 */
export interface Deps {
  db: Db;
  llm: LlmPort;
  roster: ParticipantsPort;
  generatedBlocks: GeneratedBlockRepository;
  participants: ParticipantRepository;
  rooms: RoomRepository;
  responses: ResponseRepository;
}

export type ServerDeps = Pick<
  Deps,
  | "db"
  | "llm"
  | "roster"
  | "generatedBlocks"
  | "participants"
  | "rooms"
  | "responses"
>;

let cachedLlm: LlmPort | undefined;

/**
 * Memoised per process, like `getDb()`, so a warm Fluid Compute instance reuses
 * one gateway client across requests instead of rebuilding it per invocation.
 */
function getLlm(): LlmPort {
  if (!cachedLlm) cachedLlm = createGatewayLlm();
  return cachedLlm;
}

/** Test seam: drops the memoised LLM client so a test can swap the model. */
export function resetLlm(): void {
  cachedLlm = undefined;
}

/**
 * Dependencies available on the server today.
 *
 * `llm` used to be deliberately absent -- the only implementations of `LlmPort`
 * were the test doubles in `adapters/llm/fake.ts`, and handing production a fake
 * that quietly returns fixtures is worse than not compiling. It is real now that
 * `adapters/llm/gateway.ts` exists, and this is the single place that knows the
 * model is Sonnet behind AI Gateway: `generateQuizBatch` only ever sees an
 * `LlmPort`, which is why its tests pass `stubLlm()` and touch no network.
 *
 * Like the database members it is a getter, so a page that needs neither a model
 * nor a connection opens neither.
 */
export function serverDeps(): ServerDeps {
  return {
    get db() {
      return getDb();
    },
    roster: rosterParticipants,
    get llm() {
      return getLlm();
    },
    get generatedBlocks() {
      return createGeneratedBlockRepository(getDb());
    },
    get participants() {
      return createParticipantRepository(getDb());
    },
    get rooms() {
      return createRoomRepository(getDb());
    },
    get responses() {
      return createResponseRepository(getDb());
    },
  };
}
