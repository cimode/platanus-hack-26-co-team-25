import { createDb } from "../src/lib/adapters/db/client";
import { createRoomRepository } from "../src/lib/adapters/db/room-repository";
import { seedRoster } from "./fixtures/roster";

/**
 * The e2e room (docs/domain.md D9).
 *
 * Every Playwright run creates its own `e2e-<run>` room and puts the slug in
 * `E2E_ROOM_SLUG`, which the workers inherit -- they are forked after this
 * runs. The real room `platanus-hack-26-bogota` is never read or written by a
 * test: it holds the responses of people standing in the room, and a test that
 * registers "Ana Ramírez" into it corrupts the demo it is meant to protect.
 *
 * Rows are left in place. CI branches are reset from `ci-base`; the local
 * `dev-domain` branch accumulates `e2e-*` rooms, which is cheaper than a
 * teardown that can delete the wrong thing.
 *
 * Playwright does not read `.env`; `next dev` does. So this file loads it the
 * same guarded way `scripts/seed.ts` and `vitest.config.mts` do -- variables
 * already in the environment win, and CI has no `.env` at all.
 *
 * The guard mirrors `src/lib/adapters/db/test-db.ts` (docs/domain.md §8).
 * Without `DATABASE_URL` no room is created and the specs that register into
 * it skip themselves on the same variable, so the rest of the suite -- the
 * safety tests that only load pages -- still runs. `DB_REQUIRED=1` turns that
 * skip into a failure: CI sets it once #5 gives every run a migrated Neon
 * branch, so a missing database there can never hide behind a green job.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout (CI, or a clone that never ran `neon link`).
}

const SKIP_NOTICE =
  "DATABASE_URL is not set, so e2e/global-setup.ts did not create the " +
  "`e2e-<run>` room and the specs that register into it (e2e/intake.spec.ts) " +
  "are skipped. Point .env at a migrated Neon branch " +
  "(`neon checkout dev-domain`) to run them, or set DB_REQUIRED=1 to make a " +
  "missing database a failure.";

const REQUIRED_NOTICE =
  "DATABASE_URL is not set, so e2e/global-setup.ts cannot create the " +
  "`e2e-<run>` room the intake specs register into -- and DB_REQUIRED is " +
  "set. CI runs those specs against a migrated Neon branch; a silent skip " +
  "there is a green build over tests that never touched a table. Point .env " +
  "at a migrated Neon branch (`neon checkout dev-domain`).";

/** The same reading as test-db.ts: set, and not an explicit "0" or "false". */
function dbRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  const required = env.DB_REQUIRED;
  return !!required && required !== "0" && required !== "false";
}

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (dbRequired()) throw new Error(REQUIRED_NOTICE);
    // A GitHub Actions annotation when it runs there, a plain line elsewhere.
    console.log(`::warning title=e2e database skipped::${SKIP_NOTICE}`);
    return;
  }

  // Both decided in playwright.config.ts, which runs first and hands the same
  // slug to the web server as HOOKAI_ROOM_SLUG.
  const run = process.env.E2E_RUN_ID as string;
  const slug = process.env.E2E_ROOM_SLUG as string;

  const rooms = createRoomRepository(createDb(url));
  await rooms.create({
    slug,
    name: `E2E run ${run}`,
    instrumentVersion: "v1",
  });

  /*
   * The cast the room screens are tested against.
   *
   * It lived in `adapters/participants/roster.ts` until `ParticipantsPort`
   * started reading the `participants` table. Without this the chooser under
   * test lists nobody, and 1a, 1b, the ranking and the profile all fail for
   * the same reason -- one none of them is about.
   */
  await seedRoster(slug);
}
