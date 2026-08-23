import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One property, and it is the only one that can silently break.
 *
 * `loading.tsx` is a Suspense fallback: it is what the browser paints WHILE the
 * page underneath waits on a ~33s model call (`docs/domain.md` D19). The moment
 * it awaits anything of its own it stops being instant, and a loading screen
 * that loads is worse than none -- the user gets a longer blank.
 *
 * `docs/domain.md:332` states the rule for `/results/[lens]`; the same applies
 * here and for the same reason. It is greppable, so it is guarded rather than
 * left as a comment someone deletes.
 *
 * Asserted at the SOURCE because there is nothing else to assert it from:
 * rendering this file's async-ness needs a slow database-backed page, which is
 * exactly the situation the e2e cannot reach without `DATABASE_URL`.
 */
describe("simulate loading fallback", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/simulate/[id]/loading.tsx"),
    "utf8"
  );

  it("awaits nothing", () => {
    expect(source).not.toMatch(/\basync\b/);
    expect(source).not.toMatch(/\bawait\b/);
  });

  it("is not a client component", () => {
    // A fallback that ships JavaScript delays the very frame it exists to
    // paint. Nothing here needs state.
    expect(source).not.toMatch(/"use client"/);
  });

  it("carries motion the reduced-motion block already covers", () => {
    // `walking` and `venue-drift` are both listed in globals.css's
    // prefers-reduced-motion block. A NEW bespoke animation class here would
    // escape it, and nothing machine-checks token names since ESLint went.
    const classes = source.match(/\b(?:walking|venue-drift)\b/g) ?? [];
    expect(classes.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/animation:\s*(?!none)[a-z-]+\s/);
  });
});
