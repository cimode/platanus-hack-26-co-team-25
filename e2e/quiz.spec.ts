import { expect, type Locator, type Page, test } from "@playwright/test";
import type { OptionKey } from "../src/lib/domain/quiz";
import { shownOrderFor } from "../src/lib/domain/quiz/shown-order";
import {
  createQuizParticipant,
  type QuizParticipant,
} from "./helpers/quiz-participant";

/**
 * The quiz on a phone: twelve forced-choice blocks, one tap each (issue #9,
 * style "B · Diálogo").
 *
 *     /quiz opening -> block 1 ... block 12 -> quiz_completed_at -> /results
 *
 * Under docs/domain.md D21 every participant answers their own twelve blocks
 * of the committed bank, dealt by `formFor(participantId)` and stored as their
 * `generated_blocks` rows the moment they register. The fixture
 * (e2e/helpers/quiz-participant.ts) writes exactly what registration would --
 * the same twelve blocks, `source: "bank"` -- so every scenario and option
 * text the assertions look for is *that participant's* stored block, and no
 * model is called anywhere in this suite or in the app behind it.
 *
 * ONE CRITERION IS GONE ON PURPOSE. AC-8 used to seed a partial form and
 * assert that a participant who outran the writer met a "writing your
 * questions" screen rather than an error. There is no writer any more, and no
 * way to hold a participant whose next block is not stored: the form is dealt
 * from a committed file in one INSERT before the redirect, and a read that
 * still found a gap re-assigns it. The criterion described a state that can no
 * longer exist, so it was deleted rather than rewritten -- what remains of it
 * is `WRITING`, asserted absent, so the state cannot come back unnoticed.
 *
 * Single pick is the product default (`src/app/quiz/single-pick.ts`): a tap
 * on an option IS the answer, there is no "Siguiente", and the sprite reacts.
 * These criteria describe that mode; a server started with
 * `HOOKAI_QUIZ_MOST_LEAST=1` is a different elicitation and fails AC-1 on
 * purpose.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844); the viewport assertions read the size
 * from the page rather than hard-coding it, so the same test is meaningful on
 * the desktop project.
 *
 * The `kind: safety` criterion (AC-7) is never skipped and never conditional:
 * it walks every screen of the quiz and asserts that none of them, in text or
 * in served HTML, names a pillar, a keying direction or the focus pillar.
 */

// Exactly one option per block is reversed-keyed, every option belongs to one
// of the four pillars, and every stored block carries its focus pillar
// (PILLARS.md §8 rule 1, AUDIT.md F1, generated_blocks.focus_pillar). None of
// that may ever reach the browser -- not as text, not as a serialized prop.
const PILLAR_OR_KEYING =
  /regulation|politeness|reliability|agency|reversed|positive|focusPillar/i;

/** The mark a tapped row carries (docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md §4). */
const MOST = /más yo/i;

/** The batch beats that used to pace the quiz. They must never come back. */
const BEAT = /tanda\s*\d\s*de\s*3/i;

/** The wait screen D21 deleted along with live generation. Nor may this. */
const WRITING = /escribiendo tus preguntas/i;

/** `BLOCK_COUNT` — the whole form, spelled out so a drift is a failing test. */
const BLOCKS = 12;

/** `FLOW_TOTAL_STEPS` — 1 registration + 12 blocks. */
const TOTAL_STEPS = 13;

/**
 * The mono counter, e.g. "6/12". Bounded by non-digits so "1/12" cannot be
 * satisfied by "11/12".
 */
function counter(page: Page, position: number): Locator {
  return page.getByText(
    new RegExp(`(^|[^0-9])${position}\\s*/\\s*${BLOCKS}([^0-9]|$)`)
  );
}

/** One option row. Its accessible name is the option text (D14: the row *is* its text). */
function option(page: Page, text: string): Locator {
  return page.getByRole("button", { name: text });
}

const nextButton = (page: Page) =>
  page.getByRole("button", { name: /siguiente/i });
const finishButton = (page: Page) =>
  page.getByRole("button", { name: /terminar/i });
