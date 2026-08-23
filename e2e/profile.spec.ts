import { expect, type Page, test } from "@playwright/test";
import { rosterIdByName, rosterSeeded } from "./fixtures/roster";

/**
 * Screen 1d -- `/profile/[id]`.
 *
 * Cookies are seeded directly. Screens 1a and 1b have their own suite; walking
 * them here would make every failure on this screen also a failure of theirs.
 */

/*
 * People are named, never hardcoded by id.
 *
 * `participants.id` is a `uuid` column, so `p-diego-morales` was never a row
 * -- it was an id from the hardcoded roster module that production no longer
 * has. `e2e/global-setup.ts` seeds this cast into `e2e-<run>` and publishes
 * the real uuids; `rosterIdByName` reads them back.
 *
 * Resolved through functions rather than constants because the lookup throws
 * when the cast was not seeded, and a throw at module scope would fail the
 * FILE instead of skipping it.
 */
const VIEWER_NAME = "Laura Méndez";
const SUBJECT_NAME = "Diego Morales";
const viewerId = () => rosterIdByName(VIEWER_NAME);
const subjectId = () => rosterIdByName(SUBJECT_NAME);

async function open(page: Page, path: string, lens = "romantic") {
  await page.context().clearCookies();
  const at = { domain: "localhost", path: "/" };
  await page.context().addCookies([
    { name: "dipia_impersonating", value: viewerId(), ...at },
    { name: "dipia_lens", value: lens, ...at },
  ]);
  return page.goto(path);
}

/** The visible 404 text. NOT the whole document: Next echoes router state that
 *  differs between two identical requests to the SAME url, so comparing raw
 *  HTML would fail for a reason that has nothing to do with disclosure. */
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

test.describe("1d · the profile", () => {
  // Same convention as the intake specs: without a database global setup seeds
  // no cast, so there is nobody to be ranked against and every assertion here
  // would fail for that reason rather than its own.
  test.skip(
    !rosterSeeded(),
    "DATABASE_URL is not set, so e2e/global-setup.ts seeded no cast."
  );

  test("AC-PROF-1 · a ranked person renders under their own name", async ({
    page,
  }) => {
    await open(page, `/profile/${subjectId()}`);
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

    const self = await open(page, `/profile/${viewerId()}`);
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
      await open(page, `/profile/${subjectId()}`, lens);
      readings.add(await bodyText(page));
    }
    expect(readings.size).toBeGreaterThan(1);
  });

  test("AC-PROF-3 · reasons are named, never numbered", async ({ page }) => {
    await open(page, `/profile/${subjectId()}`);
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
    await open(page, `/profile/${subjectId()}`);
    const shared = page.getByRole("list", { name: /en común/i });
    const empty = page.getByRole("status", { name: /nada en común/i });

    const hasList = (await shared.count()) === 1;
    const hasEmpty = (await empty.count()) === 1;
    // Exactly one branch, expressed as XOR. The first version of this test
    // summed the two counts and asserted 1 -- which a bare `<ul>` with no items
    // satisfies just as well as the designed state does, so `sdd-verify`
    // replaced the empty state with exactly the blank row the spec forbids and
    // this test stayed GREEN. A count that both branches satisfy is not a test.
    expect(hasList !== hasEmpty).toBe(true);
    if (hasList) {
      expect(await shared.getByRole("listitem").count()).toBeGreaterThan(0);
    }
  });

  test("AC-PROF-4 · nothing offspring-shaped renders, in any state (safety)", async ({
    page,
  }) => {
    for (const lens of ["romantic", "business", "friendship"]) {
      await open(page, `/profile/${subjectId()}`, lens);
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

  test("AC-PROF-4 · the render never reads consent, so it cannot vary with it", async ({
    page,
  }) => {
    // HONEST SCOPE, and the honesty is the point. The spec wants two people
    // identical but for `consent.romantic` to render identical DOM. The fixture
    // carries no consent at all (R15), so that pair does not exist and this
    // CANNOT be the test the AC describes.
    //
    // What IS assertable is the stronger structural fact underneath it: the
    // rendered output is a function of `PersonProfile`, and `PersonProfile` has
    // no consent field -- so consent is not in the render's input at all. This
    // asserts the observable half: the same person renders identically twice,
    // and nothing consent-shaped appears in the payload. When #10 supplies real
    // consent, THIS test must be replaced by the spec's, not extended.
    await open(page, `/profile/${subjectId()}`);
    const first = await page.locator("main").innerHTML();
    await open(page, `/profile/${subjectId()}`);
    expect(await page.locator("main").innerHTML()).toBe(first);
    expect(first).not.toMatch(/consent|consiente|permiso/i);
  });

  test("AC-PROF-5 · the CTA carries the person and nothing else", async ({
    page,
  }) => {
    await open(page, `/profile/${subjectId()}`, "business");
    const cta = page.getByRole("link", { name: /simular vida/i });
    // Exactly the segment. No query string, and above all no viewer id -- a
    // link that leaks out of this session must name a person and nothing about
    // who was looking at them.
    await expect(cta).toHaveAttribute("href", `/simulate/${subjectId()}`);
    const href = await cta.getAttribute("href");
    expect(href).not.toContain("?");
    expect(href).not.toContain(viewerId());
  });

  test("AC-PROF-6 · the avatar moves, and stops under reduced motion", async ({
    page,
  }) => {
    await open(page, `/profile/${subjectId()}`);
    const moving = await page.evaluate(() => document.getAnimations().length);
    expect(moving, "the stage should be alive by default").toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, `/profile/${subjectId()}`);
    const still = await page.evaluate(() => document.getAnimations().length);
    expect(still).toBe(0);
  });
});
