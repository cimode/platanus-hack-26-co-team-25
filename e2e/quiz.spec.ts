import { expect, type Locator, type Page, test } from "@playwright/test";
import type { OptionKey } from "../src/lib/domain/quiz";
import { shownOrderFor } from "../src/lib/domain/quiz/shown-order";
import {
  createQuizParticipant,
  type QuizParticipant,
} from "./helpers/quiz-participant";

/**
 * The quiz on a phone: fifteen forced-choice blocks in three
 * batches (issue #9).
 *
 *     /quiz opening -> blocks 1-5 -> "Tanda 2 de 3" -> blocks 6-10
 *       -> "Tanda 3 de 3" -> blocks 11-15 -> quiz_completed_at -> /results
 *
 * Under docs/domain.md D16 every participant answers their own generated
 * form, read from `generated_blocks` through `ensureQuizBatch` -- never the
 * `INSTRUMENT` constant. The fixture (e2e/helpers/quiz-participant.ts) seeds
 * the participant's 15 rows directly through
 * `GeneratedBlockRepository.saveBatch` with the fallback constant's blocks,
 * so no model is ever called here, and every scenario and option text the
 * assertions look for is *that participant's* stored block.
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

/** The two marks a card can carry (docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md §4). */
const MOST = /más yo/i;
const LEAST = /menos yo/i;

/** Any batch beat: "Tanda 2 de 3" / "Tanda 3 de 3". */
const BEAT = /tanda\s*\d\s*de\s*3/i;

const KEYS: OptionKey[] = ["a", "b", "c", "d"];

/**
 * The mono counter, e.g. "6/15". Bounded by non-digits so "1/15" cannot be
 * satisfied by "11/15".
 */
function counter(page: Page, position: number): Locator {
  return page.getByText(
    new RegExp(`(^|[^0-9])${position}\\s*/\\s*15([^0-9]|$)`)
  );
}

/**
 * One option card. Its accessible name is the option text (D14: the card *is*
 * its text). Either role is accepted -- "button" is what a tappable card
 * degrades to, "radio" is the semantic a no-JavaScript fallback would use.
 */
function card(page: Page, text: string): Locator {
  return page
    .getByRole("button", { name: text })
    .or(page.getByRole("radio", { name: text }));
}

const nextButton = (page: Page) =>
  page.getByRole("button", { name: /^siguiente$/i });
const finishButton = (page: Page) =>
  page.getByRole("button", { name: /^terminar$/i });
const backControl = (page: Page) =>
  page
    .getByRole("link", { name: /^atrás$/i })
    .or(page.getByRole("button", { name: /^atrás$/i }));
const startControl = (page: Page) =>
  page
    .getByRole("link", { name: /^empezar$/i })
    .or(page.getByRole("button", { name: /^empezar$/i }));
const continueControl = (page: Page) =>
  page
    .getByRole("link", { name: /^seguir$/i })
    .or(page.getByRole("button", { name: /^seguir$/i }));

/** The card for one key of the block at `position`, by its stored text. */
function cardFor(
  page: Page,
  participant: QuizParticipant,
  position: number,
  key: OptionKey
): Locator {
  return card(page, participant.optionText(position, key));
}

/**
 * Put "Más yo" on `most` and "Menos yo" on `least`, whatever is marked now.
 *
 * Tapping a marked card clears that mark, so an already-answered block is
 * cleared first -- least before most, the order the elicitation defines.
 */
async function mark(
  page: Page,
  participant: QuizParticipant,
  position: number,
  most: OptionKey,
  least: OptionKey
): Promise<void> {
  for (const pattern of [LEAST, MOST]) {
    for (const key of KEYS) {
      const target = cardFor(page, participant, position, key);
      const text = (await target.textContent()) ?? "";
      if (pattern.test(text)) await target.click();
    }
  }
  await cardFor(page, participant, position, most).click();
  await cardFor(page, participant, position, least).click();
}