const backControl = (page: Page) =>
  page
    .getByRole("link", { name: /^atrás$/i })
    .or(page.getByRole("button", { name: /^atrás$/i }));
const startControl = (page: Page) =>
  page
    .getByRole("link", { name: /^empezar$/i })
    .or(page.getByRole("button", { name: /^empezar$/i }));
/** The participant's own sprite, on every quiz screen. */
const avatar = (page: Page) => page.getByRole("img", { name: /tu avatar/i });

/** The row for one key of the block at `position`, by its stored text. */
function optionFor(
  page: Page,
  participant: QuizParticipant,
  position: number,
  key: OptionKey
): Locator {
  return option(page, participant.optionText(position, key));
}

/**
 * Answer the block on screen with one tap. The tap is the submit: the island
 * marks the row, lets the sprite react and posts the form itself.
 */
async function tap(
  page: Page,
  participant: QuizParticipant,
  position: number,
  key: OptionKey = "a"
): Promise<void> {
  await expect(counter(page, position)).toBeVisible();
  await optionFor(page, participant, position, key).click();
}

/** Every row of the block at `position` is on screen, labelled by its text. */
async function expectOptionsOf(
  page: Page,
  participant: QuizParticipant,
  position: number
): Promise<void> {
  for (const text of participant.optionTexts(position)) {
    await expect(option(page, text)).toBeVisible();
  }
}

/** Through the opening moment onto block 1. */
async function start(page: Page): Promise<void> {
  await page.goto("/quiz");
  await expect(startControl(page)).toBeVisible();
  await startControl(page).click();
  await expect(counter(page, 1)).toBeVisible();
}

