import path from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  participantBySession,
  roomMembers,
  seedPoolSet,
} from "./fixtures/intake";
import { createQuizParticipant } from "./helpers/quiz-participant";

/**
 * Intake on a phone (issue #42, docs/domain.md D18 and D20).
 *
 *     /intake?room=<slug>  one screen  ->  /quiz
 *
 * Photo, name, gender and birthdate are asked together and submitted once,
 * and the hand-off is straight to the questions: there is no declared round,
 * no consent screen, no gate screen, no step counter and no wordmark. Nothing
 * on any screen may hint at what is being measured.
 *
 * The room is `e2e-<run>`, created by e2e/global-setup.ts and never the real
 * `platanus-hack-26-bogota` (docs/domain.md D9). Photos go through the fake
 * PhotoStore, because AWS_ENDPOINT_URL_S3 is unset here -- no test uploads
 * anything to a bucket.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844), which is the intake target.
 *
 * The one thing that skips this file is the absence of a database (the PR #24
 * guard); CI sets DB_REQUIRED=1, and then a missing database fails the run
 * before a single test can skip.
 */

const FIXTURE_PHOTO = path.join(__dirname, "fixtures", "face.jpg");

test.skip(
  !process.env.DATABASE_URL,
  "needs DATABASE_URL (set by CI once #5 lands)"
);

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

const nameField = (page: Page) =>
  page.getByRole("textbox", { name: /cómo te llamas/i });
const genderField = (page: Page) =>
  page.getByRole("combobox", { name: /con qué te identificas/i });
const birthdateField = (page: Page) => page.getByLabel(/cuándo naciste/i);
const photoField = (page: Page) => page.getByLabel(/tu foto/i);
const submitButton = (page: Page) =>
  page.getByRole("button", { name: /^empezar$/i });
/** The data-treatment box (issue #49): unticked until a test ticks it. */
const dataBox = (page: Page) =>
  page.getByRole("checkbox", { name: /tratamiento de mis datos personales/i });

/**
 * What `/quiz` shows the moment registration lands on it (D20): the beat that
 * opens the first batch when the questions are already there -- a pool set
 * was adopted -- or the "writing your questions" state while they are being
 * authored. Either is the quiz; which one depends on whether another test in
 * the same room took the pool set first, so both are accepted.
 */
const quizOpening = (page: Page) =>
  page
    .getByText(/quince escenas/i)
    .or(page.getByText(/escribiendo tus preguntas/i))
    .first();

const sessionCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter((c) => c.name === "dipia_session");

/** `YYYY-MM-DD` for someone who turns `age` today. */
function bornAgo(age: number): string {
  const now = new Date();
  const year = now.getUTCFullYear() - age;
  const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${now.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The words no intake or quiz screen may serve, as whole words and without
 * regard to case (AC-1, AC-5, AC-6). `gate` and `step` are here as words, so
 * "strategy" and "instep" would not trip them.
 */
const FORBIDDEN = [
  "regulation",
  "politeness",
  "reliability",
  "agency",
  "pillar",
  "keyed",
  "romantic",
  "business",
  "friendship",
  "consent",
  "gate",
  "interested",
  "hard filters",
  "step",
  "paso",
  "team",
  "track",
  "lens",
];

function assertClean(html: string, where: string): void {
  for (const word of FORBIDDEN) {
    const pattern = new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "i");
    expect(pattern.test(html), `${where} must not mention "${word}"`).toBe(
      false
    );
  }
}

test.describe("intake", () => {
  test("AC-1 · one screen registers a participant with photo, name, gender and birthdate and lands on the questions", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    const birthdate = bornAgo(27);
    const served: string[] = [];

    // A set of first questions waiting in the room's pool, so registration
    // adopts it and the first render is block 1's beat rather than a wait.
    await seedPoolSet();

    await page.goto(intakeUrl(slug));
    await expect(submitButton(page)).toBeVisible();
    served.push(await page.content());

    await photoField(page).setInputFiles(FIXTURE_PHOTO);
    await nameField(page).fill("Ana Ramírez");
    await genderField(page).selectOption("F");
    await birthdateField(page).fill(birthdate);
    await dataBox(page).check();
    await submitButton(page).click();

    // Straight to the questions: no declared round in between (D20).
    await expect(page).toHaveURL(/\/quiz(\?|$)/);
    await expect(quizOpening(page)).toBeVisible();
    served.push(await page.content());

    // The row itself, read through the repository behind the session cookie.
    const cookies = await sessionCookies(context);
    expect(cookies).toHaveLength(1);
    const me = await participantBySession(cookies[0].value);
    expect(me).not.toBeNull();
    expect(me?.name).toBe("Ana Ramírez");
    expect(me?.gender).toBe("F");
    expect(me?.birthdate).toBe(birthdate);
    expect(me?.photoUrl).toBeTruthy();
    // D18: participating is consenting, and nothing on screen said so.
    expect(me?.consent).toEqual({
      romantic: true,
      business: true,
      friendship: true,
    });
    // D20: nothing declared was asked, and nothing declared was written.
    expect(me?.declaredAt).toBeNull();

    for (const html of served) assertClean(html, "an intake screen");
  });

  test("AC-2 · a 15-year-old and a missing photo each keep the screen with a message and create no row", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    // Counted by NAME, not by room size: the room is shared with every other
    // test in this run and one of them registers while this one is refused.
    const refused = "Nico Vera";
    const named = async () =>
      (await roomMembers()).filter((m) => m.name === refused).length;
    expect(await named()).toBe(0);

    // Too young.
    await page.goto(intakeUrl(slug));
    await photoField(page).setInputFiles(FIXTURE_PHOTO);
    await nameField(page).fill(refused);
    await genderField(page).selectOption("M");
    await birthdateField(page).fill(bornAgo(15));
    await dataBox(page).check();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/intake\?/);
    await expect(page.getByText(/al menos 18 años/i)).toBeVisible();

    // No photo.
    await page.goto(intakeUrl(slug));
    await nameField(page).fill(refused);
    await genderField(page).selectOption("M");
    await birthdateField(page).fill(bornAgo(27));
    await dataBox(page).check();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/intake\?/);
    await expect(page.getByText(/agrega una foto/i)).toBeVisible();

    expect(await sessionCookies(context)).toHaveLength(0);
    expect(await named()).toBe(0);
  });

  test('AC-6b · an unknown room slug shows "Esta sala no existe" and no form', async ({
    page,
    context,
  }) => {
    const run = process.env.E2E_RUN_ID ?? roomSlug();
    await page.goto(intakeUrl(`does-not-exist-${run}`));

    await expect(page.getByText(/esta sala no existe/i)).toBeVisible();
    await expect(nameField(page)).toHaveCount(0);
    await expect(submitButton(page)).toHaveCount(0);
    expect(await sessionCookies(context)).toHaveLength(0);
  });
});

