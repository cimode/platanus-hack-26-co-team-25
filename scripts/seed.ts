/**
 * `npm run db:seed` -- creates the demo room if absent. That is all it does
 * (docs/domain.md §8).
 *
 * The seed is deliberately not a fixture factory. `platanus-hack-26-bogota`
 * holds the responses of real people standing in the room; anything automated
 * creates its own `it-<runId>` or `e2e-<runId>` room and deletes it afterwards
 * (D9). A seed that inserted participants would be a seed someone eventually
 * runs against the branch the demo is reading from.
 *
 * Idempotent by design: run it on every deploy, on every CI branch, twice in a
 * row -- the second run is a read and a no-op.
 *
 * Runs under bare Node (`node --env-file=.env scripts/seed.ts`) -- no runner,
 * no bundler, no extra devDependency. That is why every relative import along
 * this file's import path carries an explicit `.ts` extension and the three
 * instrument JSON files carry `with { type: "json" }`: Node's ESM resolver
 * does no extension guessing and requires the import attribute, and
 * `allowImportingTsExtensions` in tsconfig.json is already on for exactly this
 * reason (src/lib/domain/matching/demo.ts runs the same way).
 */
import { createDb } from "../src/lib/adapters/db/client.ts";
import { createRoomRepository } from "../src/lib/adapters/db/room-repository.ts";
import { INSTRUMENT } from "../src/lib/domain/quiz/index.ts";

/** The room the intake falls back to when the URL carries no `?room=`. */
const DEFAULT_SLUG = "platanus-hack-26-bogota";
const DEFAULT_NAME = "Platanus Hack 26 · Bogotá";

// `npm run db:seed` passes `--env-file=.env`, which is how a developer gets
// their branch URL. This guarded second read is what lets `node
// scripts/seed.ts` work with no flag at all -- CI has DATABASE_URL in the
// environment and no `.env` file, and `--env-file` throws on a missing file.
// Variables already in the environment win, so the two never fight.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout -- CI, or a clone that never ran `neon link`.
}

async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Populate .env with `neon env pull`, or copy " +
        ".env.example and paste a branch connection string."
    );
  }

  const slug = process.env.HOOKAI_ROOM_SLUG ?? DEFAULT_SLUG;
  const rooms = createRoomRepository(createDb(url));

  const existing = await rooms.bySlug(slug);
  if (existing) {
    console.log(
      `room "${slug}" already exists (instrument ${existing.instrumentVersion}) — nothing to do`
    );
    if (existing.instrumentVersion !== INSTRUMENT.version) {
      // Not an error to fix here: an existing room keeps the instrument it
      // administered (D2). A bumped version needs a NEW room, or its responses
      // would be scored against a form nobody answered.
      console.warn(
        `warning: the instrument is now ${INSTRUMENT.version}; room "${slug}" ` +
          `administers ${existing.instrumentVersion}. Create a new room rather ` +
          "than editing this one."
      );
    }
    return;
  }

  const room = await rooms.create({
    slug,
    name: DEFAULT_NAME,
    instrumentVersion: INSTRUMENT.version,
  });
  console.log(
    `created room "${room.slug}" (${room.id}) at instrument ${room.instrumentVersion}`
  );
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
