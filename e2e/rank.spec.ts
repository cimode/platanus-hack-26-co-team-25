import { expect, type Page, test } from "@playwright/test";

/**
 * Screen 1c -- `/rank`.
 *
 * Every test name carries its AC id at the front, so a failure names the
 * requirement it broke rather than the assertion that noticed.
 *
 * Cookies are set directly rather than driven through screens 1a and 1b. Those
 * two have their own suite (`demo-path.spec.ts`); re-walking them here would
 * make every failure on this screen also a failure of theirs, and the point of
 * this file is to isolate 1c.
 */

const VIEWER = { id: "p-laura-mendez", name: "Laura Méndez" };

async function open(page: Page, lens?: string, url = "/rank") {
  await page.context().clearCookies();
  // domain/path rather than `url`: the context has no page URL before the first
  // navigation, so a url-based cookie cannot be seeded ahead of `goto`.
  const at = { domain: "localhost", path: "/" };
  const cookies = [{ name: "dipia_impersonating", value: VIEWER.id, ...at }];
  if (lens) cookies.push({ name: "dipia_lens", value: lens, ...at });
  await page.context().addCookies(cookies);
  await page.goto(url);
}

/** Every entry card, by the role and name the AC insists on. */
function cards(page: Page) {
  return page.getByRole("link", { name: /·/ });
}

