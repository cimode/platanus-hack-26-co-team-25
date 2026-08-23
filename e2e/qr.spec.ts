import { expect, test } from "@playwright/test";

/**
 * `/qr` -- the code the host holds up so each person scans their way into the
 * room's intake. The room is resolved against the database, so without one the
 * page cannot render and the file skips, exactly like `intake.spec.ts`.
 */
test.skip(
  !process.env.DATABASE_URL,
  "DATABASE_URL is not set; /qr resolves the room against the database."
);

/** Set by e2e/global-setup.ts; a missing value is a broken run, not a skip. */
function roomSlug(): string {
  const slug = process.env.E2E_ROOM_SLUG;
  if (!slug) {
    throw new Error(
      "E2E_ROOM_SLUG is not set. e2e/global-setup.ts creates the `e2e-<run>` " +
        "room and exports it; check that playwright.config.ts still registers it."
    );
  }
  return slug;
}

test.describe("/qr", () => {
  test("shows a QR for the room's intake link, and the link itself", async ({
    page,
  }) => {
    const slug = roomSlug();
    await page.goto(`/qr?room=${slug}`);

    await expect(
      page.getByRole("heading", { name: /escanea y entra/i })
    ).toBeVisible();

    // The code is an image with a name, so a screen reader and this test can
    // both find it -- and it names the room it opens.
    const code = page.getByRole("img", { name: /código qr/i });
    await expect(code).toBeVisible();

    // The encoded link is printed for phones whose camera will not cooperate:
    // absolute, on this server, pointing at step 2 with the room chosen.
    const link = page.getByText(`/intake?room=${slug}`);
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/^https?:\/\//);
  });

  test("says so when the room does not exist", async ({ page }) => {
    await page.goto("/qr?room=no-such-room-e2e");
    await expect(
      page.getByRole("heading", { name: /no encontré esa sala/i })
    ).toBeVisible();
    await expect(page.getByRole("img", { name: /código qr/i })).toHaveCount(0);
  });
});
