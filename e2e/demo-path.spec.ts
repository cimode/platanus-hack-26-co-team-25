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
    // The room names you in its header pill, not in a heading -- the heading
    // belongs to the room itself.
    await expect(page.getByText("Diego Morales")).toBeVisible();
  });
});

test.describe("1b · the room", () => {
  async function enterAs(page: Page, query: string) {
    await page.goto("/");
    const box = page.getByRole("combobox", {
      name: /nombre del participante/i,
    });
    await box.click();
    await box.fill(query);
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /ámonos/i }).click();
    await page.waitForURL("**/room");
  }

  test("sends you back when no one is being impersonated", async ({ page }) => {
    // A room with no `me` is a broken session, not an empty state: the cookie
    // is missing or names someone off the roster.
    await page.context().clearCookies();
    await page.goto("/room");
    await expect(page).toHaveURL(/\/$/);
  });

  test("you are not standing in your own room", async ({ page }) => {
    await enterAs(page, "diego");
    // 18 on the roster, so 17 others.
    await expect(page.locator("figure")).toHaveCount(17);
    await expect(page.getByText("Diego Morales")).toHaveCount(1); // the header pill only
  });

  test("every sprite is actually painted inside the room band", async ({
    page,
  }) => {
    // REGRESSION GUARD. The canvas first shipped with `h-full`, which resolves
    // against a parent whose height comes from flex-1 -- so it measured 0px,
    // every sprite's `top: 44%` collapsed to 0, and the whole crowd was clipped
    // out of view. Counting elements did not catch it; measuring does.
    await enterAs(page, "diego");
    const band = await page
      .locator("section", { has: page.locator("figure") })
      .first()
      .boundingBox();
    expect(band).not.toBeNull();

    const figures = page.locator("figure");
    const count = await figures.count();
    for (let i = 0; i < count; i++) {
      const box = await figures.nth(i).boundingBox();
      expect(box, `sprite ${i} has no box`).not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThan(20);
      expect(box?.y ?? -1).toBeGreaterThanOrEqual((band?.y ?? 0) - 1);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
        (band?.y ?? 0) + (band?.height ?? 0) + 1
      );
    }
  });

  test("the floor scrolls horizontally", async ({ page }) => {
    await enterAs(page, "diego");
    const floor = page.getByRole("region", { name: /la sala/i });
    const scrollable = await floor.evaluate(
      (el) => el.scrollWidth > el.clientWidth
    );
    expect(scrollable).toBe(true);
  });

  test("each lens button wears its own accent", async ({ page }) => {
    // The payoff of the lens system: three buttons, one class each, zero
    // conditional colour. If two ever resolve the same, the language is broken.
    await enterAs(page, "diego");
    const hues = await page.evaluate(() =>
      [...document.querySelectorAll("button[name=lens]")].map((el) =>
        getComputedStyle(el).getPropertyValue("--primary").trim()
      )
    );
    expect(hues).toHaveLength(3);
    expect(new Set(hues).size).toBe(3);
  });

  test("choosing a lens carries it through to the ranking", async ({
    page,
  }) => {
    await enterAs(page, "diego");
    await page.getByRole("button", { name: /trabajando/i }).click();
    await expect(page).toHaveURL(/\/rank$/);
    await expect(
      page.getByRole("heading", { name: /negocios/i })
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

  // Runs today (kind: safety, issue #4). A viewer holding no hookai_session
  // cookie never sees anyone's ranking. Vacuous while /results/[lens] is a
  // 404; when #10 lands, a subject-less request is sent to /intake instead of
  // rendering a ranking, and #10 replaces this body with its fixture-backed
  // version under the same name.
  test("AC-10 · a ranking is visible only to the person who ran it", async ({
    page,
  }) => {
    for (const lens of ["romantic", "business", "friendship"]) {
      await page.goto(`/results/${lens}`);
      await expect(
        page.getByRole("heading", { name: /ranked|your matches|top matches/i })
      ).toHaveCount(0);
      await expect(
        page.getByRole("listitem").filter({ hasText: /\d+\s?%/ })
      ).toHaveCount(0);
    }
  });

  // Runs today (kind: safety, issue #4). The room view shows mutual pairs
  // only -- never scores, drivers, friction or flags -- and nothing at all to
  // a viewer without the operator credential. Vacuous while /room is a 404;
  // it stays true when the operator-gated projected view lands at that path.
  test("AC-11 · only mutual matches appear in the public room view", async ({
    page,
  }) => {
    await page.goto("/room");
    await expect(
      page.getByText(/\b(score|driver|friction|flag)s?\b/i)
    ).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });
});
