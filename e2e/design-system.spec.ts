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
  "shape-depth",
  "controls",
  "in-situ",
  "loading",
] as const;

test.describe("design system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design");
    // Baloo 2 carries the whole display voice, so never shoot before fonts
    // have settled -- otherwise snapshots flap between it and its fallback.
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

    // The three lenses must be mutually distinct -- that is the whole point.
    const lenses = [resolved.romantic, resolved.business, resolved.friendship];
    expect(new Set(lenses).size).toBe(3);

    // Business and friendship must also differ from the pre-lens accent.
    // Romantic deliberately does NOT: coral IS the romantic accent in Dipia,
    // not a separate brand hue, so `--primary` matching at :root is correct.
    expect(resolved.business).not.toBe(resolved.root);
    expect(resolved.friendship).not.toBe(resolved.root);
    expect(resolved.romantic).toBe(resolved.root);
  });

  test("the app is light-only", async ({ page }) => {
    // The dark theme was retired with the Dipia system. globals.css still
    // DECLARES the `dark` variant -- the shadcn primitives carry 44 `dark:`
    // utilities and an undeclared variant fails the build -- but nothing must
    // ever apply the class, or every surface inverts on stage.
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});
