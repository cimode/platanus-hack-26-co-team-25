import { expect, type Page, test } from "@playwright/test";

/**
 * The demo path -- the one flow that cannot break on stage.
 *
 *     intake -> lens -> ranking -> timeline -> baby
 *
 * Most of it is skipped because the screens do not exist yet. This file is a
 * checklist, not dead code: each `test.skip` names the screen it is waiting on,
 * so when that screen lands you delete one word and get a real guard.
 *
 * Keep these tests behaviour-level (roles, visible text) rather than
 * class-level. The design is still being iterated in Claude Design, and a test
 * that breaks on a className change is a test the team will delete.
 */

test.describe("1a · impersonate", () => {
  const combobox = (page: Page) =>
    page.getByRole("combobox", { name: /nombre del participante/i });
  const cta = (page: Page) => page.getByRole("button", { name: /ámonos/i });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the wordmark and the heading", async ({ page }) => {
    await expect(page.getByText("dipia", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /impersonar usuario/i })
    ).toBeVisible();
  });

  test("the CTA stays disabled until someone is chosen", async ({ page }) => {
    // The whole point: submitting with nothing picked would post an empty id.
    await expect(cta(page)).toBeDisabled();
    await combobox(page).click();
    await combobox(page).fill("laura");
    await page.getByRole("option").first().click();
    await expect(cta(page)).toBeEnabled();
  });

  test("filtering ignores accents", async ({ page }) => {
    // Plain ASCII must reach an accented name -- on a Spanish roster that is
    // most of the room, and nobody types the accent into a search box.
    await combobox(page).click();
    await combobox(page).fill("sofia");
    await expect(page.getByRole("option")).toHaveCount(1);
    await expect(page.getByRole("option")).toContainText("Sofía Guzmán");
  });

  test("says so when nobody matches", async ({ page }) => {
    await combobox(page).click();
    await combobox(page).fill("zzzz");
    await expect(page.getByText(/nadie con ese nombre/i)).toBeVisible();
    await expect(cta(page)).toBeDisabled();
  });

  test("can be driven entirely from the keyboard", async ({ page }) => {
    await combobox(page).click();
    await combobox(page).fill("ana");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(combobox(page)).toHaveValue(/ana/i);
    await expect(cta(page)).toBeEnabled();
  });

  test("editing after a choice re-disables the CTA", async ({ page }) => {
    // Guards a stale-id submit: the field would still LOOK chosen while the
    // hidden id pointed at whoever was picked before the edit.
    await combobox(page).click();
    await combobox(page).fill("laura");
    await page.getByRole("option").first().click();
    await expect(cta(page)).toBeEnabled();

    await combobox(page).fill("laur");
    await expect(cta(page)).toBeDisabled();
  });

  test("choosing someone lands on the room as that person", async ({
    page,
  }) => {
    await combobox(page).click();
    await combobox(page).fill("diego");
    await page.getByRole("option").first().click();
    await cta(page).click();

    await expect(page).toHaveURL(/\/room$/);
    await expect(
      page.getByRole("heading", { name: /diego morales/i })
    ).toBeVisible();
  });
});

test.describe("demo path", () => {
  // TODO: un-skip when the intake form exists.
  // Blocked on: intake screen (form + photo capture + per-lens consent).
  // Acceptance criteria to assert:
  //   - all required fields must be completable on a 390px viewport
  //   - per-lens consent is explicit and defaults to opt-OUT for romantic
  //   - submitting yields a personality profile for the participant
  test.skip("a participant can complete intake on a phone", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel(/name/i).fill("Ana Ramírez");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/step 2/i)).toBeVisible();
  });

  // TODO: un-skip when lens selection exists.
  // Acceptance criteria: choosing a lens must change --primary on the subtree.
  test.skip("choosing a lens recolours the ranking", async () => {});

  // TODO: un-skip when ranking exists.
  // Acceptance criteria:
  //   - the room is ordered by descending compatibility
  //   - only participants who opted into THIS lens appear
  //   - a room of one person renders an empty state, not a crash
  test.skip("the room is ranked under the selected lens", async () => {});

  // TODO: un-skip when the timeline exists.
  // Acceptance criteria:
  //   - events are in ascending year order
  //   - no event contradicts an earlier one (coherence)
  //   - each event shows its supporting dimension values
  test.skip("a shared life renders as an ordered timeline", async () => {});

  // TODO: un-skip when offspring generation exists.
  // Acceptance criteria: only reachable under the romantic lens, and only when
  // BOTH participants opted in.
  test.skip("the offspring reveal is gated on mutual romantic consent", async () => {});
});

test.describe("safety invariants", () => {
  // These are the tests that matter most for a live demo in front of the
  // people being ranked. They are worth writing before the features exist.

  // TODO: un-skip when rankings exist.
  test.skip("a ranking is visible only to the person who ran it", async () => {});

  // TODO: un-skip when the room graph exists.
  test.skip("only mutual matches appear in the public room view", async () => {});
});
