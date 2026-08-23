import { expect, test } from "@playwright/test";

/**
 * /design/emotes -- the emotes library's catalogue page.
 *
 * Every authored avatar, every emote it has packed, playable through the same
 * `AvatarSprite` + `useEmotePlayer` any screen uses. No database: the page is
 * static over the manifest, so it runs with or without DATABASE_URL.
 */
test.describe("emotes gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design/emotes");
  });

  test("shows the four avatars idling with their whole catalogue", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: "Emotes" })).toBeVisible();
    for (const avatar of ["avatar1", "avatar2", "avatar3", "avatar4"]) {
      const card = page.getByTestId(`gallery-${avatar}`);
      await expect(card.locator('[data-anim="idle"]')).toBeVisible();
      // 13 emotes + the idle control, each reachable by name.
      await expect(card.getByRole("button")).toHaveCount(14);
      await expect(
        card.getByRole("button", { name: `celebrate · ${avatar}` })
      ).toBeVisible();
    }
  });

  test("a one-shot plays once and returns to idle on its own", async ({
    page,
  }) => {
    const card = page.getByTestId("gallery-avatar2");
    await card.getByRole("button", { name: "wave · avatar2" }).click();
    await expect(card.locator('[data-anim="wave"]')).toBeVisible();
    await expect(card.locator('[data-anim="idle"]')).toBeVisible({
      timeout: 8_000,
    });
  });

  test("a walk loops until idle is asked for", async ({ page }) => {
    const card = page.getByTestId("gallery-avatar3");
    await card.getByRole("button", { name: "walk-back · avatar3" }).click();
    const frame = card.locator('[data-anim="walk-back"]');
    await expect(frame).toHaveAttribute("data-loop", "true");
    await page.waitForTimeout(4_500); // longer than any one play
    await expect(frame).toBeVisible();
    await card.getByRole("button", { name: "idle · avatar3" }).click();
    await expect(card.locator('[data-anim="idle"]')).toBeVisible();
  });

  test("the footprint does not move when an emote plays", async ({ page }) => {
    const sprite = page
      .getByTestId("gallery-avatar1")
      .locator('[data-avatar="avatar1"]');
    const before = await sprite.boundingBox();
    await page
      .getByTestId("gallery-avatar1")
      .getByRole("button", { name: "celebrate · avatar1" })
      .click();
    await expect(sprite.locator('[data-anim="celebrate"]')).toBeVisible();
    const during = await sprite.boundingBox();
    expect(during).toEqual(before);
  });

  test("prefers-reduced-motion plays nothing and still comes back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const card = page.getByTestId("gallery-avatar4");
    await card.getByRole("button", { name: "cry · avatar4" }).click();
    const frame = card.locator('[data-anim="cry"]');
    await expect(frame).toBeVisible();
    expect(
      await frame.evaluate((el) => getComputedStyle(el).animationName)
    ).toBe("none");
    await expect(card.locator('[data-anim="idle"]')).toBeVisible({
      timeout: 8_000,
    });
  });
});