test.describe("quiz", () => {
  test('AC-1 · "Empezar" opens the participant\'s stored block 1 with its scenario, its four option texts as tappable rows, "1/12", no "Siguiente", no "Atrás", every row inside the viewport and no page scroll', async ({
    page,
  }) => {
    const participant = await createQuizParticipant({
      context: page.context(),
    });

    await start(page);

    // The scenario is the one dealt to THIS participant and stored for them.
    const block = participant.blockAt(1);
    expect(block.scenario.length).toBeGreaterThan(10);
    await expect(page.getByText(block.scenario)).toBeVisible();
    await expectOptionsOf(page, participant, 1);

    await expect(counter(page, 1)).toBeVisible();
    // One tap is the answer: there is nothing to press afterwards.
    await expect(nextButton(page)).toHaveCount(0);
    await expect(finishButton(page)).toHaveCount(0);
    await expect(backControl(page)).toHaveCount(0);

    // §7.1: a below-the-fold row is measurement error. The mobile project's
    // viewport is 390x844 (playwright.config.ts).
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const text of participant.optionTexts(1)) {
      const box = await option(page, text).boundingBox();
      expect(box, `no box for row "${text}"`).not.toBeNull();
      const { x, y, width, height } = box ?? {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(viewport?.width ?? 0);
      expect(y + height).toBeLessThanOrEqual(viewport?.height ?? 0);
    }
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight
    );
    expect(scrolls).toBe(false);
  });

  test('AC-2 · one tap marks the row "Más yo" and writes one row at position 1 with that key, no least and shown_order = shownOrderFor(participantId, 1), then shows the participant\'s block 2 as "2/12"', async ({
    page,
  }) => {
    const participant = await createQuizParticipant({
      context: page.context(),
    });

    await start(page);

    // Whatever option "c" of *this* participant's block 1 says.
    const mostText = participant.optionText(1, "c");

    await option(page, mostText).click();
    // The press reads before the form goes: the row is marked, then the
    // next block arrives.
    await expect(option(page, mostText)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(counter(page, 2)).toBeVisible();
    await expect(page.getByText(participant.blockAt(2).scenario)).toBeVisible();

    const rows = await participant.responses();
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(1);
    expect(rows[0].mostKey).toBe("c");
    expect(rows[0].leastKey).toBeNull();
    expect(rows[0].shownOrder).toBe(
      shownOrderFor(participant.participantId, 1)
    );
    expect([...rows[0].shownOrder].sort().join("")).toBe("abcd");
  });

  test("AC-3 · a context without a dipia_session cookie lands on /intake with no scenario and no quiz_responses row", async ({
    page,
    browser,
  }) => {
    // The room exists and holds a fully seeded participant -- on another
    // phone. This context has no cookie at all.
    const owner = await browser.newContext();
    try {
      const participant = await createQuizParticipant({ context: owner });

      await page.goto("/quiz");
      await expect(page).toHaveURL(/\/intake/);
      await expect(page.getByText(participant.blockAt(1).scenario)).toHaveCount(
        0
      );
      for (const text of participant.optionTexts(1)) {
        await expect(page.getByText(text)).toHaveCount(0);
      }

      expect(await participant.responsesInRoom()).toHaveLength(0);
    } finally {
      await owner.close();
    }
  });

  test('AC-4 · twelve taps walk the participant\'s form with no "Tanda" beat and no wait screen anywhere, set quiz_completed_at, land on /results "Listo" and leave exactly 12 generated_blocks rows', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const participant = await createQuizParticipant({
      context: page.context(),
    });
    expect(await participant.completedAt()).toBeNull();

    await start(page);

    for (let position = 1; position <= BLOCKS; position++) {
      await expectOptionsOf(page, participant, position);
      await expect(page.getByText(BEAT)).toHaveCount(0);
      await expect(page.getByText(WRITING)).toHaveCount(0);
      await tap(page, participant, position);
      if (position < BLOCKS) {
        await expect(counter(page, position + 1)).toBeVisible();
        await expect(page.getByText(BEAT)).toHaveCount(0);
        await expect(page.getByText(WRITING)).toHaveCount(0);
      }
    }

    await expect(page).toHaveURL(/\/results/);
    await expect(page.getByRole("heading", { name: /listo/i })).toBeVisible();

    expect(await participant.responses()).toHaveLength(BLOCKS);
    expect(await participant.storedBlocks()).toHaveLength(BLOCKS);
    expect(await participant.completedAt()).not.toBeNull();

    // Completed means completed: /quiz never serves a block again.
    await page.goto("/quiz");
    await expect(page).toHaveURL(/\/results/);
    await expect(counter(page, BLOCKS)).toHaveCount(0);
  });

  test('AC-5 · "Atrás" and ?block=3 re-answer an earlier block of the participant\'s form in place and return straight to block 8; ?block=12 is clamped to block 8', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const participant = await createQuizParticipant({
      context: page.context(),
      answered: 7,
    });

    // Resume: the frontier is 8, with nothing in front of it.
    await page.goto("/quiz");
    await expect(counter(page, 8)).toBeVisible();
    await expect(page.getByText(BEAT)).toHaveCount(0);

    // One step back, rendered pre-marked from the stored row.
    await expect(backControl(page)).toBeVisible();
    await backControl(page).click();
    await expect(counter(page, 7)).toBeVisible();
    await expect(optionFor(page, participant, 7, "a")).toContainText(MOST);
    await expect(optionFor(page, participant, 7, "a")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await tap(page, participant, 7, "c");

    // Straight back to the frontier: not 8 by arithmetic, but by the rows.
    await expect(counter(page, 8)).toBeVisible();
    let rows = await participant.responses();
    expect(rows.filter((row) => row.position === 7)).toHaveLength(1);
    const atSeven = rows.find((row) => row.position === 7);
    expect(atSeven?.mostKey).toBe("c");
    expect(atSeven?.leastKey).toBeNull();

    // ?block=N renders an already-answered block of this participant's form.
    await page.goto("/quiz?block=3");
    await expect(counter(page, 3)).toBeVisible();
    await expect(page.getByText(participant.blockAt(3).scenario)).toBeVisible();
    await expect(optionFor(page, participant, 3, "a")).toContainText(MOST);

    await tap(page, participant, 3, "d");

    // No walk through 4..7 on the way back.
    await expect(counter(page, 8)).toBeVisible();
    await expect(counter(page, 4)).toHaveCount(0);
    await expect(page.getByText(BEAT)).toHaveCount(0);

    rows = await participant.responses();
    expect(rows).toHaveLength(7);
    const atThree = rows.find((row) => row.position === 3);
    expect(atThree?.mostKey).toBe("d");

    // Nobody jumps ahead: ?block is clamped to the frontier.
    await page.goto("/quiz?block=12");
    await expect(counter(page, 8)).toBeVisible();
    await expect(counter(page, 12)).toHaveCount(0);
    await expect(page.getByText(participant.blockAt(12).scenario)).toHaveCount(
      0
    );
  });

  test("AC-6 · the flow's progress bar sits beside the counter as a progressbar over 13 steps, at 1 + position, and moves with each tap", async ({
    page,
  }) => {
    const participant = await createQuizParticipant({
      context: page.context(),
    });

    await start(page);

    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuemax", String(TOTAL_STEPS));
    await expect(bar).toHaveAttribute("aria-valuenow", "2");

    // Counter and bar describe the same moment: both on screen together.
    await expect(counter(page, 1)).toBeVisible();

    await tap(page, participant, 1);
    await expect(counter(page, 2)).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuenow", "3");
    await expect(bar).toHaveAttribute("aria-valuemax", String(TOTAL_STEPS));
  });

  test("AC-9 · the participant's avatar is drawn on the opening moment and on the block, from the stored plate under /sprites/", async ({
    page,
  }) => {
    await createQuizParticipant({ context: page.context() });

    await page.goto("/quiz");
    await expect(startControl(page)).toBeVisible();
    await expect(avatar(page)).toBeVisible();

    await startControl(page).click();
    await expect(counter(page, 1)).toBeVisible();
    await expect(avatar(page)).toBeVisible();
    expect(await drawsFromSprites(avatar(page))).toBe(true);
  });
});

