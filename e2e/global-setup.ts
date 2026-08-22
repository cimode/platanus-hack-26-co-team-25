import { randomBytes } from "node:crypto";
import { createDb } from "../src/lib/adapters/db/client";
import { createRoomRepository } from "../src/lib/adapters/db/room-repository";

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
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout (CI, or a clone that never ran `neon link`).
}

const MISSING_URL =
  "DATABASE_URL is not set, so e2e/global-setup.ts cannot create the " +
  "`e2e-<run>` room the intake specs register into. Point .env at a migrated " +
  "Neon branch (`neon checkout dev-domain`).";

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(MISSING_URL);

  const run = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const slug = `e2e-${run}`;

  const rooms = createRoomRepository(createDb(url));
  await rooms.create({
    slug,
    name: `E2E run ${run}`,
    instrumentVersion: "v1",
  });

  process.env.E2E_RUN_ID = run;
  process.env.E2E_ROOM_SLUG = slug;
}
