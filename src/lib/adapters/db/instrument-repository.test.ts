import { describe, it } from "vitest";

/**
 * neon-http InstrumentRepository and the instruments seed (issue #13,
 * docs/domain.md D2, D15, §3, §8): `pnpm run db:seed` mirrors INSTRUMENT into
 * the `instruments` table keyed by version -- insert when absent, no-op when
 * present with the same hash, refuse when present with a different hash.
 * Integration tests, guarded by ./test-db.ts; AC-2 writes the mismatching row
 * itself and deletes it on teardown. They never touch
 * `platanus-hack-26-bogota`.
 */

describe("createInstrumentRepository", () => {
  // TODO: un-skip when src/lib/adapters/db/instrument-repository.ts exists.
  // Blocked on: the instruments table (schema/instruments.ts and the
  // 0001_instruments migration), createInstrumentRepository, the seed in
  // scripts/seed.ts, ./test-db.ts from #4 and the 0000_intake migration
  // applied to the branch DATABASE_URL points at.
  it.skip("AC-1 · db:seed writes one instruments row for INSTRUMENT.version with instrumentHash() and 15 blocks, and a second run exits 0 leaving seeded_at unchanged", () => {});

  // TODO: un-skip when the seed refuses on a hash mismatch.
  // Blocked on: the instruments table, the hash guard in scripts/seed.ts,
  // createInstrumentRepository and ./test-db.ts from #4.
  it.skip("AC-2 · db:seed exits non-zero naming both hashes and the version when the stored hash differs, and the row is unchanged", () => {});

  // TODO: un-skip when the 0001_instruments migration exists.
  // Blocked on: the four new quiz_responses columns (schema/responses.ts), the
  // instruments table and ./test-db.ts from #4.
  it.skip("AC-6 · quiz_responses has scenario, most_text and least_text and neither pillar nor keyed", () => {});
});
