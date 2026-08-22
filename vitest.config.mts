import { defineConfig } from "vitest/config";

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
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // e2e/ belongs to Playwright. Without this, Vitest would try to run the
    // Playwright specs and fail on its imports.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Only the engine is worth a coverage number. UI coverage from unit
      // tests would be a vanity metric here.
      include: ["src/lib/**"],
    },
  },
});