/**
 * Whether the element draws a file under `/sprites/` -- as an `<img src>` or
 * as the background image the emotes library paints the plate with.
 */
function drawsFromSprites(element: Locator): Promise<boolean> {
  return element.evaluate((node) => {
    const src = node.querySelector("img")?.getAttribute("src") ?? "";
    const backgrounds = [node, ...node.querySelectorAll("*")]
      .map((child) => getComputedStyle(child).backgroundImage)
      .join(" ");
    return `${src} ${backgrounds}`.includes("/sprites/");
  });
}

test.describe("safety invariants", () => {
  // kind: safety. Exactly one option per block is reversed-keyed, each belongs
  // to a pillar and each stored block names its focus pillar; nothing rendered
  // -- DOM text, alt text, the RSC payload serialized into the HTML -- may say
  // which (PILLARS.md §8 rule 1, AUDIT.md F1,
  // CLAUDE_DESIGN_QUIZ_BLOCK.md §3). Walked over every screen of the quiz:
  // the opening moment and all twelve blocks.
  test("AC-7 · no quiz screen names a pillar, a keying direction or the block's focus pillar, in its text or in its served HTML", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const participant = await createQuizParticipant({ context });
    const captured: { where: string; html: string }[] = [];

    const capture = async (where: string) => {
      captured.push({ where, html: await page.content() });
    };
    // The server's own bytes, not just the hydrated DOM: a leak hides in the
    // RSC payload as readily as in the markup.
    const captureServed = async (where: string, path: string) => {
      const response = await context.request.get(path);
      captured.push({ where, html: await response.text() });
    };

    await page.goto("/quiz");
    await expect(startControl(page)).toBeVisible();
    await capture("opening moment");
    await captureServed("opening moment (served)", "/quiz");
    await startControl(page).click();

    for (let position = 1; position <= BLOCKS; position++) {
      await expect(counter(page, position)).toBeVisible();
      await expectOptionsOf(page, participant, position);
      await capture(`block ${position}`);
      if (position === 1 || position === 5 || position === 9) {
        await captureServed(`block ${position} (served)`, "/quiz?start=1");
      }

      await tap(page, participant, position);
    }

    await expect(page).toHaveURL(/\/results/);
    // 1 opening + 1 served opening + 12 blocks + 3 served blocks.
    expect(captured.length).toBeGreaterThanOrEqual(17);
    for (const { where, html } of captured) {
      expect(html, `${where} names a pillar or a keying`).not.toMatch(
        PILLAR_OR_KEYING
      );
    }
  });
});
