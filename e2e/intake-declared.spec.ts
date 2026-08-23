import { expect, type Page, test } from "@playwright/test";
import { seedParticipant, signIn } from "./fixtures/intake-declared";

/**
 * The declared round on a phone (issue #8, reshaped by #42).
 *
 *     registration -> /intake/declared (three screens) -> /quiz
 *
 * Every band is asked as a QUESTION and nothing else is on the card: no label,
 * no hint, no screen title, no step counter. There is no gate screen after it
 * any more -- the last Continue goes straight into the questions (D18).
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844), which is the intake target.
 *
 * The PR #24 guard: without a database there is nothing to seed into.
 */

test.skip(
  !process.env.DATABASE_URL,
  "needs DATABASE_URL (set by CI once #5 lands)"
);

const continueButton = (page: Page) =>
  page.getByRole("button", { name: /^continuar$/i });

/** Nothing on a declared screen may name the axis it is measuring. */
const FORBIDDEN = [
  "Money posture",
  "Rootedness",
  "Family gravity",
  "Capacity hours",
  "Distance",
  "Chronotype",
  "Life shape",
  "Step",
  "Paso",
  "hookai",
];

/**
 * Answer every radio group on the screen by tapping its first option, and
 * assert on the way that each one is a question with exactly four options.
 */
async function answerScreen(page: Page): Promise<number> {
  const groups = page.getByRole("radiogroup");
  const count = await groups.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    const name = await group.getAttribute("aria-labelledby");
    expect(name).toBeTruthy();
    const heading = page.locator(`#${name}`);
    await expect(heading).toHaveText(/\?$/);
    const options = group.getByRole("radio");
    await expect(options).toHaveCount(4);
    await options.first().check();
  }
  return count;
}

test.describe("declared round", () => {
  test("AC-5 · three question screens and the tag picker lead straight into the questions", async ({
    page,
    context,
  }) => {
    const seeded = await seedParticipant({ declared: "none" });
    await signIn(context, seeded.sessionToken);

    await page.goto("/intake/declared");

    // How many questions each screen asks, in order: waiting on the count is
    // what keeps a click from landing on the screen before it.
    const QUESTIONS_PER_SCREEN = [3, 2, 1];
    const seen: number[] = [];
    for (let screen = 1; screen <= 3; screen++) {
      await expect(page.getByRole("radiogroup")).toHaveCount(
        QUESTIONS_PER_SCREEN[screen - 1]
      );
      const html = await page.content();
      for (const word of FORBIDDEN) {
        expect(html.toLowerCase(), `screen ${screen}`).not.toContain(
          word.toLowerCase()
        );
      }

      // The bar advances screen by screen and exposes real values.
      const bar = page.getByRole("progressbar");
      await expect(bar).toHaveAttribute("aria-valuemax", /\d/);
      const now = Number(await bar.getAttribute("aria-valuenow"));
      expect(Number.isFinite(now)).toBe(true);
      seen.push(now);

      await answerScreen(page);

      // The last screen carries the tag picker, asked as a question too.
      if (screen === 3) {
        await expect(
          page.getByRole("heading", { name: /tiempo libre\?$/i })
        ).toBeVisible();
        await page.getByRole("checkbox", { name: /ramen/i }).check();
      }

      await continueButton(page).click();
      if (screen < 3) {
        await page.waitForURL(/\/intake\/declared\?screen=/);
      }
    }

    // No gate screen in between: the last Continue lands on the questions.
    await expect(page).toHaveURL(/\/quiz$/);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen[2]).toBeGreaterThan(seen[0]);
  });

  test("a half-answered screen keeps its taps and says so", async ({
    page,
    context,
  }) => {
    const seeded = await seedParticipant({ declared: "none" });
    await signIn(context, seeded.sessionToken);

    await page.goto("/intake/declared");
    const groups = page.getByRole("radiogroup");
    await expect(groups).toHaveCount(3);

    // One of three answered: the action refuses without writing anything.
    const first = groups.first().getByRole("radio").nth(2);
    await first.check();
    await continueButton(page).click();

    await expect(
      page.getByText(/elige una opción en cada pregunta/i)
    ).toBeVisible();
    await expect(first).toBeChecked();
    await expect(page).toHaveURL(/\/intake\/declared/);
  });

  test("a participant who finished the round is sent to the questions", async ({
    page,
    context,
  }) => {
    const seeded = await seedParticipant({ declared: "complete" });
    await signIn(context, seeded.sessionToken);

    await page.goto("/intake/declared");
    await expect(page).toHaveURL(/\/quiz$/);
  });

  test("an unregistered phone is sent back to the registration screen", async ({
    page,
  }) => {
    await page.goto("/intake/declared");
    await expect(page).toHaveURL(/\/intake(\?|$)/);
  });
});
