import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/*
 * The `e2e-<run>` room's slug is decided HERE, not in global-setup, because
 * two things need it and only one of them used to.
 *
 * The specs reach their isolated room by putting `?room=<slug>` in the URL.
 * `/` cannot: the impersonation chooser has no room in its path, and since
 * `ParticipantsPort` started reading the `participants` table it resolves the
 * venue from `HOOKAI_ROOM_SLUG` like every other default. Left unset, the
 * chooser under test is empty and every spec downstream of it fails for a
 * reason that has nothing to do with what it asserts.
 *
 * Config module scope runs before the web server starts and before global
 * setup, so both read the same value. An externally supplied E2E_ROOM_SLUG
 * still wins, which is how a debugging run points at a room it already seeded.
 */
const RUN_ID =
  process.env.E2E_RUN_ID ??
  `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const ROOM_SLUG = process.env.E2E_ROOM_SLUG ?? `e2e-${RUN_ID}`;
process.env.E2E_RUN_ID = RUN_ID;
process.env.E2E_ROOM_SLUG = ROOM_SLUG;

// 3000, the same port `npm run dev` uses, ON PURPOSE. Next 16 refuses to start
// a second dev server for the same directory whatever port you give it, so a
// separate 3100 meant `npm run test:e2e` simply failed whenever anyone had the
// app running. On 3000, `reuseExistingServer` below picks up that server
// instead of fighting it; CI has no server running, so it still starts its own.
// `E2E_PORT` lets parallel worktrees (the /work pipelines) each boot their own
// server instead of reusing a neighbour's on 3000 -- Playwright would otherwise
// run one issue's specs against another issue's app. `E2E_ISOLATED=1` also turns
// reuse off, so a stale server on that port cannot be picked up by mistake.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

// The site gate (issue #50) is switched on by SITE_GATE_PASSWORD alone, so a
// gated run needs its own dev server. `E2E_GATE=1` is that mode: the server
// boots with a throwaway password and ONLY e2e/site-gate.spec.ts runs, because
// every other spec would be answered with a 302 to /gate. Without the variable
// -- local dev, CI, every existing run -- there is no gate and the gate spec is
// the one file left out.
const GATED = !!process.env.E2E_GATE;
const GATE_PASSWORD = "test-gate-pw";

export default defineConfig({
  testDir: "./e2e",
  testMatch: GATED ? "**/site-gate.spec.ts" : undefined,
  testIgnore: GATED ? undefined : "**/site-gate.spec.ts",
  // Creates the `e2e-<run>` room the intake specs register into and exports
  // its slug as E2E_ROOM_SLUG (docs/domain.md D9). Workers are forked after it
  // runs, so they inherit the variable.
  globalSetup: "./e2e/global-setup.ts",
  // Fail the run if someone leaves a test.only in a commit.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    // Traces only on the first retry: full traces on every run are slow and
    // large, but a trace is exactly what you want for a flake.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Visual snapshots are compared at 2x DPI to match how the design reference
  // screenshots were captured. maxDiffPixelRatio absorbs font antialiasing
  // differences without letting real layout changes through.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },

  projects: [
    {
      // 390x844 at 2x is the target from docs/design/CLAUDE_DESIGN_BRIEF.md, and
      // matches how the design reference screenshots were captured.
      //
      // Chromium rather than WebKit deliberately: these snapshots test design
      // tokens, not browser engines, and WebKit is another ~90MB in CI. If
      // iOS-specific rendering bugs show up, add a webkit project and run
      // `pnpm exec playwright install webkit` -- do not chase them with snapshots.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],

  // Runs on a non-default port so an already-running `pnpm run dev` on 3000
  // does not collide with a test run.
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI && !process.env.E2E_ISOLATED,
    timeout: 120_000,
    // Merged over process.env by Playwright; `next dev` never overwrites a
    // variable that is already set, so .env cannot undo this.
    //
    // The room is the load-bearing one: it points the app under test at the
    // room global setup seeds, so `/` lists the cast instead of nobody. A
    // developer's `.env` naming the real demo room cannot override it, which
    // is the point -- a test run must never read `platanus-hack-26-bogota`.
    env: {
      HOOKAI_ROOM_SLUG: ROOM_SLUG,
      ...(GATED ? { SITE_GATE_PASSWORD: GATE_PASSWORD } : {}),
    },
  },
});