/** Mark most + least on the block on screen and submit it. */
async function answerBlockOnScreen(
  page: Page,
  participant: QuizParticipant,
  position: number,
  most: OptionKey = "a",
  least: OptionKey = "b"
): Promise<void> {
  await expect(counter(page, position)).toBeVisible();
  await mark(page, participant, position, most, least);
  const submit = position === 15 ? finishButton(page) : nextButton(page);
  await expect(submit).toBeEnabled();
  await submit.click();
}

/** Every card of the block at `position` is on screen, labelled by its text. */
async function expectCardsOf(
  page: Page,
  participant: QuizParticipant,
  position: number
): Promise<void> {
  for (const text of participant.optionTexts(position)) {
    await expect(card(page, text)).toBeVisible();
  }
}

test.describe("quiz", () => {
  test('AC-1 · "Empezar" opens the participant\'s seeded block 1 with its scenario, its four option texts as card labels, "1/15", a disabled "Siguiente", no "Atrás" and all four cards inside 390×844', async ({
    page,
    context,
  }) => {
    const participant = await createQuizParticipant({ context });

    await page.goto("/quiz");
    await expect(startControl(page)).toBeVisible();
    await startControl(page).click();

    // The scenario is the one seeded for THIS participant.
    const block = participant.blockAt(1);
    expect(block.scenario).toBe(
      "Tu amigo movió la perilla del horno y el pollo lleva una hora crudo. " +
        "Los invitados ya están tocando el timbre."
    );
    await expect(page.getByText(block.scenario)).toBeVisible();
    await expectCardsOf(page, participant, 1);

    await expect(counter(page, 1)).toBeVisible();
    await expect(nextButton(page)).toBeVisible();
    await expect(nextButton(page)).toBeDisabled();
    await expect(backControl(page)).toHaveCount(0);

    // §7.1: a below-the-fold bottom row is measurement error. The mobile
    // project's viewport is 390x844 (playwright.config.ts).
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const text of participant.optionTexts(1)) {
      const box = await card(page, text).boundingBox();
      expect(box, `no box for card "${text}"`).not.toBeNull();
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

  test('AC-2 · a tap marks "Más yo", a re-tap clears it, a second card takes "Menos yo", and "Siguiente" writes one row at position 1 with most c, least d and shown_order = shownOrderFor(participantId, 1), then shows the participant\'s block 2 as "2/15"', async ({
    page,
    context,
  }) => {
    const participant = await createQuizParticipant({ context });

    await page.goto("/quiz");
    await expect(startControl(page)).toBeVisible();
    await startControl(page).click();
    await expect(counter(page, 1)).toBeVisible();

    const mostText = participant.optionText(1, "c");
    const leastText = participant.optionText(1, "d");
    expect(mostText).toBe("Tomo el mando: pedimos pizza y listo");
    expect(leastText).toBe("Culpo a la perilla, nunca a mi amigo");

    // First tap: "Más yo", and advance stays shut.
    await card(page, mostText).click();
    await expect(card(page, mostText)).toContainText(MOST);
    await expect(nextButton(page)).toBeDisabled();

    // Second tap on the same card: the mark is gone, and no card took "Menos yo".
    await card(page, mostText).click();
    for (const text of participant.optionTexts(1)) {
      await expect(card(page, text)).not.toContainText(MOST);
      await expect(card(page, text)).not.toContainText(LEAST);
    }

    // Third tap: "Más yo" again.
    await card(page, mostText).click();
    await expect(card(page, mostText)).toContainText(MOST);

    // A different card takes "Menos yo"; both marks placed enables advance.
    await card(page, leastText).click();
    await expect(card(page, leastText)).toContainText(LEAST);
    await expect(card(page, mostText)).toContainText(MOST);
    await expect(card(page, leastText)).not.toContainText(MOST);
    await expect(nextButton(page)).toBeEnabled();

    await nextButton(page).click();
    await expect(counter(page, 2)).toBeVisible();
    await expect(page.getByText(participant.blockAt(2).scenario)).toBeVisible();

    const rows = await participant.responses();
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(1);
    expect(rows[0].mostKey).toBe("c");
    expect(rows[0].leastKey).toBe("d");
    expect(rows[0].shownOrder).toBe(
      shownOrderFor(participant.participantId, 1)
    );
    expect([...rows[0].shownOrder].sort().join("")).toBe("abcd");
  });

  test("AC-3 · a context without a hookai_session cookie lands on /intake with no scenario and no quiz_responses row", async ({
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
      await expect(nextButton(page)).toHaveCount(0);
      await expect(finishButton(page)).toHaveCount(0);
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

  test('AC-4 · block 5 opens "Tanda 2 de 3" with "Seguir" and no option text, "Seguir" shows the participant\'s block 6 as "6/15", no beat appears between 6 and 10, block 10 opens "Tanda 3 de 3" onto block 11, and the participant keeps ten rows and exactly 15 generated_blocks rows', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const participant = await createQuizParticipant({ context, answered: 4 });

    // Position 5 opens no batch, so the resume lands straight on the block.
    await page.goto("/quiz");
    await expect(counter(page, 5)).toBeVisible();
    await answerBlockOnScreen(page, participant, 5);

    // The beat: a moment, not a block.
    await expect(page.getByText("Tanda 2 de 3")).toBeVisible();
    await expect(continueControl(page)).toBeVisible();
    await expect(page.getByText(participant.blockAt(5).scenario)).toHaveCount(
      0
    );
    await expect(page.getByText(participant.blockAt(6).scenario)).toHaveCount(
      0
    );
    for (const text of participant.optionTexts(6)) {
      await expect(page.getByText(text)).toHaveCount(0);
    }

    await continueControl(page).click();
    await expect(counter(page, 6)).toBeVisible();
    await expectCardsOf(page, participant, 6);

    // Inside a batch, "Siguiente" shows the next block directly.
    for (const position of [6, 7, 8, 9]) {
      await answerBlockOnScreen(page, participant, position);
      await expect(counter(page, position + 1)).toBeVisible();
      await expect(page.getByText(BEAT)).toHaveCount(0);
    }

    await answerBlockOnScreen(page, participant, 10);
    await expect(page.getByText("Tanda 3 de 3")).toBeVisible();
    await expect(continueControl(page)).toBeVisible();
    await continueControl(page).click();
    await expect(counter(page, 11)).toBeVisible();
    await expectCardsOf(page, participant, 11);

    expect(await participant.responses()).toHaveLength(10);
    expect(await participant.storedBlocks()).toHaveLength(15);
  });

  test('AC-5 · "Atrás" and ?block=3 re-answer an earlier block of the participant\'s form in place and return straight to block 8; ?block=12 is clamped to block 8', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const participant = await createQuizParticipant({ context, answered: 7 });

    // Resume: the frontier is 8, which opens no batch.
    await page.goto("/quiz");
    await expect(counter(page, 8)).toBeVisible();
    await expect(page.getByText(BEAT)).toHaveCount(0);

    // One step back, rendered pre-marked from the stored row.
    await expect(backControl(page)).toBeVisible();
    await backControl(page).click();
    await expect(counter(page, 7)).toBeVisible();
    await expect(cardFor(page, participant, 7, "a")).toContainText(MOST);
    await expect(cardFor(page, participant, 7, "b")).toContainText(LEAST);

    await mark(page, participant, 7, "c", "a");
    await nextButton(page).click();

    // Straight back to the frontier: not 8 by arithmetic, but by the rows.
    await expect(counter(page, 8)).toBeVisible();
    let rows = await participant.responses();
    expect(rows.filter((row) => row.position === 7)).toHaveLength(1);
    const atSeven = rows.find((row) => row.position === 7);
    expect(atSeven?.mostKey).toBe("c");
    expect(atSeven?.leastKey).toBe("a");

    // ?block=N renders an already-answered block of this participant's form.
    await page.goto("/quiz?block=3");
    await expect(counter(page, 3)).toBeVisible();
    await expect(page.getByText(participant.blockAt(3).scenario)).toBeVisible();
    await expect(cardFor(page, participant, 3, "a")).toContainText(MOST);
    await expect(cardFor(page, participant, 3, "b")).toContainText(LEAST);

    await mark(page, participant, 3, "d", "a");
    await nextButton(page).click();

    // No walk through 4..7, and no beat on the way.
    await expect(counter(page, 8)).toBeVisible();
    await expect(counter(page, 4)).toHaveCount(0);
    await expect(page.getByText(BEAT)).toHaveCount(0);

    rows = await participant.responses();
    expect(rows).toHaveLength(7);
    const atThree = rows.find((row) => row.position === 3);
    expect(atThree?.mostKey).toBe("d");
    expect(atThree?.leastKey).toBe("a");

    // Nobody jumps ahead: ?block is clamped to the frontier.
    await page.goto("/quiz?block=12");
    await expect(counter(page, 8)).toBeVisible();
    await expect(counter(page, 12)).toHaveCount(0);
    await expect(page.getByText(participant.blockAt(12).scenario)).toHaveCount(
      0
    );
  });

  test('AC-6 · the participant\'s block 15 is shown directly with "15/15" and "Terminar", which sets quiz_completed_at, lands on /results "Listo" and sends /quiz there afterwards', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const participant = await createQuizParticipant({ context, answered: 14 });
    expect(await participant.completedAt()).toBeNull();

    await page.goto("/quiz");
    await expect(counter(page, 15)).toBeVisible();
    await expect(
      page.getByText(participant.blockAt(15).scenario)
    ).toBeVisible();
    // Position 15 opens no batch, so there is no beat to dismiss.
    await expect(page.getByText(BEAT)).toHaveCount(0);
    await expect(continueControl(page)).toHaveCount(0);
    await expect(finishButton(page)).toBeVisible();
    await expect(nextButton(page)).toHaveCount(0);

    await answerBlockOnScreen(page, participant, 15);

    await expect(page).toHaveURL(/\/results/);
    await expect(page.getByRole("heading", { name: /listo/i })).toBeVisible();

    expect(await participant.responses()).toHaveLength(15);
    expect(await participant.completedAt()).not.toBeNull();

    // Completed means completed: /quiz never serves a block again.
    await page.goto("/quiz");
    await expect(page).toHaveURL(/\/results/);
    await expect(page.getByRole("heading", { name: /listo/i })).toBeVisible();
    await expect(counter(page, 15)).toHaveCount(0);
  });
});

test.describe("safety invariants", () => {
  // kind: safety. Exactly one option per block is reversed-keyed, each belongs
  // to a pillar and each stored block names its focus pillar; nothing rendered
  // -- DOM text, alt text, the RSC payload serialized into the HTML -- may say
  // which (PILLARS.md §8 rule 1, AUDIT.md F1,
  // CLAUDE_DESIGN_QUIZ_BLOCK.md §3). Walked over every screen of the quiz:
  // the opening moment, all fifteen blocks and both batch beats.
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

    for (let position = 1; position <= 15; position++) {
      await expect(counter(page, position)).toBeVisible();
      await expectCardsOf(page, participant, position);
      await capture(`block ${position}`);
      if (position === 1 || position === 6 || position === 11) {
        await captureServed(`block ${position} (served)`, "/quiz?start=1");
      }

      await answerBlockOnScreen(page, participant, position);

      if (position === 5 || position === 10) {
        await expect(page.getByText(BEAT)).toBeVisible();
        await capture(`beat after ${position}`);
        await captureServed(`beat after ${position} (served)`, "/quiz");
        await continueControl(page).click();
      }
    }

    await expect(page).toHaveURL(/\/results/);
    expect(captured.length).toBeGreaterThanOrEqual(18);
    for (const { where, html } of captured) {
      expect(html, `${where} names a pillar or a keying`).not.toMatch(
        PILLAR_OR_KEYING
      );
    }
  });
});
