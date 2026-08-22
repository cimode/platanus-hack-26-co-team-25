import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONSENT } from "@/lib/domain/participant";
import { insertParticipant, participants } from "./participants";

/**
 * The participants table (issue #4, docs/domain.md §3): consent is opt-OUT by
 * default (CONTEXT.md §7.3), and there is no stored progress state -- progress
 * is read from the rows (§5).
 *
 * AC-7 is `kind: safety`, so it RUNS, and it needs no database: the column
 * defaults, the derived insert schema and the domain constant are all readable
 * from the table definition alone. The romantic lens ranks real people in
 * public, so nobody may be opted in by a default -- not by the column, not by
 * the validator the form derives from it, and not by the domain.
 */

const CONSENT_COLUMNS = [
  "consent_romantic",
  "consent_business",
  "consent_friendship",
];

/** Progress is never stored (docs/domain.md §5). */
const PROGRESS_COLUMNS = ["status", "step", "progress"];

describe("participants", () => {
  it("AC-7 · consent defaults to false on the column, the insert schema and the domain, and no progress column exists", () => {
    expect(DEFAULT_CONSENT.romantic).toBe(false);
    expect(DEFAULT_CONSENT).toEqual({
      romantic: false,
      business: false,
      friendship: false,
    });

    const columns = Object.values(getTableColumns(participants));
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

    const parsed = insertParticipant.safeParse({
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
  });
});
