import { expect, test } from "@playwright/test";

/**
 * Declared round and lens gates on a phone (issue #8).
 *
 *     step 3 -> /intake/declared (Step 4 of 5) -> /intake/gates/* (Step 5 of 5) -> /quiz
 *
 * The happy / sad / edge criteria are skipped until the screens exist; each
 * `test.skip` names what it waits on, so when that lands you delete one word
 * and get a real guard. The `kind: safety` criterion is NOT skipped: it runs
 * today against the current app (vacuously, none of these routes exist yet)
 * and has to stay green as step 5 lands. A silently skipped safety test is the
 * most expensive kind of green in this product.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844).
 */

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

test.describe("declared round and gates", () => {
  // TODO: un-skip when the declared round and the gate screens exist.
  // Blocked on: /intake/declared, /intake/gates/{romantic,business},
  // e2e/fixtures/intake-declared.ts (participant seeded with photo and all
  // three consents, hookai_session cookie) and #6's e2e/global-setup.ts
  // (E2E_ROOM_SLUG).
  test.skip("AC-1 · a participant taps six bands and three tags, answers both gates and lands on /quiz", async () => {});

  // TODO: un-skip when each declared screen persists on Continue.
  // Blocked on: /intake/declared resuming from the rows (submit-declared,
  // earlier taps preselected) and e2e/fixtures/intake-declared.ts.
  test.skip("AC-2 · closing the tab after Life Shape resumes on the next screen with the three taps preselected", async () => {});

  // TODO: un-skip when /intake/gates routes by consent.
  // Blocked on: /intake/gates sending friendship-only participants to /quiz
  // and e2e/fixtures/intake-declared.ts (consent_friendship only).
  test.skip("AC-3 · a friendship-only participant goes from the tag picker straight to /quiz without a gate screen", async () => {});

  // TODO: un-skip when the declared screen returns "pick one for each".
  // Blocked on: declared-screen.tsx (useActionState error state, taps held in
  // client state) and e2e/fixtures/intake-declared.ts.
  test.skip('AC-4 · Continue with an untapped band stays on Life Shape, keeps the two taps and shows "pick one for each"', async () => {});

  // TODO: un-skip when consent hands off to the declared round.
  // Blocked on: consentAction redirecting to /intake/declared, the /intake
  // step-from-rows rule gaining the declared branch, "Step N of 5" headings,
  // #6's steps 1-3, e2e/global-setup.ts (E2E_ROOM_SLUG) and
  // e2e/fixtures/face.png. Drives the real screens; seeds nothing.
  test.skip("AC-10 · saving consent lands on Step 4 of 5, reopening /intake resumes there, and a photo-less session is sent back to Step 2 of 5", async () => {});
});

test.describe("safety invariants", () => {
  // Runs today (kind: safety). Asking is a disclosure event (PILLARS.md A8,
  // docs/domain.md D5): gender, interested in, single, age band and wants
  // kids are asked only of a participant who consented to the romantic lens.
  // Today none of these routes exist, so every page is a 404 and the check is
  // vacuous; when step 5 lands, seed a participant with consent_business
  // true, consent_romantic false and a complete declared profile through
  // e2e/fixtures/intake-declared.ts, open /intake/declared and expect only
  // risk posture, exit horizon and redlines, then navigate directly to
  // /intake/gates/romantic and expect a URL ending in /intake/gates/business
  // -- keeping the assertions below on every page along the way.
  test("AC-7 · romantic gate questions are never shown to a participant without romantic consent", async ({
    page,
  }) => {
    for (const path of STEP_PATHS) {
      await page.goto(path);
      await expect(page.getByLabel(ROMANTIC_QUESTIONS)).toHaveCount(0);
      for (const role of [
        "group",
        "radiogroup",
        "radio",
        "checkbox",
        "combobox",
        "switch",
      ] as const) {
        await expect(
          page.getByRole(role, { name: ROMANTIC_QUESTIONS })
        ).toHaveCount(0);
      }
      await expect(page.getByText(/interested in|wants kids/i)).toHaveCount(0);
    }
  });
});
