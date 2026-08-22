import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads `.env` (it bundles dotenv), NOT `.env.local`. Next.js reads
 * both but prefers `.env.local`. Keeping DATABASE_URL in `.env` is what stops
 * those two from disagreeing about which database you are pointed at -- the
 * failure mode being a `push` that lands on a different branch than the one the
 * app is querying. `.env*` is gitignored; see `.env.example`.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Populate .env with `neon env pull`, or copy " +
      ".env.example and paste a branch connection string from the Neon console."
  );
}

export default defineConfig({
  dialect: "postgresql",
  // The barrel re-exports every table, so drizzle-kit follows one import
  // instead of globbing a directory -- no double registration as the domain
  // grows into schema/participants.ts, schema/quiz.ts, and so on.
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  // Ask before running a destructive statement, and print the SQL first.
  strict: true,
  verbose: true,
});
