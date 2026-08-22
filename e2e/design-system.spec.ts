import { expect, test } from "@playwright/test";

/**
 * Visual regression on the design system reference.
 *
 * `/design` renders every token, every lens and every component state, so one
 * screenshot per section catches token drift across the whole system. This is
 * the automated version of the manual screenshot pass in docs/design/.
 *
 * When a design change is intentional:
 *
 *     npm run test:e2e -- --update-snapshots
 *
 * Review the resulting image diff in the PR before accepting it. A snapshot
 * updated without looking is worse than no snapshot at all.
 */

/**
 * Pixel comparisons are macOS-only for now.
 *
 * Playwright namespaces snapshots by platform (`brand-desktop-darwin.png`), and
 * Linux renders fonts differently enough that every snapshot would fail on
 * GitHub Actions with no actual regression. Rather than accept a permanently red
 * CI or a meaningless diff threshold, visual assertions run locally and the
 * behavioural assertions below run everywhere.
 *
 * To turn these on in CI, generate Linux baselines inside the Playwright
 * container and commit them:
 *
 *   docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.62.1-noble \
 *     npx playwright test --update-snapshots
 */
const VISUAL = !process.env.CI;

const SECTIONS = [
  "brand",
  "typography",
  "surfaces",
  "lenses",
  "shape-glow",
  "controls",
  "in-situ",
  "loading",
] as const;

test.describe("design system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design");
    // The serif is the whole point of the type system, so never shoot before
    // fonts have settled -- otherwise snapshots flap between Instrument Serif
    // and its fallback.
    await page.evaluate(() => document.fonts.ready);
  });

  test("renders the masthead", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "A simulation engine for human relationships."
    );
  });

  SECTIONS.forEach((name, i) => {
    test(`section renders: ${name}`, async ({ page }) => {
      const section = page.locator("main > div > section").nth(i);
      await expect(section).toBeVisible();
    });
  });

  test.describe("visual", () => {
    test.skip(!VISUAL, "pixel comparison is macOS-only -- see note above");

    test("masthead", async ({ page }) => {
      await expect(page.locator("main > header")).toHaveScreenshot(
        "masthead.png"
      );
    });

    SECTIONS.forEach((name, i) => {
      test(`section: ${name}`, async ({ page }) => {
        await expect(
          page.locator("main > div > section").nth(i)
        ).toHaveScreenshot(`${name}.png`);
      });
    });
  });

  test("each lens actually recolours its subtree", async ({ page }) => {
    // Guards the core mechanism rather than its appearance: one class on a
    // subtree must change --primary inside it. If this breaks, every screen
    // silently loses its accent.
    const resolved = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        return getComputedStyle(el).getPropertyValue("--primary").trim();
      };
      return {
        romantic: read(".lens-romantic"),
        business: read(".lens-business"),
        friendship: read(".lens-friendship"),
        root: getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim(),
      };
    });

    expect(resolved.romantic).toBeTruthy();
    expect(resolved.business).toBeTruthy();
    expect(resolved.friendship).toBeTruthy();

    // All four contexts must differ: three lenses plus the pre-lens brand cyan.
    const values = [
      resolved.root,
      resolved.romantic,
      resolved.business,
      resolved.friendship,
    ];
    expect(new Set(values).size).toBe(4);
  });

  test("the app is dark-only", async ({ page }) => {
    // Light mode is intentionally not built. If `dark` ever falls off <html>,
    // every surface inverts and nobody notices until it is projected.
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
