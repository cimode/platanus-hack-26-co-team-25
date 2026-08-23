import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Screen 1f -- `/simulate/[id]`.
 *
 * The chip assertions check the TOKEN, never the label. R8: AC-SIM-5's wording
 * says "every chip's label is one of the seven tag names", but design D4 -- the
 * one that shipped -- gives each of the SIXTEEN kinds its own Spanish label and
 * lets the seven tokens carry the colour. Sixteen labels and seven tokens
 * cannot both be "one of seven", so the token is what gets asserted.
 */

const VIEWER = { id: "p-laura-mendez", name: "Laura Méndez" };
const OTHER = { id: "p-diego-morales", name: "Diego Morales" };

async function open(page: Page, path: string, lens = "romantic") {
  await page.context().clearCookies();
  const at = { domain: "localhost", path: "/" };
  await page.context().addCookies([
    { name: "dipia_impersonating", value: VIEWER.id, ...at },
    { name: "dipia_lens", value: lens, ...at },
  ]);
  return page.goto(path);
}

const cards = (page: Page) => page.getByRole("article");
/**
 * The visible text, once there IS visible text.
 *
 * Read without waiting, this returned "" for one of the two 404s under parallel
 * load and the comparison failed for a reason that had nothing to do with
 * disclosure. Polling until the body is non-empty asserts the property the test
 * is about -- that the two documents SAY the same thing -- instead of asserting
 * that both finished painting at the same speed.
 */
async function bodyText(page: Page): Promise<string> {
  await expect
    .poll(() => page.evaluate(() => document.body.innerText.trim().length))
    .toBeGreaterThan(0);
  return page.evaluate(() => document.body.innerText);
}

