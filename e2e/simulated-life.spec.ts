import { expect, type Page, test } from "@playwright/test";

/**
 * /design/simulated-life -- the walking pair acting out the tile it stands on.
 *
 * Drives the real `LifeBoard` over a fixture `SimulatedLife`, so it runs with
 * or without DATABASE_URL and without waiting on a model. Two properties are
 * worth a browser rather than a unit test: that dragging the board actually
 * fires the beat's reaction, and that the reaction does not move either figure
 * off its tile -- which is what a spritesheet swap gets wrong.
 */

const A = '[data-avatar="avatar1"]';
const B = '[data-avatar="avatar3"]';

/** The board scroller, by the accessible name `TimelineRail` gives it. */
const BOARD = 'section[aria-label*="vida simulada"]';

/** Stand on tile `index`. The rail reads its position as scrollLeft / 96. */
async function standOn(page: Page, index: number) {
  await page
    .locator(BOARD)
    .evaluate((el, i) => el.scrollTo({ left: i * 96 }), index);
}

/** The y of an element's bottom edge -- where its feet meet the tile. */
async function floorOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  return (box?.y ?? 0) + (box?.height ?? 0);
}

test.describe("simulated life · the pair acts out the beat", () => {
  // MOBILE ONLY, and not for convenience: the rail reads which tile you are on
  // from its own `scrollLeft`, so the board has to overflow for the active tile
  // to move at all. Seven beats are ~970px of path, which overflows a 390px
  // phone and fits inside a 1280px desktop -- there, `scrollLeft` stays 0 and
  // the pair never leaves year one. dipia is a phone screen (`max-w-md`
  // throughout); a desktop run here would assert against a layout the product
  // does not ship.
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "the board only scrolls at phone widths"
    );
    await page.goto("/design/simulated-life");
  });

  test("opens on the board with the pair idling on their plates", async ({
    page,
  }) => {
    await expect(page.locator(BOARD)).toBeVisible();
    // Idle is the bare plate with the walking bob, exactly as designed.
    await expect(page.locator(".walking").first()).toBeVisible();
  });

  test("standing on a tile plays that beat's reaction on both figures", async ({
    page,
  }) => {
    // Tile 2 is año 3 · conflict, which the narrator marked `angry`.
    await standOn(page, 2);
    await expect(page.locator(`${A} [data-anim="angry"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator(`${B} [data-anim="angry"]`)).toBeVisible();
  });

  test("a different tile plays a different reaction", async ({ page }) => {
    // Tile 4 is año 5 · kid → love. Proves the emote tracks the beat rather
    // than being played once on mount.
    await standOn(page, 4);
    await expect(page.locator(`${A} [data-anim="love"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator(`${B} [data-anim="love"]`)).toBeVisible();
  });

  test("every reaction ends by itself and returns to the plate", async ({
    page,
  }) => {
    // No locomotion loop may be reachable from a life event: a loop never fires
    // `animationend`, so the pair would walk off the board and never come back.
    await standOn(page, 2);
    await expect(page.locator(`${A} [data-anim="angry"]`)).toBeVisible({
      timeout: 4_000,
    });
    await expect(page.locator(".walking").first()).toBeVisible({
      timeout: 9_000,
    });
  });

  test("neither figure leaves its tile while reacting", async ({ page }) => {
    // The whole reason `AvatarSprite` computes a frame box: emote frames are
    // taller than the plate, so a naive swap shrinks the body and lifts the
    // feet off the floor line. The feet must land on the same line either way.
    //
    // Measured under reduced motion ON PURPOSE. The idle plate carries the
    // `walk` bob, which translates it up to -4px and rotates it 1.5deg, so a
    // measurement taken mid-bob compares a moving target and fails by a couple
    // of pixels that say nothing about layout. Stripping motion leaves exactly
    // the geometry this test is about.
    // Both measurements are taken on the SAME tile, without scrolling between
    // them: the path snakes up and down, so two different tiles sit ~80px apart
    // vertically and comparing across them measures the board, not the sprite.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await standOn(page, 2);

    await expect(page.locator(`${A} [data-anim="angry"]`)).toBeVisible({
      timeout: 4_000,
    });
    // Measure the SPRITE BOX, not the frame inside it. A frame is deliberately
    // taller than the body and hangs (1 - feetFraction) of its height below the
    // box -- 4.6px here -- so that the FEET land on the box's bottom edge. That
    // edge is the floor line; the frame's own bottom is headroom, and comparing
    // it against the plate measures the padding rather than the alignment.
    const reactingFloor = await floorOf(page, A);

    // The reaction ends on its own timer and the plate comes back, in place.
    await expect(page.locator(".walking").first()).toBeVisible({
      timeout: 9_000,
    });
    const idleFloor = await floorOf(page, ".walking");

    expect(Math.abs(reactingFloor - idleFloor)).toBeLessThanOrEqual(1);
  });

  test("reduced motion still resolves back to the plate", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await standOn(page, 2);
    // The animation is stripped, so `animationend` never fires; the timer in
    // AvatarSprite is what brings the pair home.
    await expect(page.locator(".walking").first()).toBeVisible({
      timeout: 9_000,
    });
  });
});
