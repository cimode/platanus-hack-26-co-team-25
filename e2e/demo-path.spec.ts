import { expect, type Page, test } from "@playwright/test";
import { CAST_NAMES, rosterSeeded } from "./fixtures/roster";

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
  // The chooser and the room read the `participants` table now, so both need
  // the cast `e2e/global-setup.ts` seeds. Without a database there is nobody
  // to pick and every assertion below would fail for that reason alone --
  // which is the same convention the intake specs already follow.
  test.skip(
    !rosterSeeded(),
    "DATABASE_URL is not set, so e2e/global-setup.ts seeded no cast."
  );

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
  // The chooser and the room read the `participants` table now, so both need
  // the cast `e2e/global-setup.ts` seeds. Without a database there is nobody
  // to pick and every assertion below would fail for that reason alone --
  // which is the same convention the intake specs already follow.
  test.skip(
    !rosterSeeded(),
    "DATABASE_URL is not set, so e2e/global-setup.ts seeded no cast."
  );

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
    /*
     * NOT an exact count, and the reason is the whole point of this test.
     *
     * `17` was the hardcoded roster minus yourself, stable only because that
     * module could never grow. The room reads the `participants` table now, and
     * the intake specs register their own people into this same `e2e-<run>`
     * room -- so the headcount here depends on what else has already run.
     *
     * What the test actually asserts survives that: everyone in the cast but
     * you is on the floor, and your own name appears exactly once, in the
     * header pill. A sprite of yourself would make it two.
     */
    const figures = page.locator("figure");
    await expect(figures.first()).toBeVisible();
    expect(await figures.count()).toBeGreaterThanOrEqual(CAST_NAMES.length - 1);
    await expect(page.getByText("Diego Morales")).toHaveCount(1);
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
      .getByRole("region", { name: /la sala/i })
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

  /*
   * The two tests below exist because `useDragScroll` was extracted out of this
   * screen (U3), and the suite as it stood could not have caught the extraction
   * going wrong: "the floor scrolls horizontally" passes on a plain
   * `overflow-x-auto` div with no hook, no handlers and no starting offset.
   * A refactor is only safe behind a test that fails when the behaviour is
   * lost, so these were written first and each was proven live by breaking the
   * thing it guards.
   */

  test("the room opens centred, not against the left wall", async ({
    page,
  }) => {
    // The plate is far wider than a phone, so scrollLeft 0 greets you with a
    // window frame and no people in it. This is the whole reason the hook takes
    // an `initial` at all, and the reason it positions from a CALLBACK ref
    // rather than an effect -- the first painted frame must already be centred.
    await enterAs(page, "diego");
    const floor = page.getByRole("region", { name: /la sala/i });
    const { left, max } = await floor.evaluate((el) => ({
      left: el.scrollLeft,
      max: el.scrollWidth - el.clientWidth,
    }));

    expect(
      max,
      "the plate must overflow or there is nothing to centre"
    ).toBeGreaterThan(0);
    // Within a pixel of the midpoint. Not `toBeGreaterThan(0)`: that would pass
    // on any stray offset, including the browser restoring a previous scroll.
    expect(Math.abs(left - max / 2)).toBeLessThanOrEqual(1);
  });

  test("a mouse drag shoves the floor sideways", async ({ page }) => {
    // Native overflow gives touch, trackpad, scrollbar and arrow keys for free.
    // What it does NOT give is click-and-drag with a mouse, which is the only
    // thing the pointer handlers add -- and the only thing that disappears
    // silently if they are dropped during a refactor.
    await enterAs(page, "diego");
    const floor = page.getByRole("region", { name: /la sala/i });
    const box = await floor.boundingBox();
    expect(box).not.toBeNull();

    const before = await floor.evaluate((el) => el.scrollLeft);
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    const from = (box?.x ?? 0) + (box?.width ?? 0) * 0.8;

    await page.mouse.move(from, y);
    await page.mouse.down();
    // Two moves: one is enough to scroll, but a coalesced single step would
    // hide a handler that accumulates deltas instead of measuring from origin.
    await page.mouse.move(from - 100, y);
    await page.mouse.move(from - 200, y);
    await page.mouse.up();

    const after = await floor.evaluate((el) => el.scrollLeft);
    // Dragging LEFT reveals what is to the right, so scrollLeft grows.
    expect(after - before).toBeGreaterThan(100);
  });

  test("a hovered name reads above the head and over the crowd", async ({
    page,
    isMobile,
  }) => {
    // DESKTOP ONLY, and this is a statement about the product rather than the
    // harness: `:hover` does not exist on a touch device, so on the 390px
    // project this affordance cannot fire at all. Asserting it there would be
    // asserting something the platform never delivers. See the note in
    // `participant-sprite.tsx` about what phones get instead.
    test.skip(isMobile, "hover is a pointer affordance; touch has none");

    /*
     * Two properties, and the second is the one that needed the rewrite.
     *
     * The caption used to sit BELOW the sprite, which is exactly where the next
     * row of people stands -- so the name you were reaching for was the one
     * covered by the crowd in front of it. Above the head is empty floor at
     * every depth, because sprites are anchored by their feet.
     *
     * And it has to paint OVER its neighbours. `z-index` on the figure opens a
     * stacking context, so no z-index on the caption itself can lift it past a
     * nearer sprite -- the figure is what must rise. That is why depth moved
     * from an inline `zIndex` (which a `hover:` class cannot override) to a
     * custom property.
     */
    // Reduced motion FIRST, and not as a convenience. The sprites wander and
    // hop continuously, so Playwright's actionability check never finds them
    // "stable" and `hover()` times out. What is under test here is layer and
    // position, not movement, so freezing the room is measuring the right thing
    // rather than working around a flake.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterAs(page, "diego");
    const sprite = page.locator("figure").nth(6);
    const caption = sprite.locator("figcaption");

    const before = await sprite.evaluate((el) => getComputedStyle(el).zIndex);
    await sprite.hover();
    await expect(caption).toBeVisible();

    const after = await sprite.evaluate((el) => getComputedStyle(el).zIndex);
    expect(Number(after)).toBe(200);
    expect(Number(after)).toBeGreaterThan(Number(before));

    // Above the head: the caption's bottom edge sits at or above the sprite's
    // top edge, never below its feet.
    const [capBox, figBox] = [
      await caption.boundingBox(),
      await sprite.boundingBox(),
    ];
    expect(capBox).not.toBeNull();
    expect(figBox).not.toBeNull();
    expect((capBox?.y ?? 0) + (capBox?.height ?? 0)).toBeLessThanOrEqual(
      (figBox?.y ?? 0) + 2
    );
  });

  test("the card retakes the accent of the lens you pick", async ({ page }) => {
    // The payoff of the lens system: choosing an option repaints the dot AND
    // the Vamos button, with zero conditional colour in the component. If two
    // lenses ever resolve the same, the visual language is broken.
    await enterAs(page, "diego");
    const trigger = page.getByRole("combobox", { name: /tipo de conexión/i });
    const accent = () =>
      page.evaluate(() => {
        const el = document.querySelector("form[class*='lens-']");
        return el
          ? getComputedStyle(el).getPropertyValue("--primary").trim()
          : null;
      });

    const seen = new Set<string>();
    for (const label of [/románticamente/i, /trabajando/i, /de amigos/i]) {
      await trigger.click();
      await page.getByRole("option", { name: label }).click();
      const hue = await accent();
      expect(hue, `${label} has no accent`).toBeTruthy();
      seen.add(hue as string);
    }
    expect(seen.size).toBe(3);
  });

  test("the lens listbox is fully keyboard-operable", async ({ page }) => {
    // The native <select> this replaced gave keyboard support for free. Having
    // traded that away for a popup we can actually style, the replacement has
    // to earn it back -- otherwise the restyle was a downgrade wearing paint.
    await enterAs(page, "diego");
    const trigger = page.getByRole("combobox", { name: /tipo de conexión/i });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(trigger).toContainText(/trabajando/i);
  });

  test("prefers-reduced-motion actually stops the room", async ({ page }) => {
    // REGRESSION GUARD, and it earned its place: the first version of the
    // reduced-motion block listed animation utility CLASSES, but every sprite
    // carries its animation as an INLINE style (duration, delay and path differ
    // per person) and the wander wrappers have no class at all. The guard
    // stopped nothing for three commits and nothing caught it, because reading
    // the CSS makes it look correct. Only measuring the computed style does.
    await enterAs(page, "diego");
    const running = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll("*")].filter((el) => {
            const name = getComputedStyle(el).animationName;
            return name && name !== "none";
          }).length
      );

    expect(
      await running(),
      "the room should be alive by default"
    ).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForTimeout(400);
    expect(await running(), "reduced motion must stop everything").toBe(0);
  });

  test("choosing a lens carries it through to the ranking", async ({
    page,
  }) => {
    await enterAs(page, "diego");
    await page.getByRole("combobox", { name: /tipo de conexión/i }).click();
    await page.getByRole("option", { name: /trabajando/i }).click();
    await page.getByRole("button", { name: /vamos/i }).click();
    await expect(page).toHaveURL(/\/rank$/);
    await expect(
      page.getByRole("heading", { name: /negocios/i })
    ).toBeVisible();
  });
});

test.describe("demo path", () => {
  // The intake leg of the demo path lives in e2e/intake.spec.ts (issue #6):
  // register -> photo -> consent on a 390px viewport, per-lens consent
  // defaulting to off, and the three safety invariants around it. It is not
  // duplicated here -- one acceptance criterion, one test.

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

  // Runs today (kind: safety, issue #4). A viewer holding no dipia_session
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
