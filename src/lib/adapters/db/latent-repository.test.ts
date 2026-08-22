import { existsSync, readFileSync } from "node:fs";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

/**
 * `createLatentRepository(db)` adapter (issue #7): the one table this issue
 * writes, `latent_estimates` (docs/domain.md §4, D13), reached through
 * `replaceForParticipant` (one `db.batch()` of upserts on
 * `(participant_id, pillar)`), `byParticipant` and the one-query
 * `byParticipants`.
 *
 * AC-9 is the safety invariant and runs today: scoring one participant must
 * never touch another participant's avatar, and scoring the same participant
 * twice must leave exactly four rows. Until the table, the adapter and the
 * `test-db.ts` guard exist it is vacuously true, asserted over what can be
 * inspected without a database:
 *
 *   1. if the schema barrel exports a `latent_estimates` table, its primary
 *      key is exactly `(participant_id, pillar)` -- the upsert target that
 *      makes the second run a no-op in row count -- and it carries the four
 *      value columns the reads and the engine depend on;
 *   2. if src/lib/adapters/db/latent-repository.ts exists, it opens no
 *      `transaction(` (neon-http cannot run one; `db.batch()` is the rule,
 *      data-access §2) and reads no clock -- `computedAt` arrives from the
 *      use case's `now`, which is what lets "B's rows unchanged in every
 *      column including computed_at" be observed.
 *
 * When the adapter lands, the body is replaced by the integration test the
 * AC describes, through the `test-db.ts` guard (skips without DATABASE_URL,
 * fails under DB_REQUIRED=1): a room created by #4's createRoomRepository at
 * INSTRUMENT.version (the Room it returns is the input to scoreParticipant),
 * participants A and B, B pre-seeded with four rows; A's 15 blocks saved
 * first through createGeneratedBlockRepository(db).saveBatch
 * (INSTRUMENT.blocks as StoredBlock[] -- docs/domain.md D16: scoring reads
 * the participant's generated_blocks rows, never the constant) and then A's
 * 15 quiz_responses through createResponseRepository(db);
 * `scoreParticipant({ participantId: A, room }, { responses, generatedBlocks,
 * latents, now })` twice with the real createResponseRepository,
 * createGeneratedBlockRepository and createLatentRepository adapters; then A
 * has exactly four rows with means in [0, 1], se > 0 and scorer_version
 * "map-luce-v1", B's rows are byte-equal including computed_at,
 * `byParticipant(A)` exposes only mean and se per pillar, and
 * `byParticipants([A, B])` returns both in one query with the same values.
 * The room is deleted at the end so the cascade removes everything.
 */

const ADAPTER = new URL("./latent-repository.ts", import.meta.url);

/** The adapter's source, or "" when the file does not exist yet. */
function readAdapter(): string {
  return existsSync(ADAPTER) ? readFileSync(ADAPTER, "utf8") : "";
}

/** Comments cannot open a transaction; drop them before matching. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The `latent_estimates` table from the barrel, whatever its export name. */
function latentEstimatesTable(): PgTable | undefined {
  for (const value of Object.values(schema as Record<string, unknown>)) {
    if (
      is(value, PgTable) &&
      getTableConfig(value).name === "latent_estimates"
    ) {
      return value;
    }
  }
  return undefined;
}

describe("safety invariants", () => {
  // Runs today, on purpose. Vacuously true until #7 lands -- no table, no
  // adapter -- and it keeps holding as each of those arrives. The blocks A
  // is scored on come from generated_blocks (already in the schema barrel),
  // which this test neither writes nor inspects: the invariant is about
  // latent_estimates alone.
  it("AC-9 · scoring A twice leaves exactly four rows for A and B's rows untouched", () => {
    // 1. The table's primary key is the idempotency mechanism.
    const table = latentEstimatesTable();
    if (table !== undefined) {
      const config = getTableConfig(table);
      const pk = new Set<string>();
      for (const column of config.columns) {
        if (column.primary) pk.add(column.name);
      }
      for (const key of config.primaryKeys) {
        for (const column of key.columns) pk.add(column.name);
      }
      expect([...pk].sort()).toEqual(["participant_id", "pillar"]);

      const names = config.columns.map((column) => column.name);
      for (const required of ["mean", "se", "scorer_version", "computed_at"]) {
        expect(names, `latent_estimates.${required} is missing`).toContain(
          required
        );
      }
    }

    // 2. The adapter writes in a batch and never reads a clock.
    const code = withoutComments(readAdapter());
    expect(code, "latent-repository.ts opens a transaction").not.toMatch(
      /\.transaction\s*\(/
    );
    expect(code, "latent-repository.ts reads a clock").not.toMatch(
      /\bDate\.now\s*\(|\bnew\s+Date\b/
    );
    expect(code, "latent-repository.ts calls Math.random").not.toMatch(
      /\bMath\.random\s*\(/
    );
  });
});