test.describe("safety invariants", () => {
  // kind: safety. Nothing served by the flow may name what is measured, and
  // the progress bar has to be a real progressbar (issue #42, PILLARS.md A8).
  test("AC-6 · no intake or quiz screen serves a word that names what is measured", async ({
    context,
  }) => {
    const slug = roomSlug();

    // The registration screen, as bytes off the server rather than as the
    // hydrated DOM: a leak hides in the RSC payload as readily as in markup.
    const registration = await (
      await context.request.get(intakeUrl(slug))
    ).text();
    assertClean(registration, "the registration screen");

    const page = await context.newPage();
    await page.goto(intakeUrl(slug));
    const bar = page.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", /\d/);
    await expect(bar).toHaveAttribute("aria-valuemax", /\d/);

    // The first quiz screen, for a participant with their fifteen blocks --
    // the screen registration lands on (D20).
    const quiz = await createQuizParticipant({ context });
    const quizPage = await context.newPage();
    // `?start=1` dismisses the beat that opens a batch, so what is inspected is
    // the block screen itself -- the first thing read after the intake. The
    // beat is tolerated rather than assumed: it is one tap in front of block 1
    // and this criterion is about the bytes, not about which screen shows it.
    await quizPage.goto("/quiz?start=1");
    const beatLink = quizPage.getByRole("link", { name: /empezar/i });
    if ((await beatLink.count()) > 0) await beatLink.click();
    await expect(quizPage.getByText(quiz.blockAt(1).scenario)).toBeVisible();
    assertClean(await quizPage.content(), "the first quiz screen");

    const quizBar = quizPage.getByRole("progressbar");
    await expect(quizBar).toHaveAttribute("aria-valuenow", /\d/);
    await expect(quizBar).toHaveAttribute("aria-valuemax", /\d/);
  });

  // kind: safety. The session cookie is httpOnly, SameSite=Lax, and never
  // readable from page script or printed into the HTML (docs/domain.md D4).
  test("AC-9 · the session cookie is httpOnly, Lax, and invisible to page script", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    await page.goto(intakeUrl(slug));
    await photoField(page).setInputFiles(FIXTURE_PHOTO);
    await nameField(page).fill("Elena Ruiz");
    await genderField(page).selectOption("F");
    await birthdateField(page).fill(bornAgo(31));
    await dataBox(page).check();
    await submitButton(page).click();
    await expect(page).toHaveURL(/\/quiz(\?|$)/);
    await expect(quizOpening(page)).toBeVisible();

    const sessions = await sessionCookies(context);
    expect(sessions).toHaveLength(1);
    const cookie = sessions[0];
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");

    // The first quiz screen, as bytes: the token is not in the document.
    const html = await (await context.request.get("/quiz")).text();
    expect(html).not.toContain(cookie.value);

    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain("dipia_session");
  });
});

/**
 * The photo field itself (issue #47): a square that says a photo is required
 * before one exists, and the same square under an oval face guide once it does.
 * The file input stays the real control -- hidden to the eye, not to the
 * accessibility tree, and still the thing Playwright fills.
 */
