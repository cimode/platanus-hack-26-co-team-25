import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import type { LlmPort } from "./ports/llm";

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
export function serverDeps(): Pick<Deps, "db"> {
  return { db: getDb() };
}
