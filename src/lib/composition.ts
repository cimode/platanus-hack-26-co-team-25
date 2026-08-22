import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import { createParticipantRepository } from "./adapters/db/participant-repository";
import { createResponseRepository } from "./adapters/db/response-repository";
import { createRoomRepository } from "./adapters/db/room-repository";
import { rosterParticipants } from "./adapters/participants/roster";
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
  participants: ParticipantRepository;
  rooms: RoomRepository;
  responses: ResponseRepository;
}

export type ServerDeps = Pick<
  Deps,
  "db" | "roster" | "participants" | "rooms" | "responses"
>;

/**
 * Dependencies available on the server today.
 *
 * `llm` is deliberately absent rather than stubbed: the only implementations of
 * `LlmPort` so far are the test doubles in `adapters/llm/fake.ts`, and handing
 * production a fake that quietly returns fixtures is worse than not compiling.
 */
export function serverDeps(): ServerDeps {
  return {
    get db() {
      return getDb();
    },
    roster: rosterParticipants,
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
