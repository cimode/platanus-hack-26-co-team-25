import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import { seedParticipant, signIn } from "./fixtures/intake-declared";

/**
 * Declared round and lens gates on a phone (issue #8).
 *
 *     step 3 -> /intake/declared (Step 4 of 5) -> /intake/gates/* (Step 5 of 5) -> /quiz
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844), which is the intake target.
 *
 * What that means for the screens, and it is a contract rather than a
 * preference (`ui-composition` §6 -- a control without an accessible name is a
 * control no test can reach):
 *
 *   - each declared band is a `radiogroup` whose accessible name contains the
 *     band ("money posture", "rootedness", "family gravity", "capacity hours",
 *     "distance"/"re-contact", "chronotype"), holding exactly four `radio`
 *     options -- the 0..3 that D6 stores;
 *   - the tag picker's toggles are `checkbox`es and its cap is visible as
 *     "n of 12";
 *   - the gate questions are named after what they ask: gender, interested in,
 *     single, age, kids, risk posture, exit horizon, redlines. A yes/no is
 *     either a `radiogroup` with a Yes option or a switch, and the helper below
 *     accepts both;
 *   - every screen advances on a button named Continue and goes back on one
 *     named Back.
 *
 * The `kind: safety` criterion (AC-7) is never skipped and never conditional:
 * gender, interested in, single, age band and wants kids are asked ONLY of a
 * participant who consented to the romantic lens (PILLARS.md A8,
 * docs/domain.md D5).
 */

const FIXTURE_PHOTO = path.join(__dirname, "fixtures", "face.png");

// The romantic gate questions -- asked only under romantic consent
// (PILLARS.md A8, docs/domain.md D5).
const ROMANTIC_QUESTIONS = /gender|interested in|\bsingle\b|\bage\b|\bkids\b/i;

// Every URL a participant can reach in steps 4-5. None of them may ever show
// a romantic question to someone who did not consent to the romantic lens.
const STEP_PATHS = [
  "/",
  "/intake/declared",
  "/intake/gates",
  "/intake/gates/romantic",
  "/intake/gates/business",
];

/** Every role a question could wear; the safety sweep checks all of them. */
const CONTROL_ROLES = [
  "group",
  "radiogroup",
  "radio",
  "checkbox",
  "combobox",
  "switch",
] as const;

/** The six declared bands, by the accessible name their group must carry. */
const BAND_GROUPS = {
  "money posture": /money/i,
  rootedness: /rooted/i,
  "family gravity": /family/i,
  "capacity hours": /capacity|hours/i,
  "distance band": /distance|re-?contact/i,
  chronotype: /chronotype|morning|night/i,
} as const;

type BandName = keyof typeof BAND_GROUPS;

const BAND_NAMES = Object.keys(BAND_GROUPS) as BandName[];

/** The first declared screen (PILLARS.md §2 Life Shape & Capacity). */
const LIFE_SHAPE: BandName[] = [
  "money posture",
  "rootedness",
  "family gravity",
];

const GATE_QUESTIONS = {
  gender: /gender/i,
  interestedIn: /interested in/i,
  single: /\bsingle\b/i,
  ageBand: /\bage\b/i,
  wantsKids: /kids/i,
  riskPosture: /risk/i,
  exitHorizon: /exit|horizon/i,
  redlines: /redlines/i,
} as const;

