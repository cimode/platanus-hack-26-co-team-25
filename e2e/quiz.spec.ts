import { expect, test } from "@playwright/test";

/**
 * The quiz on a phone: fifteen forced-choice blocks in three
 * batches (issue #9).
 *
 *     /quiz opening -> blocks 1-5 -> "Tanda 2 de 3" -> blocks 6-10
 *       -> "Tanda 3 de 3" -> blocks 11-15 -> quiz_completed_at -> /results
 *
 * The happy / sad / edge criteria are skipped until the screens exist; each
 * `test.skip` names what it waits on, so when that lands you delete one word
 * and get a real guard. The `kind: safety` criterion is NOT skipped: it runs
 * today against the current app (vacuously, there is no /quiz yet) and has
 * to stay green as the quiz lands. A silently skipped safety test is the most
 * expensive kind of green in this product.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844).
 */

// Exactly one option per block is reversed-keyed and every option belongs to
// one of the four pillars (PILLARS.md §8 rule 1, AUDIT.md F1). Neither fact
// may ever reach the browser -- not as text, not as a serialized prop.
const PILLAR_OR_KEYING =
  /\b(regulation|politeness|reliability|agency|reversed|positive)\b/i;

// Every URL a participant reaches on the quiz path. Today only "/" exists;
// the rest 404 and the check is vacuous.
const QUIZ_PATHS = ["/", "/quiz", "/quiz?start=1"];

test.describe("quiz", () => {
  // TODO: un-skip when the quiz screen exists.
  // Blocked on: /quiz (src/app/quiz/page.tsx, block-screen.tsx,
  // batch-beat.tsx, option-card.tsx) and e2e/helpers/quiz-participant.ts
  // (room + participant + hookai_session cookie); the test routes every
  test.skip('AC-1 · "Empezar" opens block 1 with its scenario, four option texts as card labels, "1/15", a disabled "Siguiente", no "Atrás" and all four cards inside 390×844', async () => {});

  // TODO: un-skip when the block screen marks cards and submits.
  // Blocked on: block-screen.tsx (Más yo / Menos yo mark state, "Siguiente"
  // enable rule), src/app/quiz/actions.ts (answerBlockAction) and
  // e2e/helpers/quiz-participant.ts reading quiz_responses back.
  test.skip('AC-2 · a tap marks "Más yo", a re-tap clears it, a second card takes "Menos yo", and "Siguiente" writes one row at position 1 with most c, least d and a shuffled shown_order', async () => {});

  // TODO: un-skip when /quiz redirects cookie-less contexts.
  // Blocked on: src/app/quiz/page.tsx (redirect to /intake without a
  // hookai_session cookie) and e2e/helpers/quiz-participant.ts (test room to
  // assert no quiz_responses row exists).
  test.skip("AC-3 · a context without a hookai_session cookie lands on /intake with no scenario and no quiz_responses row", async () => {});

  // TODO: un-skip when the batch beat exists.
  // Blocked on: batch-beat.tsx ("Tanda 2 de 3", "Seguir" → ?start=1, pacing only — nothing is fetched) and
  // e2e/helpers/quiz-participant.ts seeding positions 1-4.
  test.skip('AC-4 · answering block 5 shows "Tanda 2 de 3" with "Seguir" and no option text, nothing is fetched on the beat, and "Seguir" opens block 6', async () => {});

  // TODO: un-skip when back and ?block exist.
  // Blocked on: "Atrás" rendering the previous block pre-marked, ?block=N
  // clamped to the first unanswered position, answerBlockAction redirecting a
  // re-answer to /quiz?start=1 (no beat, no forward walk) and
  // e2e/helpers/quiz-participant.ts seeding positions 1-7.
  test.skip('AC-5 · "Atrás" and ?block=3 re-answer an earlier block in place and return straight to block 8; ?block=12 is clamped to block 8', async () => {});

  // TODO: un-skip when block 15 completes the quiz.
  // Blocked on: "Terminar" on block 15, the completing write
  // responses.save(r, { completedAt }), the placeholder /results ("Listo"),
  // /quiz redirecting a completed participant to /results and
  // e2e/helpers/quiz-participant.ts seeding positions 1-14.
  test.skip('AC-6 · block 15 is shown directly with "15/15" and "Terminar", which sets quiz_completed_at, lands on /results "Listo" and sends /quiz there afterwards', async () => {});
});

test.describe("safety invariants", () => {
  // Runs today (kind: safety). Exactly one option per block is reversed-keyed
  // and each belongs to a pillar; nothing rendered -- DOM text, alt text, the
  // RSC payload serialized into the HTML -- may say which (PILLARS.md §8 rule
  // 1, AUDIT.md F1, CLAUDE_DESIGN_QUIZ_BLOCK.md §3). Today /quiz does not
  // exist, so those pages are 404s and the check is vacuous; when the quiz
  // lands, seed a participant with no responses through
  // e2e/helpers/quiz-participant.ts, walk the opening moment, blocks 1-15 and
  // both beats answering most + least on every block, and on each block
  // screen additionally expect its four option texts to be visible as the card labels --
  // keeping the assertions below on every screen along the way.
  test("AC-7 · no quiz screen names a pillar or a keying direction, in its text or in its served HTML", async ({
    page,
  }) => {
    for (const path of QUIZ_PATHS) {
      const response = await page.request.get(path);
      const html = await response.text();
      expect(html).not.toMatch(PILLAR_OR_KEYING);

      await page.goto(path);
      await expect(page.getByText(PILLAR_OR_KEYING)).toHaveCount(0);
    }
  });
});
