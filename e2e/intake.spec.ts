import path from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

/**
 * Intake on a phone: register -> photo -> consent (issue #6).
 *
 *     /intake?room=<slug>  step 1 -> step 2 -> step 3 -> /intake/declared
 *
 * Issue #8 took the temporary done screen away: saving consent now hands off to
 * the declared round (docs/domain.md §0 `consent -> declared round`), the form
 * is five steps rather than three, and "what was just saved" is read back the
 * way the rows express it -- by reopening /intake and looking at the switches.
 * Every test name and AC id below is #6's, unchanged.
 *
 * The room is `e2e-<run>`, created by e2e/global-setup.ts and never the real
 * `platanus-hack-26-bogota` (docs/domain.md D9). Photos go through the fake
 * PhotoStore, because BLOB_READ_WRITE_TOKEN is unset here -- no test uploads
 * anything to Vercel Blob.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844), which is the intake target.
 *
 * The three `kind: safety` criteria (AC-7, AC-8, AC-9) are never skipped and
 * never conditional: consent defaults off, no page carries another
 * participant's name or photo, and the session cookie is unreadable from page
 * script. A silently skipped safety test is the most expensive kind of green in
 * this product.
 */

const FIXTURE_PHOTO = path.join(__dirname, "fixtures", "face.png");

/** Set by e2e/global-setup.ts; a missing value is a broken run, not a skip. */
function roomSlug(): string {
  const slug = process.env.E2E_ROOM_SLUG;
  if (!slug) {
    throw new Error(
      "E2E_ROOM_SLUG is not set. e2e/global-setup.ts creates the `e2e-<run>` " +
        "room and exports it; check that playwright.config.ts still registers it."
    );
  }
  return slug;
}

function intakeUrl(slug: string): string {
  return `/intake?room=${encodeURIComponent(slug)}`;
}

const stepHeading = (page: Page, n: 1 | 2 | 3 | 4 | 5) =>
  page.getByRole("heading", {
    name: new RegExp(`step\\s*${n}\\s*of\\s*5`, "i"),
  });

const nameField = (page: Page) => page.getByRole("textbox", { name: /name/i });
const continueButton = (page: Page) =>
  page.getByRole("button", { name: /^continue$/i });
const photoInput = (page: Page) => page.getByLabel(/take or choose a photo/i);
const saveConsentButton = (page: Page) =>
  page.getByRole("button", { name: /save and continue/i });

/**
 * A consent control by its lens. Either role is accepted: "switch" is what the
 * design asks for, "checkbox" is what a no-JavaScript fallback degrades to, and
 * both answer the only question the criteria ask -- is this lens on or off.
 */
const lensSwitch = (page: Page, lens: RegExp) =>
  page
    .getByRole("switch", { name: lens })
    .or(page.getByRole("checkbox", { name: lens }));

const sessionCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter((c) => c.name === "hookai_session");

/** Step 1: fill the register form and land on step 2. */
async function register(
  page: Page,
  slug: string,
  who: { name: string; team?: string; track?: string }
): Promise<void> {
  await page.goto(intakeUrl(slug));
  await expect(stepHeading(page, 1)).toBeVisible();

  await nameField(page).fill(who.name);
  if (who.team !== undefined) {
    await page.getByRole("textbox", { name: /team/i }).fill(who.team);
  }
  if (who.track !== undefined) {
    await page.getByRole("textbox", { name: /track/i }).fill(who.track);
  }
  await continueButton(page).click();
  await expect(stepHeading(page, 2)).toBeVisible();
}

/** Step 2: attach the 1024x1024 fixture and land on step 3. */
async function attachPhoto(page: Page): Promise<void> {
  await photoInput(page).setInputFiles(FIXTURE_PHOTO);
  await continueButton(page).click();
  await expect(stepHeading(page, 3)).toBeVisible();
}

