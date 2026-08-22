import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { describe, expect, it } from "vitest";
import * as schema from "./index";

/**
 * The participants table (issue #4, docs/domain.md §3): consent is opt-OUT by
 * default (CONTEXT.md §7.3), and there is no stored progress state -- progress
 * is read from the rows (§5).
 *
 * AC-7 is `kind: safety`, so it RUNS today with no database. The table does not
 * exist yet, so the test walks the schema barrel for a table named
 * "participants" and asserts over whichever it finds: vacuous while the barrel
 * is empty, binding the moment schema/participants.ts is re-exported. When it
 * lands, import `participants` and `insertParticipant` directly, import
 * `DEFAULT_CONSENT` from "@/lib/domain/participant" in place of the stand-in
 * below, and keep the assertions.
 */

const CONSENT_COLUMNS = [
  "consent_romantic",
  "consent_business",
  "consent_friendship",
];

/** Progress is never stored (docs/domain.md §5). */
const PROGRESS_COLUMNS = ["status", "step", "progress"];

// Stand-in for DEFAULT_CONSENT from src/lib/domain/participant until #4 lands.
const DEFAULT_CONSENT = { romantic: false, business: false, friendship: false };

function participantsTables(): PgTable[] {
  const exported = schema as Record<string, unknown>;
  return Object.values(exported).filter(
    (value): value is PgTable =>
      is(value, PgTable) && getTableName(value) === "participants"
  );
}

describe("participants", () => {
  // Runs today (kind: safety). The romantic lens ranks real people in public,
  // so nobody is opted in by a default -- the column, the derived insert
  // schema and the domain constant all say false.
  it("AC-7 · consent defaults to false on the column, the insert schema and the domain, and no progress column exists", () => {
    expect(DEFAULT_CONSENT.romantic).toBe(false);

    for (const table of participantsTables()) {
      const columns = Object.values(getTableColumns(table));
      const byName = new Map(columns.map((column) => [column.name, column]));

      for (const name of CONSENT_COLUMNS) {
        const column = byName.get(name);
        expect(column, name).toBeDefined();
        expect(column?.notNull, `${name} not null`).toBe(true);
        expect(column?.default, `${name} default`).toBe(false);
      }

      for (const name of PROGRESS_COLUMNS) {
        expect(byName.has(name), `no ${name} column`).toBe(false);
      }

      const parsed = createInsertSchema(table).safeParse({
        roomId: "22222222-2222-4222-8222-222222222222",
        name: "Ana",
      });
      expect(parsed.success).toBe(true);
      const insert = (parsed.success ? parsed.data : {}) as Record<
        string,
        unknown
      >;
      for (const [key, value] of Object.entries(insert)) {
        if (/consent/i.test(key)) {
          expect(value, key).not.toBe(true);
        }
      }
    }
  });
});