test.describe("1f · the simulated life", () => {
  test("AC-SIM-1 · a ranked pair simulates, and both names are present", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      VIEWER.name
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      OTHER.name
    );
    expect(await cards(page).count()).toBeGreaterThan(0);
  });

  test("AC-SIM-2 · an unranked id and self 404 identically (safety)", async ({
    page,
  }) => {
    const unknown = await open(page, "/simulate/p-nobody-at-all");
    expect(unknown?.status()).toBe(404);
    const unknownBody = await bodyText(page);

    const self = await open(page, `/simulate/${VIEWER.id}`);
    expect(self?.status()).toBe(404);
    expect(await bodyText(page)).toBe(unknownBody);
  });

  test("AC-SIM-3 · the horizon pill is read from data, not written in", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`);
    const pill = page.getByText(/^Año \d+ de \d+$/);
    await expect(pill).toHaveCount(1);

    const text = (await pill.innerText()).match(/Año (\d+) de (\d+)/);
    const [year, horizon] = [Number(text?.[1]), Number(text?.[2])];
    expect(year).toBeGreaterThanOrEqual(1);
    expect(year).toBeLessThanOrEqual(horizon);
    // Romantic horizons are 8..14 (`timeline.ts`); a hardcoded number would sit
    // outside that range for most pairs and inside it for none reliably.
    expect(horizon).toBeGreaterThanOrEqual(8);
    expect(horizon).toBeLessThanOrEqual(14);
  });

  test("AC-SIM-3 · no component source hardcodes a horizon", async () => {
    // Greps the sources, because a literal that happens to match the fixture
    // today is invisible to every runtime assertion above.
    const dir = "src/components/simulate";
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      if (/de\s*\{?\s*12\b|horizonYears\s*[=:]\s*\d+/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("AC-SIM-4 · friendship has no horizon pill and no ending card", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`, "friendship");
    await expect(page.getByText(/Año \d+ de \d+/)).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: /cómo termina/i })
    ).toHaveCount(0);
    // Still a life: the events are there, only the duration claim is not.
    expect(await cards(page).count()).toBeGreaterThan(0);
  });

  test("AC-SIM-5 · every event carries exactly one chip, and its TOKEN is one of seven", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`);
    expect(await cards(page).count()).toBe(16);

    const cardChips = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const seven = [
        "hito",
        "mudanza",
        "mascota",
        "peque",
        "ritual",
        "viaje",
        "roce",
      ].map((name) => root.getPropertyValue(`--tag-${name}`).trim());

      // `rgba(0, 0, 0, 0)` starts with "rgb". Filtering on that prefix counted
      // the transparent year span as a chip, which is how the first version of
      // this test failed for a reason that had nothing to do with the product.
      const painted = (el: Element) => {
        const bg = getComputedStyle(el).backgroundColor;
        return bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)");
      };

      // Declared token values are hex; computed backgrounds are rgb. Compare in
      // one space by painting each token onto a throwaway node and reading it
      // back through the same engine.
      const probe = document.createElement("span");
      document.body.append(probe);
      const asRgb = (value: string) => {
        probe.style.backgroundColor = value;
        return getComputedStyle(probe).backgroundColor;
      };
      const sevenRgb = seven.map(asRgb);
      probe.remove();

      return [...document.querySelectorAll("article")].map((card) => {
        const chips = [...card.querySelectorAll("span")].filter(painted);
        return {
          count: chips.length,
          colour: chips[0] ? getComputedStyle(chips[0]).backgroundColor : "",
          sevenRgb,
        };
      });
    });

    expect(cardChips.length).toBe(16);
    for (const card of cardChips) {
      // EXACTLY one chip: never two, never untagged (AC-SIM-5).
      expect(card.count).toBe(1);
      // And its colour IS one of the seven declared tokens -- not merely
      // chip-shaped. Sixteen kinds collapse onto seven families, so this is
      // what "one of seven" actually means (R8).
      //
      // LIMIT, stated so nobody trusts this further than it goes: `--band-high`
      // and `--tag-ritual` are declared byte-identical, so this comparison
      // cannot tell a band token from the ritual tag. The source guard in the
      // next test is what covers that half.
      expect(card.sevenRgb).toContain(card.colour);
    }
    expect(new Set(cardChips[0].sevenRgb).size).toBe(7);
  });

  test("AC-SIM-5 · no timeline component reaches for a band token", async () => {
    /*
     * The colour assertion above CANNOT catch this, and the reason is worth
     * writing down: `--band-high` and `--tag-ritual` are declared byte-identical
     * (`globals.css`, both `#fbe3de`). So a chip painted from `--band-high`
     * computes to exactly the value `--tag-ritual` computes to, and every
     * runtime comparison in the DOM says it is fine.
     *
     * Proven, not assumed: swapping `roce`'s classes to `bg-band-high` left the
     * token test GREEN. AC-SIM-5's scenario is about which TOKEN the chip
     * resolves FROM, and that question only exists in the source.
     *
     * A rank band and a timeline event family mean different things; the shared
     * hex is a coincidence of palette. This is the guard that keeps it one.
     */
    const dir = "src/components/simulate";
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx")) continue;
      // Class-shaped and var-shaped usages only. The first version matched
      // `/band-/` anywhere and flagged the docblock in `event-card.tsx` that
      // EXPLAINS this rule -- a guard that fires on its own documentation is a
      // guard people delete.
      const source = readFileSync(join(dir, file), "utf8");
      if (/\b(?:bg|text|border|ring)-band-|var\(--band-/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("AC-SIM-5 · cards appear in ascending year order", async ({ page }) => {
    await open(page, `/simulate/${OTHER.id}`);
    const years = (await cards(page).allInnerTexts()).map((text) =>
      Number(text.match(/año (\d+)/i)?.[1] ?? 0)
    );
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  test("AC-SIM-6 · the ending narrates a year, never a probability", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`);
    const ending = page.getByRole("region", { name: /cómo termina/i });
    await expect(ending).toHaveCount(1);
    await expect(ending).toContainText(/año \d+/i);

    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\d+([.,]\d+)?\s*%/);
    expect(text).not.toMatch(/probabilidad|supervivencia|chance/i);
  });

  test("AC-SIM-7 · the walking pair advances as the rail moves", async ({
    page,
  }) => {
    await open(page, `/simulate/${OTHER.id}`);
    const pair = page.locator("[class*='walking']").first();
    const before = (await pair.boundingBox())?.x ?? 0;

    const rail = page.getByRole("region", { name: /vida simulada/i });
    await rail.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await page.waitForTimeout(700);

    const after = (await pair.boundingBox())?.x ?? 0;
    expect(Math.abs(after - before)).toBeGreaterThan(20);
  });

  test("AC-SIM-8 · the meet CTA is focusable and inert", async ({ page }) => {
    await open(page, `/simulate/${OTHER.id}`);
    const cta = page.getByRole("button", { name: /proponer encuentro/i });
    await expect(cta).toBeVisible();
    await cta.focus();
    await expect(cta).toBeFocused();

    // Inert means NO request leaves the page. A Server Action would POST here.
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") requests.push(request.url());
    });
    await cta.click();
    await page.waitForTimeout(400);
    expect(requests).toEqual([]);
  });

  test("AC-PORT-8 · nothing offspring-shaped renders, under any lens (safety)", async ({
    page,
  }) => {
    for (const lens of ["romantic", "business", "friendship"]) {
      await open(page, `/simulate/${OTHER.id}`, lens);
      expect(await bodyText(page), lens).not.toMatch(/beb[eé]|hijo|offspring/i);
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll("[aria-label]")].map(
          (el) => el.getAttribute("aria-label") ?? ""
        )
      );
      for (const label of labels) {
        expect(label, lens).not.toMatch(/beb[eé]|hijo|offspring/i);
      }
    }
  });

  test("AC-SIM-7 · reduced motion stops every animation", async ({ page }) => {
    await open(page, `/simulate/${OTHER.id}`);
    /*
     * POLLED, not sampled once. This test passed on its own and failed inside
     * the full suite, and `--workers=1` made it green again -- so the flake was
     * parallelism: under load the dev server had not painted when the single
     * sample was taken, `getAnimations()` returned 0, and the failure said
     * nothing about motion.
     *
     * The property is "this page HAS running animations", not "it has them at
     * this exact instant". Polling asserts the property; a single sample
     * asserts the timing of the machine that ran it.
     */
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length), {
        message: "the rail should be alive by default",
      })
      .toBeGreaterThan(0);

    // Deliberately NOT polled. Polling for zero would wait for a page to go
    // quiet and call that a pass, which is the opposite of the guarantee: with
    // the reduced-motion block active, nothing is ever registered at all.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, `/simulate/${OTHER.id}`);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});