test.describe("intake", () => {
  test("AC-1 · a participant registers, adds a photo and saves consent on a phone", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();

    await page.goto(intakeUrl(slug));
    await expect(stepHeading(page, 1)).toBeVisible();

    await nameField(page).fill("Ana Ramírez");
    await page.getByRole("textbox", { name: /team/i }).fill("hookai");
    await page.getByRole("textbox", { name: /track/i }).fill("AI");
    await continueButton(page).click();

    await expect(stepHeading(page, 2)).toBeVisible();
    await photoInput(page).setInputFiles(FIXTURE_PHOTO);
    await continueButton(page).click();

    await expect(stepHeading(page, 3)).toBeVisible();
    await lensSwitch(page, /business/i).click();
    await lensSwitch(page, /friendship/i).click();
    await expect(lensSwitch(page, /business/i)).toBeChecked();
    await expect(lensSwitch(page, /friendship/i)).toBeChecked();
    await saveConsentButton(page).click();

    // #8's hand-off: consent ends in the declared round, not on a done screen.
    await expect(page).toHaveURL(/\/intake\/declared$/);
    await expect(stepHeading(page, 4)).toBeVisible();

    // What was saved is read back from the rows: reopening /intake resolves to
    // step 3 (no band is set yet) with this participant's own name, photo and
    // switches.
    const saved = await context.newPage();
    await saved.goto(intakeUrl(slug));
    await expect(stepHeading(saved, 3)).toBeVisible();
    await expect(saved.getByText("Ana Ramírez")).toBeVisible();
    await expect(saved.getByRole("img", { name: /your photo/i })).toBeVisible();
    await expect(lensSwitch(saved, /romantic/i)).not.toBeChecked();
    await expect(lensSwitch(saved, /business/i)).toBeChecked();
    await expect(lensSwitch(saved, /friendship/i)).toBeChecked();

    expect(await sessionCookies(context)).toHaveLength(1);
  });

  test("AC-2 · a blank or 81-character name keeps the participant on step 1 with no session", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    await page.goto(intakeUrl(slug));
    await expect(stepHeading(page, 1)).toBeVisible();

    // Blank.
    await continueButton(page).click();
    await expect(stepHeading(page, 1)).toBeVisible();
    await expect(page.getByText(/name is required/i)).toBeVisible();

    // 81 characters -- one past the `participants.name` check.
    await nameField(page).fill("A".repeat(81));
    await continueButton(page).click();
    await expect(stepHeading(page, 1)).toBeVisible();
    await expect(
      page.getByText(/name must be 80 characters or fewer/i)
    ).toBeVisible();

    // Nothing was created, so a reload is a first visit again.
    await page.goto(intakeUrl(slug));
    await expect(stepHeading(page, 1)).toBeVisible();
    await expect(nameField(page)).toHaveValue("");
    expect(await sessionCookies(context)).toHaveLength(0);
  });

  test("AC-5 · returning with a cookie resumes at step 3 and shows the saved switches", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    await register(page, slug, { name: "Cami Ortiz", team: "hookai" });
    await attachPhoto(page);

    // Second visit: a new page of the same context, so the same cookie.
    const second = await context.newPage();
    await second.goto(intakeUrl(slug));
    await expect(stepHeading(second, 3)).toBeVisible();
    await expect(second.getByText("Cami Ortiz")).toBeVisible();
    await expect(nameField(second)).toHaveCount(0);

    await lensSwitch(second, /business/i).click();
    await saveConsentButton(second).click();
    await expect(second).toHaveURL(/\/intake\/declared$/);
    await expect(stepHeading(second, 4)).toBeVisible();

    // Third visit: step 3 is the resting place of this issue, and the switches
    // on screen are the saved ones rather than the defaults.
    const third = await context.newPage();
    await third.goto(intakeUrl(slug));
    await expect(stepHeading(third, 3)).toBeVisible();
    await expect(lensSwitch(third, /business/i)).toBeChecked();
    await expect(lensSwitch(third, /romantic/i)).not.toBeChecked();
    await expect(lensSwitch(third, /friendship/i)).not.toBeChecked();
  });

  test('AC-6 · an unknown room slug shows "This room doesn\'t exist" and no form', async ({
    page,
    context,
  }) => {
    const run = process.env.E2E_RUN_ID ?? roomSlug();
    await page.goto(intakeUrl(`does-not-exist-${run}`));

    await expect(
      page.getByText(/this room does\s?n['’]?t exist/i)
    ).toBeVisible();
    await expect(nameField(page)).toHaveCount(0);
    await expect(continueButton(page)).toHaveCount(0);
    expect(await sessionCookies(context)).toHaveLength(0);
  });
});

