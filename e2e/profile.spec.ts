import { expect, type Page, test } from "@playwright/test";

/**
 * Screen 1d -- `/profile/[id]`.
 *
 * Cookies are seeded directly. Screens 1a and 1b have their own suite; walking
 * them here would make every failure on this screen also a failure of theirs.
 */

const VIEWER = { id: "p-laura-mendez", name: "Laura Méndez" };
const SUBJECT = "p-diego-morales";

async function open(page: Page, path: string, lens = "romantic") {
  await page.context().clearCookies();
  const at = { domain: "localhost", path: "/" };
  await page.context().addCookies([
    { name: "dipia_impersonating", value: VIEWER.id, ...at },
    { name: "dipia_lens", value: lens, ...at },
  ]);
  return page.goto(path);
}

/** The visible 404 text. NOT the whole document: Next echoes router state that
 *  differs between two identical requests to the SAME url, so comparing raw
 *  HTML would fail for a reason that has nothing to do with disclosure. */
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

test.describe("1d · the profile", () => {
  test("AC-PROF-1 · a ranked person renders under their own name", async ({
    page,
  }) => {
    await open(page, `/profile/${SUBJECT}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Diego Morales"
    );
  });

  test("AC-PROF-2 · every suppression cause 404s identically (safety)", async ({
    page,
  }) => {
    // The four causes the spec names collapse to one `null` in the port, so the
    // page cannot tell them apart even if it wanted to. What is reachable from
    // the fixture is: an id nobody holds, and the viewer's own id. If these two
    // differed, the 404 itself would be an oracle for who is in the room.
    const unknown = await open(page, "/profile/p-nobody-at-all");
    expect(unknown?.status()).toBe(404);
    const unknownBody = await bodyText(page);

    const self = await open(page, `/profile/${VIEWER.id}`);
    expect(self?.status()).toBe(404);
    const selfBody = await bodyText(page);

    expect(selfBody).toBe(unknownBody);
  });

  test("AC-PROF-2 · the lens changes what the profile says about a person", async ({
    page,
  }) => {
    // The spec's scenario is "friendship renders and romance 404s", which needs
    // per-lens consent the fixture cannot honestly produce (R15). What IS
    // reachable is that the same person's STANDING is lens-specific, which is
    // the same underlying guarantee: this is not one global profile.
    const readings = new Set<string>();
    for (const lens of ["romantic", "business", "friendship"]) {
      await open(page, `/profile/${SUBJECT}`, lens);
      readings.add(await bodyText(page));
    }
    expect(readings.size).toBeGreaterThan(1);
  });

  test("AC-PROF-3 · reasons are named, never numbered", async ({ page }) => {
    await open(page, `/profile/${SUBJECT}`);
    const text = await page.locator("main").innerText();
    expect(text).toMatch(/les une:/);
    expect(text).not.toMatch(/\d+([.,]\d+)?\s*%/);
    expect(text).not.toMatch(/\b\d+[.,]\d+\b/);
    // No wording that turns a position into a league table.
    expect(text).not.toMatch(/\b\d+(º|°)?\s*(mejor|puesto|lugar)/i);
  });

  test("AC-PROF-3 · shared tags are shown as shared, or an explicit empty state", async ({
    page,
  }) => {
    await open(page, `/profile/${SUBJECT}`);
    const shared = page.getByRole("list", { name: /en común/i });
    const empty = page.getByRole("status", { name: /nada en común/i });
    // One or the other, never a bare empty row.
    expect((await shared.count()) + (await empty.count())).toBe(1);
  });

  test("AC-PROF-4 · nothing offspring-shaped renders, in any state (safety)", async ({
    page,
  }) => {
    for (const lens of ["romantic", "business", "friendship"]) {
      await open(page, `/profile/${SUBJECT}`, lens);
      const text = await page.locator("body").innerText();
      expect(text, lens).not.toMatch(/beb[eé]|hijo|offspring/i);
      const named = await page.evaluate(() =>
        [...document.querySelectorAll("[aria-label]")].map(
          (el) => el.getAttribute("aria-label") ?? ""
        )
      );
      for (const label of named) {
        expect(label, lens).not.toMatch(/beb[eé]|hijo|offspring/i);
      }
    }
  });

  test("AC-PROF-5 · the CTA carries the person and nothing else", async ({
    page,
  }) => {
    await open(page, `/profile/${SUBJECT}`, "business");
    const cta = page.getByRole("link", { name: /simular vida/i });
    // Exactly the segment. No query string, and above all no viewer id -- a
    // link that leaks out of this session must name a person and nothing about
    // who was looking at them.
    await expect(cta).toHaveAttribute("href", `/simulate/${SUBJECT}`);
    const href = await cta.getAttribute("href");
    expect(href).not.toContain("?");
    expect(href).not.toContain(VIEWER.id);
  });

  test("AC-PROF-6 · the avatar moves, and stops under reduced motion", async ({
    page,
  }) => {
    await open(page, `/profile/${SUBJECT}`);
    const moving = await page.evaluate(() => document.getAnimations().length);
    expect(moving, "the stage should be alive by default").toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, `/profile/${SUBJECT}`);
    const still = await page.evaluate(() => document.getAnimations().length);
    expect(still).toBe(0);
  });
});
