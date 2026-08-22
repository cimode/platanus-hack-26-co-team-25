import { defineConfig } from "vitest/config";

/**
 * Vitest does not read `.env` (Vite's own `loadEnv` only exposes `VITE_`-
 * prefixed variables to the client bundle, and never to `process.env` in a Node
 * test). Without this, `src/lib/adapters/db/*.test.ts` would see no
 * DATABASE_URL on a laptop that has one in `.env` and skip silently -- the
 * exact failure mode `integrationDb()`'s notice exists to make visible.
 *
 * `process.loadEnvFile` is Node 22.5+/24 and throws when the file is absent, so
 * the call is guarded: CI passes DATABASE_URL in the environment and has no
 * `.env` at all. Existing variables win -- `loadEnvFile` does not overwrite.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout (CI, or a clone that never ran `neon link`).
}

export default defineConfig({
  resolve: {
    // Resolves the `@/` alias from tsconfig.json so tests import exactly the
    // way application code does. Native since Vite 7 -- no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    // Node environment on purpose: these tests cover the engine, which is pure
    // functions over data. No DOM, no jsdom, no component rendering -- the UI
    // is covered by Playwright instead. Keeps the suite in the milliseconds.
    environment: "node",
    // The engine suites finish in milliseconds; the ones under
    // src/lib/adapters/db/ are integration tests against a Neon branch in
    // us-east-2, and neon-http is one HTTP round trip per statement. A test
    // that answers fifteen quiz blocks makes ~40 of them, which is minutes
    // under the 5s default and seconds in practice. Raised globally rather
    // than per test, because the timeout belongs to the transport, not to any
    // one criterion.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // e2e/ belongs to Playwright. Without this, Vitest would try to run the
    // Playwright specs and fail on its imports.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      // json-summary is what the CI coverage comment reads.
      reporter: ["text", "html", "json-summary"],
      // Only the engine is worth a coverage number. UI coverage from unit
      // tests would be a vanity metric here.
      include: ["src/lib/**"],
    },
  },
});
