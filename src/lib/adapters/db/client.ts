import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.ts";

/**
 * The database seam, built to the same rule as `src/lib/ports/llm.ts`:
 *
 *   > If a module under src/lib/ imports an SDK, it is not an engine module.
 *   >   -- docs/testing.md
 *
 * So engine functions take a `Db` the way they take an `LlmPort` -- as a
 * parameter, never as a module-scope import:
 *
 *   async function rankRoom(room: RoomId, deps: { db: Db; llm: LlmPort })
 *
 * That is what keeps the matching engine testable and runnable headless from a
 * CLI. `getDb()` below is the composition root for the *app* layer (route
 * handlers, server components) -- it is not for engine modules.
 */
export type Db = ReturnType<typeof createDb>;

/**
 * Build a database handle over a specific connection string.
 *
 * `neon-http` is one HTTP round trip per query with no connection pool to warm,
 * which is what we want on Vercel: `docs/ci.md` already flags function duration
 * on the Hobby plan as the live risk for the timeline route. If a transaction
 * spanning several statements is ever needed, that is the point to reach for
 * `neon-serverless` (WebSocket) for those call sites -- not to switch wholesale.
 */
export function createDb(connectionString: string) {
  return drizzle(neon(connectionString), { schema });
}

let cached: Db | undefined;

/**
 * The app-layer handle. Memoised per process so a warm Fluid Compute instance
 * reuses it across requests.
 *
 * Reads `DATABASE_URL` lazily rather than at module load: a top-level read
 * would make importing this module fail the `next build` prerender pass in CI,
 * where no database is configured.
 */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Populate .env with `neon env pull`, or " +
          "copy .env.example and paste a branch connection string."
      );
    }
    cached = createDb(url);
  }
  return cached;
}

/** Test seam: drops the memoised handle so a test can swap the URL. */
export function resetDb(): void {
  cached = undefined;
}