test.describe("photo guide", () => {
  const faceGuide = (page: Page) =>
    page.getByRole("img", { name: /guía para centrar la cara/i });
  const changePhoto = (page: Page) =>
    page.getByRole("button", { name: /cambiar foto/i });

  test("AC-1 · before a photo is chosen the square says one is required", async ({
    page,
  }) => {
    await page.goto(intakeUrl(roomSlug()));

    await expect(page.getByText(/tu foto — obligatoria/i)).toBeVisible();
    await expect(page.getByText(/tócala para tomarla ahora/i)).toBeVisible();
    // The silhouette placeholder, not a photo, and no guide to draw yet.
    await expect(faceGuide(page)).toHaveCount(0);
    await expect(changePhoto(page)).toHaveCount(0);
    // The real control, reachable by its accessible name.
    await expect(photoField(page)).toHaveCount(1);
    await expect(photoField(page)).toHaveAttribute("type", "file");
  });

  test("AC-2 · a chosen photo shows the oval guide, the hint and a way to change it, and still registers", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    const birthdate = bornAgo(24);

    await page.goto(intakeUrl(slug));
    await photoField(page).setInputFiles(FIXTURE_PHOTO);

    await expect(faceGuide(page)).toBeVisible();
    await expect(
      page.getByText(/centra tu cara dentro del óvalo/i)
    ).toBeVisible();
    await expect(changePhoto(page)).toBeVisible();

    await nameField(page).fill("Lucía Peña");
    await genderField(page).selectOption("F");
    await birthdateField(page).fill(birthdate);
    await dataBox(page).check();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/quiz(\?|$)/);
    const cookies = await sessionCookies(context);
    expect(cookies).toHaveLength(1);
    const me = await participantBySession(cookies[0].value);
    expect(me?.name).toBe("Lucía Peña");
    expect(me?.photoUrl).toBeTruthy();
  });

  test("AC-3 · submitting with no photo shows the error by the square and creates no row", async ({
    page,
    context,
  }) => {
    const slug = roomSlug();
    const refused = "Sin Foto Torres";
    const named = async () =>
      (await roomMembers()).filter((m) => m.name === refused).length;
    expect(await named()).toBe(0);

    await page.goto(intakeUrl(slug));
    await nameField(page).fill(refused);
    await genderField(page).selectOption("M");
    await birthdateField(page).fill(bornAgo(29));
    await dataBox(page).check();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/intake\?/);
    await expect(page.getByText(/agrega una foto/i)).toBeVisible();
    // The square is still the placeholder: nothing was chosen.
    await expect(page.getByText(/tu foto — obligatoria/i)).toBeVisible();
    await expect(faceGuide(page)).toHaveCount(0);

    expect(await sessionCookies(context)).toHaveLength(0);
    expect(await named()).toBe(0);
  });
});

/**
 * The data-treatment authorisation (issue #49, Ley 1581 de 2012).
 *
 * The box is unticked by default and the submit is refused without it -- by
 * the SERVER, not by the browser's own bubble, so the sentence is the app's and
 * the action refuses the same way when it is called without this page at all.
 * What is stored is the MOMENT, not merely the fact.
 */
test.describe("data treatment", () => {
  test("AC-1 · an unticked box keeps the screen, shows the error and creates no row", async ({
    page,
    context,
  }) => {
    const refused = "Sara Quintero";
    const named = async () =>
      (await roomMembers()).filter((m) => m.name === refused).length;
    expect(await named()).toBe(0);

    await page.goto(intakeUrl(roomSlug()));
    await photoField(page).setInputFiles(FIXTURE_PHOTO);
    await nameField(page).fill(refused);
    await genderField(page).selectOption("F");
    await birthdateField(page).fill(bornAgo(26));
    await expect(dataBox(page)).not.toBeChecked();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/intake\?/);
    await expect(page.getByText(/necesitamos tu autorización/i)).toBeVisible();

    expect(await sessionCookies(context)).toHaveLength(0);
    expect(await named()).toBe(0);
  });

  test("AC-2 · ticking it registers and stores when the authorisation was given", async ({
    page,
    context,
  }) => {
    const before = Date.now() - 1000;

    await page.goto(intakeUrl(roomSlug()));
    await photoField(page).setInputFiles(FIXTURE_PHOTO);
    await nameField(page).fill("Valeria Quintero");
    await genderField(page).selectOption("F");
    await birthdateField(page).fill(bornAgo(26));
    await dataBox(page).check();
    await submitButton(page).click();

    await expect(page).toHaveURL(/\/quiz(\?|$)/);

    const cookies = await sessionCookies(context);
    expect(cookies).toHaveLength(1);
    const me = await participantBySession(cookies[0].value);
    expect(me?.dataConsentAt).toBeTruthy();
    const at = new Date(me?.dataConsentAt as Date).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
