import { expect, type Page, test } from "@playwright/test";

/**
 * Reactions in the room (emotes).
 *
 * `reactToEvent(participantId, kind)` is the seam everything else will call --
 * a server action's result, a socket, a presenter at the console. It is
 * reachable from page script as `window.dipia.reactToEvent`, which is also
 * how these tests fire it: there is deliberately no UI control for it.
 *
 * The sprite under test is whoever wears `avatar1.png`, the only plate with
 * packed sheets while the others are being generated. If that ever stops being
 * true the first test skips itself rather than failing for a missing asset.
 */

async function enterAs(page: Page, query: string) {
  await page.goto("/");
  const box = page.getByRole("combobox", {
    name: /nombre del participante/i,
  });
  await box.click();
  await box.fill(query);
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: /ámonos/i }).click();
  await page.waitForURL("**/room");
  await page.waitForSelector("figure[data-participant]");
}

/** The id of the first sprite wearing avatar1, or null. */
async function avatar1Id(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const fig of document.querySelectorAll<HTMLElement>(
      "figure[data-participant]"
    )) {
      const idle = fig.querySelector<HTMLElement>('[data-anim="idle"]');
      if (idle?.style.backgroundImage.includes("avatar1.png"))
        return fig.dataset.participant ?? null;
    }
    return null;
  });
}

const sprite = (page: Page, id: string) =>
  page.locator(`figure[data-participant="${id}"] [data-anim]`);

test.describe("1b · reactions", () => {
  test("a match makes the sprite celebrate, once, then idle again", async ({
    page,
  }) => {
    await enterAs(page, "diego");
    const id = await avatar1Id(page);
    test.skip(id === null, "no sprite wears avatar1 in this room");

    await page.evaluate((pid) => {
      window.dipia?.reactToEvent(pid, "match");
    }, id as string);

    await expect(sprite(page, id as string)).toHaveAttribute(
      "data-anim",
      "celebrate"
    );
    // The sheet plays exactly once: 48 frames at 12 fps is 4 s, plus slack.
    await expect(sprite(page, id as string)).toHaveAttribute(
      "data-anim",
      "idle",
      { timeout: 8_000 }
    );
  });

  test("an emote nobody packed leaves the sprite idling", async ({ page }) => {
    await enterAs(page, "diego");
    const id = await page.evaluate(
      () =>
        document.querySelector<HTMLElement>("figure[data-participant]")?.dataset
          .participant ?? null
    );
    expect(id).not.toBeNull();

    // "walk" exists in the domain but may have no sheet for this plate yet.
    // Whatever the catalogue says, the sprite must never go blank.
    await page.evaluate((pid) => {
      window.dipia?.dispatchEmote(pid, "walk");
    }, id as string);
    await page.waitForTimeout(200);
    const anim = await sprite(page, id as string).getAttribute("data-anim");
    expect(["idle", "walk"]).toContain(anim);
    await expect(sprite(page, id as string)).toBeVisible();
  });

  test("prefers-reduced-motion plays no reaction, and still comes back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterAs(page, "diego");
    const id = await avatar1Id(page);
    test.skip(id === null, "no sprite wears avatar1 in this room");

    await page.evaluate((pid) => {
      window.dipia?.reactToEvent(pid, "match");
    }, id as string);

    await expect(sprite(page, id as string)).toHaveAttribute(
      "data-anim",
      "celebrate"
    );
    // Measured the way demo-path.spec.ts measures it: computed animationName,
    // not document.getAnimations(), which also counts a hovered caption's
    // opacity transition under the desktop pointer.
    expect(
      await sprite(page, id as string).evaluate(
        (el) => getComputedStyle(el).animationName
      ),
      "the reaction must not animate under reduced motion"
    ).toBe("none");
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll("*")].filter((el) => {
            const name = getComputedStyle(el).animationName;
            return name && name !== "none";
          }).length
      ),
      "nothing in the room may animate under reduced motion"
    ).toBe(0);
    // No `animationend` arrives without an animation; the fallback timer must.
    await expect(sprite(page, id as string)).toHaveAttribute(
      "data-anim",
      "idle",
      { timeout: 8_000 }
    );
  });
});
