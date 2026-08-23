import { expect, test } from "@playwright/test";

/**
 * The match reveal (`/match`, CONTEXT.md §3 step 6).
 *
 *     approach (two faces) -> eclipse (black + hearts) -> reveal (three faces)
 *
 * Behaviour-level only: roles and visible text, never DOM structure or class
 * names. Runs on the `mobile` project (390x844), needs no database and no room
 * of its own — the demo pair is committed under `public/match/`.
 *
 * In CI there is no `OPENAI_API_KEY`, so the offspring studio is the fake: the
 * child circle resolves to the committed placeholder at once. A local checkout
 * whose `.env` carries a key runs the real merge (~18s), so the child-image
 * assertion allows for that — the reveal heading and controls do not depend on
 * generation and stay tight.
 */

test.describe("/match", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/match");
  });

  test("shows the two matched faces from the start", async ({ page }) => {
    await expect(page.getByText("dipia · match")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Oso Dormilón", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Zorro Curioso", exact: true })
    ).toBeVisible();
  });

  test("reveals a third circle with the imagined child and the match heading", async ({
    page,
  }) => {
    // The reveal lands after the approach + eclipse beats (~5s); auto-wait
    // carries the assertion across them.
    await expect(
      page.getByRole("heading", { name: /es un match/i })
    ).toBeVisible({ timeout: 15_000 });

    // Instant with the fake (CI); up to a real merge locally.
    await expect(
      page.getByRole("img", { name: /bebé imaginado de .* y .*/i })
    ).toBeVisible({ timeout: 45_000 });

    // Both parents are still on screen in the triad.
    await expect(
      page.getByRole("img", { name: "Oso Dormilón", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Zorro Curioso", exact: true })
    ).toBeVisible();
  });

  test("offers replay and regenerate once revealed", async ({ page }) => {
    await expect(page.getByRole("button", { name: /de nuevo/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: /otro bebé/i })
    ).toBeVisible();
  });
});