test.describe("1c · the ranking", () => {
  test("AC-RANK-1 · the ranking belongs to the viewer, who is not in it", async ({
    page,
  }) => {
    await open(page, "romantic");
    // Named once, in the header pill -- and nowhere among the entries.
    await expect(page.getByText(VIEWER.name)).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: new RegExp(VIEWER.name, "i") })
    ).toHaveCount(0);
  });

  test("AC-RANK-1 · ?subject= is inert (safety)", async ({ page }) => {
    // The strongest form of this guarantee is that no code reads searchParams,
    // so the two documents must be identical, not merely similar.
    await open(page, "romantic");
    const plain = await page.locator("main").innerText();

    await open(page, "romantic", "/rank?subject=p-diego-morales");
    const injected = await page.locator("main").innerText();

    expect(injected).toBe(plain);
  });

  test("AC-RANK-2 · entries carry contiguous positions and one bond line each", async ({
    page,
  }) => {
    await open(page, "romantic");
    const count = await cards(page).count();
    expect(count).toBeGreaterThanOrEqual(5);

    for (let i = 0; i < count; i++) {
      // The ACCESSIBLE NAME, not innerText: the photoless placeholder puts
      // "sin foto" first in the DOM, and what this AC is really about is what
      // the entry announces itself as.
      const name = await cards(page).nth(i).getAttribute("aria-label");
      expect(name, `card ${i}`).toMatch(new RegExp(`^${i + 1} · `));
      expect((name?.match(/les une:/g) ?? []).length, `card ${i}`).toBe(1);
    }
  });

  test("AC-RANK-2 · a card without friction does not collapse", async ({
    page,
  }) => {
    await open(page, "romantic");
    // `offsetHeight`, NOT `boundingBox()`. The cards enter on a staggered
    // `pop-in`, and a bounding box is the TRANSFORMED box -- so measuring
    // mid-animation reports four different heights for four identical cards.
    // What this AC is about is the layout box, which a transform never touches.
    const heights = await cards(page).evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).offsetHeight)
    );

    expect(heights.length).toBeGreaterThanOrEqual(5);
    // The fixture guarantees both kinds exist (position % 3 === 0 has none), so
    // if a missing friction line collapsed its card, these would not agree.
    expect(new Set(heights).size).toBe(1);
  });

  test("AC-RANK-2 · a person with no photo gets a named placeholder", async ({
    page,
  }) => {
    // This branch was dead for two verify passes: `Placement.sprite` is
    // `readonly string`, so `photoUrl` was never null and nothing in the demo
    // or the suite had ever rendered the placeholder. The fixture now gives it
    // exactly one subject per room.
    await open(page, "romantic");
    const placeholder = page.getByRole("img", { name: /sin foto todavía/i });
    await expect(placeholder).toHaveCount(1);
    await placeholder.scrollIntoViewIfNeeded();
    await expect(placeholder).toBeVisible();
  });

  test("AC-RANK-3 · both bands render with different computed colours", async ({
    page,
  }) => {
    await open(page, "romantic");
    const backgrounds = await page.evaluate(() => {
      const found = new Map<string, string>();
      for (const el of document.querySelectorAll("span")) {
        const label = el.textContent?.trim() ?? "";
        if (label === "BANDA ALTA" || label === "BANDA MEDIA") {
          found.set(label, getComputedStyle(el).backgroundColor);
        }
      }
      return Object.fromEntries(found);
    });

    expect(Object.keys(backgrounds).sort()).toEqual([
      "BANDA ALTA",
      "BANDA MEDIA",
    ]);
    expect(backgrounds["BANDA ALTA"]).not.toBe(backgrounds["BANDA MEDIA"]);
  });

  test("AC-RANK-3 · no third band exists anywhere on the screen", async ({
    page,
  }) => {
    await open(page, "romantic");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/BANDA BAJA|banda baja/i);
  });

  test("AC-RANK-4 · filtering to Alta narrows without reporting what it hid", async ({
    page,
  }) => {
    await open(page, "romantic");
    const before = await cards(page).count();

    await page.getByRole("radio", { name: "Banda alta" }).check();
    const after = await cards(page).count();

    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    for (let i = 0; i < after; i++) {
      await expect(cards(page).nth(i)).toContainText("BANDA ALTA");
    }

    // No "3 ocultos", no "de 7", no count of the removed -- the filter must not
    // hand back the number it is withholding.
    const main = await page.locator("main").innerText();
    expect(main).not.toMatch(
      new RegExp(`${before - after}\\s*(ocult|escond)`, "i")
    );
  });

  test("AC-RANK-4 · sorting by name reorders without renumbering", async ({
    page,
  }) => {
    await open(page, "romantic");
    const positionsBefore = await cards(page).allInnerTexts();

    await page.getByRole("radio", { name: "Nombre" }).check();
    const after = await cards(page).allInnerTexts();

    expect(after).not.toEqual(positionsBefore);
    // The position is this viewer's RANK, not a row index: sorting by name must
    // not renumber anyone. So the multiset of leading numbers is unchanged.
    const leading = (list: string[]) => list.map((t) => t.split(" ")[0]).sort();
    expect(leading(after)).toEqual(leading(positionsBefore));
  });

  test("AC-RANK-5 · no lens chosen offers a way back and ranks nobody", async ({
    page,
  }) => {
    await open(page);
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sala/i })).toBeVisible();
  });

  test("AC-RANK-7 · each lens repaints the subtree", async ({ page }) => {
    const seen: string[] = [];
    for (const lens of ["romantic", "business", "friendship"]) {
      await open(page, lens);
      const primary = await page.evaluate(() => {
        const el = document.querySelector("main");
        return el
          ? getComputedStyle(el).getPropertyValue("--primary").trim()
          : null;
      });
      expect(primary, `${lens} has no accent`).toBeTruthy();
      seen.push(primary as string);
    }
    // business and friendship must each differ from romantic, which is the
    // :root coral by design -- so three lenses, but only two distinct values
    // would still be a bug. All three differ.
    expect(new Set(seen).size).toBe(3);
  });

  test("AC-RANK-8 · an off-screen entry is reachable by role and name", async ({
    page,
  }) => {
    await open(page, "romantic");
    const last = cards(page).last();
    // Found by role+name while off-screen, THEN scrolled -- the order matters,
    // because a query that only works after scrolling proves nothing about
    // keyboard or assistive-tech reachability.
    await expect(last).toHaveCount(1);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test("AC-PORT-3 · no score reaches the page as text", async ({ page }) => {
    await open(page, "romantic");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/\d+([.,]\d+)?\s*%/);
    // A bare decimal would be a similarity float that escaped the projection.
    expect(text).not.toMatch(/\b\d+[.,]\d+\b/);
  });

  test("AC-RANK-8 · reduced motion stops every animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "romantic");
    // `length`, not `filter(playState === "running").length`. The staggered
    // pop-in finishes by ~1.2s and this asserts at ~240ms, so counting only
    // RUNNING animations would start passing on its own once the page settled
    // -- a green that means "you were late", not "the guard works". With the
    // reduced-motion block active, no animation is registered at all, which is
    // a property of the page rather than of when you looked at it.
    const animations = await page.evaluate(
      () => document.getAnimations().length
    );
    expect(animations).toBe(0);
  });
});
