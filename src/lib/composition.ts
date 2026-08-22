import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import { rosterParticipants } from "./adapters/participants/roster";
import type { LlmPort } from "./ports/llm";
import type { ParticipantsPort } from "./ports/participants";

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
 * They must not reach for `getDb()` themselves. A server component that queries
 * the database directly is the one violation that feels idiomatic in App Router
 * and silently puts logic where no test can reach it.
 */
export interface Deps {
  db: Db;
  llm: LlmPort;
  participants: ParticipantsPort;
}

/**
 * Dependencies available on the server today.
 *
 * `llm` is deliberately absent rather than stubbed: the only implementations of
 * `LlmPort` so far are the test doubles in `adapters/llm/fake.ts`, and handing
 * production a fake that quietly returns fixtures is worse than not compiling.
 * When `adapters/llm/anthropic.ts` lands, widen this to `Deps` and the use
 * cases that need a model start type-checking.
 */
export function serverDeps(): Pick<Deps, "db" | "participants"> {
  return {
    /**
     * A GETTER, not a value, and deliberately so.
     *
     * `getDb()` throws when DATABASE_URL is unset, and it is unset in plenty of
     * legitimate places: a fresh clone, the `next build` prerender pass in CI,
     * a teammate running only the UI. Building it eagerly here would mean a
     * screen that reads nothing but the roster still dies on a missing
     * database. With a getter the throw is deferred to the first use case that
     * actually touches `deps.db`. `getDb()` memoises, so this stays free.
     */
    get db() {
      return getDb();
    },
    participants: rosterParticipants,
  };
}
