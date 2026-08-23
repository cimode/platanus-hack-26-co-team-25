import { expect, test } from "@playwright/test";

/**
 * /design/simulated-life -- the pair reacting to the year the rail is showing.
 *
 * Drives the real `TimelineRail` + `PairStage` over a fixture `SimulatedLife`,
 * so it runs with or without DATABASE_URL and without waiting on a model. The
 * two properties worth a browser (rather than a unit test) are that the
 * reaction actually fires from a scroll, and that firing it does not move
 * either avatar -- which is the thing a spritesheet swap gets wrong.
 */

const ANA = '[data-avatar="avatar3"]';
const BRUNO = '[data-avatar="avatar1"]';

/** The rail's own scroller: the element the cards live in. */
const RAIL = ".snap-x";

test.describe("simulated life · the pair reacts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design/simulated-life");
  });

  test("shows both people wearing their own plates", async ({ page }) => {
    await expect(page.getByRole("img", { name: "Ana" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Bruno" })).toBeVisible();
    // Different plates on purpose: a swap bug is invisible when both match.
    await expect(page.locator(ANA)).toHaveCount(1);
    await expect(page.locator(BRUNO)).toHaveCount(1);
  });

  test("plays the first year's reaction on both avatars at once", async ({
    page,
  }) => {
    // Year 1 is a milestone the narrator marked `celebrate`.
    await expect(page.locator(`${ANA} [data-anim="celebrate"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(
      page.locator(`${BRUNO} [data-anim="celebrate"]`)
    ).toBeVisible();
  });

  test("a one-shot returns both avatars to their plates", async ({ page }) => {
    await expect(page.locator(`${ANA} [data-anim="celebrate"]`)).toBeVisible({
      timeout: 4_000,
    });
    // No loop may be reachable from a life event: every reaction ends by itself.
    await expect(page.locator(`${ANA} [data-anim="idle"]`)).toBeVisible({
      timeout: 9_000,
    });
    await expect(page.locator(`${BRUNO} [data-anim="idle"]`)).toBeVisible();
  });

  test("scrolling the rail changes which reaction plays", async ({ page }) => {
    await expect(page.locator(`${ANA} [data-anim="celebrate"]`)).toBeVisible({
      timeout: 4_000,
    });

    // Scroll to the conflict card (year 3), which the narrator marked `angry`.
    await page.locator(RAIL).evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>("[data-event-card]");
      const card = cards[2];
      el.scrollTo({
        left: card.offsetLeft - el.clientWidth / 2 + card.offsetWidth / 2,
      });
    });

    await expect(page.locator(`${ANA} [data-anim="angry"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator(`${BRUNO} [data-anim="angry"]`)).toBeVisible();
  });

  test("neither avatar moves from its spot while reacting", async ({
    page,
  }) => {
    // The whole reason `AvatarSprite` computes a frame box: the emote frames
    // are taller than the plate, so a naive swap would shrink the body and
    // lift the feet off the floor line. The footprint must be byte-identical.
    const ana = page.locator(ANA);
    const bruno = page.locator(BRUNO);

    await expect(page.locator(`${ANA} [data-anim="idle"]`)).toBeVisible({
      timeout: 9_000,
    });
    const anaIdle = await ana.boundingBox();
    const brunoIdle = await bruno.boundingBox();

    await page.locator(RAIL).evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>("[data-event-card]");
      const card = cards[1];
      el.scrollTo({
        left: card.offsetLeft - el.clientWidth / 2 + card.offsetWidth / 2,
      });
    });

    await expect(page.locator(`${ANA} [data-anim="love"]`)).toBeVisible({
      timeout: 4_000,
    });
    expect(await ana.boundingBox()).toEqual(anaIdle);
    expect(await bruno.boundingBox()).toEqual(brunoIdle);
  });

  test("the kid beat plays love AND fires the babyOnBoard reveal", async ({
    page,
  }) => {
    // The one life event that earns a choreographed reveal on top of its emote.
    // `PairStage` fires it on the action bus and <BabyOnBoard> subscribes, so
    // this asserts the two halves meet with no wiring between the components.
    await page.locator(RAIL).evaluate((el) => {
      const cards = el.querySelectorAll<HTMLElement>("[data-event-card]");
      const card = cards[4]; // año 5 · kid
      el.scrollTo({
        left: card.offsetLeft - el.clientWidth / 2 + card.offsetWidth / 2,
      });
    });

    await expect(page.locator(`${ANA} [data-anim="love"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator(`${BRUNO} [data-anim="love"]`)).toBeVisible();

    // The reveal walks the parents in before the child appears; the sequence
    // reaching its last phase is what proves the bus signal landed.
    const stage = page.locator("section", { hasText: "babyOnBoard" });
    await expect(stage.locator('[data-anim="walk-right"]').first()).toBeVisible(
      {
        timeout: 4_000,
      }
    );
  });

  test("reduced motion still resolves back to the plate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    // The animation is stripped, so `animationend` never fires; the timer in
    // AvatarSprite is what brings the pair home.
    await expect(page.locator(`${ANA} [data-anim="idle"]`)).toBeVisible({
      timeout: 9_000,
    });
  });
});
