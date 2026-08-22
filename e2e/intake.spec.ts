import { expect, test } from "@playwright/test";

/**
 * Intake on a phone: register -> photo -> consent (issue #6).
 *
 *     /intake?room=<slug>  step 1 -> step 2 -> step 3 -> "You're in"
 *
 * The happy / sad / edge criteria are skipped until the screens exist; each
 * `test.skip` names what it waits on, so when that lands you delete one word
 * and get a real guard. The `kind: safety` criteria are NOT skipped: they run
 * today against the current app (vacuously, there is no /intake yet) and have
 * to stay green as the flow lands. A silently skipped safety test is the most
 * expensive kind of green in this product.
 *
 * Behaviour-level only: roles and visible text, never DOM structure. These run
 * on the `mobile` project (390x844).
 */

const LENSES = [/romantic/i, /business/i, /friendship/i];

test.describe("intake", () => {
  // TODO: un-skip when the intake flow exists.
  // Blocked on: /intake steps 1-3 and the "You're in" screen,
  // e2e/global-setup.ts (E2E_ROOM_SLUG) and e2e/fixtures/face.png.
  test.skip("AC-1 · a participant registers, adds a photo and saves consent on a phone", async () => {});

  // TODO: un-skip when the register step exists.
  // Blocked on: step 1 form with field errors ("Name is required",
  // "Name must be 80 characters or fewer") and e2e/global-setup.ts.
  test.skip("AC-2 · a blank or 81-character name keeps the participant on step 1 with no session", async () => {});

  // TODO: un-skip when the session cookie resumes the flow from the rows.
  // Blocked on: steps 1-3, the hookai_session cookie and the consent step
  // re-rendering saved switch states.
  test.skip("AC-5 · returning with a cookie resumes at step 3 and shows the saved switches", async () => {});

  // TODO: un-skip when /intake resolves rooms by slug.
  // Blocked on: /intake page and RoomRepository.bySlug (#4).
  test.skip('AC-6 · an unknown room slug shows "This room doesn\'t exist" and no form', async () => {});
});

test.describe("safety invariants", () => {
  // Runs today (kind: safety). Every lens switch is off until the participant
  // turns it on -- docs/domain.md §5 "romantic consent defaults to off".
  // Today /intake does not exist, so the check is vacuous; when step 3 lands,
  // drive steps 1-2 first, assert the three switches are unchecked and the
  // helper "Covers the romantic ranking and the AI-offspring render." is
  // visible, then save untouched and expect "Romantic off", "Business off",
  // "Friendship off" on the done screen.
  test("AC-7 · every lens switch is off until the participant turns it on", async ({
    page,
  }) => {
    for (const path of ["/", "/intake"]) {
      await page.goto(path);
      for (const lens of LENSES) {
        await expect(
          page.getByRole("switch", { name: lens, checked: true })
        ).toHaveCount(0);
        await expect(
          page.getByRole("checkbox", { name: lens, checked: true })
        ).toHaveCount(0);
      }
    }
  });

  // Runs today (kind: safety). A page served to one context never carries
  // another participant's name or photo. Today nobody is registered, so the
  // HTML served to a cookie-less context must carry no photo at all; when the
  // flow lands, register "Ana Ramírez" with a photo in context A, register
  // "Beto Díaz" in context B, and assert B's HTML at every step contains
  // neither "Ana Ramírez" nor A's "Your photo" src, while A's reload shows
  // her own.
  test("AC-8 · a page served to one participant never carries another's name or photo", async ({
    page,
  }) => {
    const response = await page.request.get("/intake");
    const html = await response.text();
    expect(html).not.toMatch(/photoUrl|photo_url/);
    expect(html).not.toMatch(/alt="Your photo"/i);

    await page.goto("/intake");
    await expect(page.getByRole("img", { name: /your photo/i })).toHaveCount(0);
  });

  // Runs today (kind: safety). The session cookie is httpOnly, SameSite=Lax,
  // and never readable from page script or printed into the HTML. Today no
  // cookie is issued, so the per-cookie loop is vacuous and document.cookie is
  // empty; when register lands, register first, then read the context cookies
  // and the served HTML and keep the same assertions.
  test("AC-9 · the session cookie is httpOnly, Lax, and invisible to page script", async ({
    page,
    context,
  }) => {
    const response = await page.goto("/intake");
    const html = (await response?.text()) ?? "";

    const sessions = (await context.cookies()).filter(
      (cookie) => cookie.name === "hookai_session"
    );
    for (const cookie of sessions) {
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
      expect(html).not.toContain(cookie.value);
    }

    const documentCookie = await page.evaluate(() => document.cookie);
    expect(documentCookie).not.toContain("hookai_session");
  });
});