test.describe("safety invariants", () => {
  // kind: safety. Every lens switch is off until the participant turns it on
  // -- docs/domain.md §5 "romantic consent defaults to off", and D12: the
  // romantic switch covers the AI-offspring render, so the copy says so.
  test("AC-7 · every lens switch is off until the participant turns it on", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    await register(page, slug, { name: "Dana Peña" });
    await attachPhoto(page);

    await expect(lensSwitch(page, /romantic/i)).not.toBeChecked();
    await expect(lensSwitch(page, /business/i)).not.toBeChecked();
    await expect(lensSwitch(page, /friendship/i)).not.toBeChecked();
    await expect(
      page.getByText(
        /covers the romantic ranking and the AI-offspring render\./i
      )
    ).toBeVisible();

    // Saving without touching anything is allowed, and stores three noes.
    await saveConsentButton(page).click();
    await expect(page).toHaveURL(/\/intake\/declared$/);
    await expect(stepHeading(page, 4)).toBeVisible();

    // The three noes, read back from the rows rather than from a done screen.
    const saved = await context.newPage();
    await saved.goto(intakeUrl(slug));
    await expect(stepHeading(saved, 3)).toBeVisible();
    await expect(lensSwitch(saved, /romantic/i)).not.toBeChecked();
    await expect(lensSwitch(saved, /business/i)).not.toBeChecked();
    await expect(lensSwitch(saved, /friendship/i)).not.toBeChecked();
  });

  // kind: safety. A page served to one context never carries another
  // participant's name or photo (docs/domain.md §5: photoUrl leaves the server
  // only for its own session).
  test("AC-8 · a page served to one participant never carries another's name or photo", async ({
    page,
    browser,
  }, testInfo) => {
    const slug = roomSlug();

    // Context A: Ana, with a photo, resting on step 3.
    await register(page, slug, { name: "Ana Ramírez", team: "hookai" });
    await attachPhoto(page);
    const photoA = page.getByRole("img", { name: /your photo/i });
    await expect(photoA).toBeVisible();
    const srcA = await photoA.getAttribute("src");
    expect(srcA).toBeTruthy();

    // Context B: a different phone, no cookies.
    const contextB = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const pageB = await contextB.newPage();
      const servedToB: string[] = [];

      await pageB.goto(intakeUrl(slug));
      await expect(stepHeading(pageB, 1)).toBeVisible();
      servedToB.push(await pageB.content());

      await nameField(pageB).fill("Beto Díaz");
      await continueButton(pageB).click();
      await expect(stepHeading(pageB, 2)).toBeVisible();
      servedToB.push(await pageB.content());

      // The server's own bytes, not just the hydrated DOM: a leak hides in the
      // payload as readily as in the markup.
      servedToB.push(
        await (await contextB.request.get(intakeUrl(slug))).text()
      );

      for (const html of servedToB) {
        expect(html).not.toContain("Ana Ramírez");
        expect(html).not.toContain(srcA);
      }
      await expect(pageB.getByText("Ana Ramírez")).toHaveCount(0);
    } finally {
      await contextB.close();
    }

    // A's own page still shows A's own photo.
    await page.reload();
    await expect(stepHeading(page, 3)).toBeVisible();
    await expect(
      page.getByRole("img", { name: /your photo/i })
    ).toHaveAttribute("src", srcA ?? "");
  });

  // kind: safety. The session cookie is httpOnly, SameSite=Lax, and never
  // readable from page script or printed into the HTML (docs/domain.md D4).
  test("AC-9 · the session cookie is httpOnly, Lax, and invisible to page script", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    await register(page, slug, { name: "Elena Ruiz" });
    await expect(stepHeading(page, 2)).toBeVisible();

    const sessions = await sessionCookies(context);
    expect(sessions).toHaveLength(1);
    const cookie = sessions[0];
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");

    const html = await (await context.request.get(intakeUrl(slug))).text();
    expect(html).not.toContain(cookie.value);
    expect(await page.content()).not.toContain(cookie.value);

    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain("hookai_session");
  });
});