/** Set by e2e/global-setup.ts; a missing value is a broken run, not a skip. */
function roomSlug(): string {
  const slug = process.env.E2E_ROOM_SLUG;
  if (!slug) {
    throw new Error(
      "E2E_ROOM_SLUG is not set. e2e/global-setup.ts creates the `e2e-<run>` " +
        "room these specs use; check that playwright.config.ts still " +
        "registers it."
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

const continueButton = (page: Page) =>
  page.getByRole("button", { name: /^continue$/i });

const backControl = (page: Page) =>
  page
    .getByRole("button", { name: /^back$/i })
    .or(page.getByRole("link", { name: /^back$/i }));

const nameField = (page: Page) => page.getByRole("textbox", { name: /name/i });
const photoInput = (page: Page) => page.getByLabel(/take or choose a photo/i);
const saveConsentButton = (page: Page) =>
  page.getByRole("button", { name: /save and continue/i });

/** #6's consent control: a switch by design, a checkbox without JavaScript. */
const lensSwitch = (page: Page, lens: RegExp) =>
  page
    .getByRole("switch", { name: lens })
    .or(page.getByRole("checkbox", { name: lens }));

const bandGroup = (page: Page, band: BandName) =>
  page.getByRole("radiogroup", { name: BAND_GROUPS[band] });

const bandOption = (page: Page, band: BandName, index: 0 | 1 | 2 | 3) =>
  bandGroup(page, band).getByRole("radio").nth(index);

/** The visible cap on the tag picker -- and how a test knows it is on it. */
const tagCounter = (page: Page) => page.getByText(/\b\d+\s*of\s*12\b/i);

const tagToggles = (page: Page) => page.getByRole("checkbox");

/**
 * A yes/no gate answer. "switch" is what the design asks for, "radiogroup with
 * a Yes" is what a no-JavaScript fallback degrades to, and both answer the only
 * question the criteria ask -- was this control answered.
 */
const yesNo = (page: Page, name: RegExp) =>
  page
    .getByRole("radiogroup", { name })
    .getByRole("radio", { name: /^\s*yes\s*$/i })
    .or(page.getByRole("switch", { name }))
    .or(page.getByRole("checkbox", { name }));

/** A fresh phone-sized context, signed in as a seeded participant. */
async function signedInContext(
  browser: Browser,
  testInfo: TestInfo,
  sessionToken: string
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
  });
  await signIn(context, sessionToken);
  return context;
}

/** 390 px wide: a screen a thumb has to pan sideways is a screen nobody finishes. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function tapBand(
  page: Page,
  band: BandName,
  index: 0 | 1 | 2 | 3
): Promise<void> {
  const option = bandOption(page, band, index);
  await option.click();
  await expect(option).toBeChecked();
}

/** Which of the six bands this screen is asking for, in a fixed order. */
async function visibleBands(page: Page): Promise<BandName[]> {
  const present: BandName[] = [];
  for (const band of BAND_NAMES) {
    if ((await bandGroup(page, band).count()) > 0) present.push(band);
  }
  return present;
}

/**
 * Answers whatever the current declared screen asks -- bands, tags or both --
 * and presses Continue, returning the bands it answered.
 *
 * It waits for what it answered to leave the screen rather than for a URL, so
 * the split into screens stays the implementation's business: the criteria fix
 * that Life Shape comes first and that a screen persists on Continue, not how
 * many screens there are.
 */
async function answerDeclaredScreen(page: Page): Promise<BandName[]> {
  await expect(stepHeading(page, 4)).toBeVisible();
  await expectNoHorizontalScroll(page);

  const bands = await visibleBands(page);
  for (const band of bands) {
    // 0..3 -- the band that was tapped is what gets stored (D6).
    await expect(bandGroup(page, band).getByRole("radio")).toHaveCount(4);
    await tapBand(page, band, 1);
  }

  const onTagScreen = (await tagCounter(page).count()) > 0;
  if (onTagScreen) {
    const tags = tagToggles(page);
    for (const index of [0, 1, 2]) {
      const tag = tags.nth(index);
      await tag.click();
      await expect(tag).toBeChecked();
    }
    await expect(tagCounter(page).first()).toHaveText(/\b3\s*of\s*12\b/i);
  }

  // A declared screen that asks nothing would make this loop meaningless.
  expect(bands.length + (onTagScreen ? 1 : 0)).toBeGreaterThan(0);

  await continueButton(page).click();

  for (const band of bands) await expect(bandGroup(page, band)).toHaveCount(0);
  if (onTagScreen) await expect(tagCounter(page)).toHaveCount(0);

  return bands;
}

/** Walks every declared screen from the current one to the end of the round. */
async function completeDeclaredRound(
  page: Page,
  onEachScreen?: (page: Page) => Promise<void>
): Promise<BandName[]> {
  await expect(stepHeading(page, 4)).toBeVisible();
  const answered = new Set<BandName>();

  // Bounded: six bands plus a tag screen cannot need more than seven screens,
  // and a loop that never ends is a worse failure than a red assertion.
  for (let screen = 0; screen < 7; screen++) {
    if ((await stepHeading(page, 4).count()) === 0) break;
    if (onEachScreen) await onEachScreen(page);
    for (const band of await answerDeclaredScreen(page)) answered.add(band);
  }

  return [...answered];
}

/** No gate question of either lens is on this page, under any role. */
async function expectNoGateQuestions(page: Page): Promise<void> {
  for (const question of [
    GATE_QUESTIONS.gender,
    GATE_QUESTIONS.interestedIn,
    GATE_QUESTIONS.riskPosture,
    GATE_QUESTIONS.redlines,
  ]) {
    for (const role of CONTROL_ROLES) {
      await expect(page.getByRole(role, { name: question })).toHaveCount(0);
    }
  }
}

/** The A8 sweep: nothing on this page asks a romantic question. */
async function expectNoRomanticQuestions(page: Page): Promise<void> {
  await expect(page.getByLabel(ROMANTIC_QUESTIONS)).toHaveCount(0);
  for (const role of CONTROL_ROLES) {
    await expect(
      page.getByRole(role, { name: ROMANTIC_QUESTIONS })
    ).toHaveCount(0);
  }
  await expect(page.getByText(/interested in|wants kids/i)).toHaveCount(0);
}

async function answerRomanticGate(page: Page): Promise<void> {
  await expect(stepHeading(page, 5)).toBeVisible();
  await expectNoHorizontalScroll(page);

  const gender = page
    .getByRole("radiogroup", { name: GATE_QUESTIONS.gender })
    .getByRole("radio")
    .first();
  await gender.click();
  await expect(gender).toBeChecked();

  // "Interested in" is a multi-select: at least one (docs/form-response.md §5).
  const interestedIn: Locator = page
    .getByRole("group", { name: GATE_QUESTIONS.interestedIn })
    .getByRole("checkbox")
    .first();
  await interestedIn.click();
  await expect(interestedIn).toBeChecked();

  await yesNo(page, GATE_QUESTIONS.single).click();

  const age = page
    .getByRole("radiogroup", { name: GATE_QUESTIONS.ageBand })
    .getByRole("radio");
  await expect(age).toHaveCount(4);
  await age.nth(1).click();

  await yesNo(page, GATE_QUESTIONS.wantsKids).click();

  await continueButton(page).click();
}

async function answerBusinessGate(page: Page): Promise<void> {
  await expect(stepHeading(page, 5)).toBeVisible();
  await expectNoHorizontalScroll(page);

  for (const question of [
    GATE_QUESTIONS.riskPosture,
    GATE_QUESTIONS.exitHorizon,
  ]) {
    const options = page
      .getByRole("radiogroup", { name: question })
      .getByRole("radio");
    // 0..2 here, not 0..3 (docs/domain.md §3).
    await expect(options).toHaveCount(3);
    await options.nth(1).click();
  }

  await yesNo(page, GATE_QUESTIONS.redlines).click();

  await continueButton(page).click();
}

test.describe("declared round and gates", () => {
  test("AC-1 · a participant taps six bands and three tags, answers both gates and lands on /quiz", async ({
    page,
    context,
  }) => {
    const ana = await seedParticipant({
      name: "Ana Ramírez",
      consent: { romantic: true, business: true, friendship: true },
    });
    await signIn(context, ana.sessionToken);

    await page.goto("/intake/declared");
    const answered = await completeDeclaredRound(page);
    expect([...answered].sort()).toEqual([...BAND_NAMES].sort());

    // Romantic first, then business -- the order consent was asked in.
    await answerRomanticGate(page);
    await answerBusinessGate(page);

    await expect(page).toHaveURL(/\/quiz$/);
  });

  test("AC-2 · closing the tab after Life Shape resumes on the next screen with the three taps preselected", async ({
    browser,
  }, testInfo) => {
    const cami = await seedParticipant({
      name: "Cami Ortiz",
      consent: { romantic: true, business: true, friendship: true },
    });

    const first = await signedInContext(browser, testInfo, cami.sessionToken);
    const firstPage = await first.newPage();
    await firstPage.goto("/intake/declared");
    await expect(stepHeading(firstPage, 4)).toBeVisible();

    await tapBand(firstPage, "money posture", 0);
    await tapBand(firstPage, "rootedness", 2);
    await tapBand(firstPage, "family gravity", 3);
    await continueButton(firstPage).click();
    await expect(bandGroup(firstPage, "money posture")).toHaveCount(0);
    expect(firstPage.url()).not.toMatch(/\/quiz|\/intake\/gates/);
    await first.close();

    // A new context with the same cookie: the phone that came back.
    const second = await signedInContext(browser, testInfo, cami.sessionToken);
    try {
      const page = await second.newPage();
      await page.goto("/intake/declared");
      await expect(stepHeading(page, 4)).toBeVisible();

      // The screen after Life Shape: the round resumed where it stopped.
      const bands = await visibleBands(page);
      const onTagScreen = (await tagCounter(page).count()) > 0;
      expect(bands.length + (onTagScreen ? 1 : 0)).toBeGreaterThan(0);
      for (const band of LIFE_SHAPE) expect(bands).not.toContain(band);

      // Back shows what was tapped, read from the rows rather than from state
      // this context never had.
      await backControl(page).click();
      await expect(bandGroup(page, "money posture")).toBeVisible();
      await expect(bandOption(page, "money posture", 0)).toBeChecked();
      await expect(bandOption(page, "rootedness", 2)).toBeChecked();
      await expect(bandOption(page, "family gravity", 3)).toBeChecked();

      // Half a declared round is not a finished one.
      expect(page.url()).not.toMatch(/\/quiz|\/intake\/gates/);
      await expectNoGateQuestions(page);
    } finally {
      await second.close();
    }
  });

  test("AC-3 · a friendship-only participant goes from the tag picker straight to /quiz without a gate screen", async ({
    page,
    context,
  }) => {
    const dana = await seedParticipant({
      name: "Dana Peña",
      consent: { friendship: true },
    });
    await signIn(context, dana.sessionToken);

    await page.goto("/intake/declared");
    const answered = await completeDeclaredRound(page, expectNoGateQuestions);
    expect([...answered].sort()).toEqual([...BAND_NAMES].sort());

    // Friendship has no gate (docs/form-response.md §5): the tags screen is the
    // last thing this participant answers before the quiz.
    await expect(page).toHaveURL(/\/quiz$/);
    await expectNoGateQuestions(page);
  });

  test('AC-4 · Continue with an untapped band stays on Life Shape, keeps the two taps and shows "pick one for each"', async ({
    page,
    context,
  }) => {
    const elena = await seedParticipant({
      name: "Elena Ruiz",
      consent: { friendship: true },
    });
    await signIn(context, elena.sessionToken);

    await page.goto("/intake/declared");
    await expect(stepHeading(page, 4)).toBeVisible();

    await tapBand(page, "money posture", 1);
    await tapBand(page, "rootedness", 2);
    await continueButton(page).click();

    await expect(page.getByText(/pick one for each/i).first()).toBeVisible();
    await expect(stepHeading(page, 4)).toBeVisible();
    await expect(bandGroup(page, "money posture")).toBeVisible();
    await expect(bandOption(page, "money posture", 1)).toBeChecked();
    await expect(bandOption(page, "rootedness", 2)).toBeChecked();
    await expect(
      bandGroup(page, "family gravity").getByRole("radio", { checked: true })
    ).toHaveCount(0);

    // Nothing was persisted, so the round still starts at Life Shape.
    const second = await context.newPage();
    await second.goto("/intake/declared");
    await expect(stepHeading(second, 4)).toBeVisible();
    await expect(bandGroup(second, "money posture")).toBeVisible();
  });

  test("AC-10 · saving consent lands on Step 4 of 5, reopening /intake resumes there, and a photo-less session is sent back to Step 2 of 5", async ({
    page,
    context,
    browser,
  }, testInfo) => {
    const slug = roomSlug();

    // Steps 1-3 through the real screens; this criterion seeds nothing.
    await page.goto(intakeUrl(slug));
    await expect(stepHeading(page, 1)).toBeVisible();
    await nameField(page).fill("Ana Ramírez");
    await continueButton(page).click();

    await expect(stepHeading(page, 2)).toBeVisible();
    await photoInput(page).setInputFiles(FIXTURE_PHOTO);
    await continueButton(page).click();

    await expect(stepHeading(page, 3)).toBeVisible();
    await lensSwitch(page, /friendship/i).click();
    await saveConsentButton(page).click();

    // The hand-off #6 deferred: consent ends in the declared round, not on a
    // done screen (docs/domain.md §0 `consent -> declared round`).
    await expect(page).toHaveURL(/\/intake\/declared$/);
    await expect(stepHeading(page, 4)).toBeVisible();
    await expect(page.getByText(/you['’]re in/i)).toHaveCount(0);

    await tapBand(page, "money posture", 1);
    await tapBand(page, "rootedness", 1);
    await tapBand(page, "family gravity", 1);
    await continueButton(page).click();
    await expect(bandGroup(page, "money posture")).toHaveCount(0);

    // /intake reads the step from the rows: a band is set, so it is step 4's
    // problem now -- not the consent step's.
    const second = await context.newPage();
    await second.goto(intakeUrl(slug));
    await expect(second).toHaveURL(/\/intake\/declared/);
    await expect(stepHeading(second, 4)).toBeVisible();
    await expect(bandGroup(second, "money posture")).toHaveCount(0);
    await expect(saveConsentButton(second)).toHaveCount(0);
    await expect(second.getByText(/you['’]re in/i)).toHaveCount(0);

    // A different phone that registered but never uploaded a photo: the floor
    // sends it back to step 2 and shows it no band at all.
    const other = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: testInfo.project.use.viewport,
    });
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(intakeUrl(slug));
      await nameField(otherPage).fill("Cami Ortiz");
      await continueButton(otherPage).click();
      await expect(stepHeading(otherPage, 2)).toBeVisible();

      await otherPage.goto("/intake/declared");
      await expect(otherPage).toHaveURL(/\/intake(\?[^/]*)?$/);
      await expect(stepHeading(otherPage, 2)).toBeVisible();
      for (const band of BAND_NAMES) {
        await expect(bandGroup(otherPage, band)).toHaveCount(0);
      }
    } finally {
      await other.close();
    }
  });
});

test.describe("safety invariants", () => {
  // kind: safety. Asking is a disclosure event (PILLARS.md A8, docs/domain.md
  // D5): gender, interested in, single, age band and wants kids are asked only
  // of a participant who consented to the romantic lens. Beto consented to
  // business only, so no route -- reached by Continue or typed into the bar --
  // may put a romantic question in front of him.
  test("AC-7 · romantic gate questions are never shown to a participant without romantic consent", async ({
    page,
    context,
  }) => {
    const beto = await seedParticipant({
      name: "Beto Díaz",
      consent: { business: true, romantic: false },
      declared: "complete",
    });
    await signIn(context, beto.sessionToken);

    // The declared round is done (`declared_at` is set), so step 4 forwards to
    // the gates, and the only consented lens is business.
    await page.goto("/intake/declared");
    await expect(page).toHaveURL(/\/intake\/gates\/business$/);
    await expect(stepHeading(page, 5)).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: GATE_QUESTIONS.riskPosture })
    ).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: GATE_QUESTIONS.exitHorizon })
    ).toBeVisible();
    await expect(yesNo(page, GATE_QUESTIONS.redlines)).toBeVisible();
    await expectNoRomanticQuestions(page);

    // Typed into the address bar with the business gate still unanswered: the
    // refusal is the route's, and it happens before a single control renders.
    await page.goto("/intake/gates/romantic");
    await expect(page).toHaveURL(/\/intake\/gates\/business$/);
    await expectNoRomanticQuestions(page);

    for (const path of STEP_PATHS) {
      await page.goto(path);
      await expectNoRomanticQuestions(page);
    }
  });
});
