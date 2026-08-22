import { defineConfig, devices } from "@playwright/test";

// 3000, the same port `npm run dev` uses, ON PURPOSE. Next 16 refuses to start
// a second dev server for the same directory whatever port you give it, so a
// separate 3100 meant `npm run test:e2e` simply failed whenever anyone had the
// app running. On 3000, `reuseExistingServer` below picks up that server
// instead of fighting it; CI has no server running, so it still starts its own.
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
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
      // `npx playwright install webkit` -- do not chase them with snapshots.
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

  // Runs on a non-default port so an already-running `npm run dev` on 3000
  // does not collide with a test run.
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
