import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads `.env` (it bundles dotenv), NOT `.env.local`. Next.js reads
 * both but prefers `.env.local`. Keeping DATABASE_URL in `.env` is what stops
 * those two from disagreeing about which database you are pointed at. `.env*`
 * is gitignored; see `.env.example`.
 *
 * `dbCredentials` is present only when DATABASE_URL is (docs/domain.md D8).
 * `db:generate` and `db:check` are pure file operations -- they diff the schema
 * against `drizzle/meta/` and never open a connection -- so a config that
 * throws without a database would block a migration on a laptop, in a fresh CI
 * checkout, and in the `next build` job that has no branch of its own.
 * `db:migrate` still fails loudly, because drizzle-kit needs the credentials it
 * was not given.
 */
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  // The barrel re-exports every table, so drizzle-kit follows one import
  // instead of globbing a directory -- no double registration as the domain
  // grows into schema/participants.ts, schema/quiz.ts, and so on.
  schema: "./src/lib/adapters/db/schema/index.ts",
  out: "./drizzle",
  ...(url ? { dbCredentials: { url } } : {}),
  // Ask before running a destructive statement, and print the SQL first.
  strict: true,
  verbose: true,
});
