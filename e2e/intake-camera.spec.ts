import { expect, test } from "@playwright/test";

/**
 * The camera lives inside the photo frame, under the oval (issue #47 follow-up).
 *
 * Chromium can fake a camera from the command line, which is what makes this
 * testable without hardware: the stream is a synthetic moving pattern, and a
 * capture of it is a real JPEG in the file input. Other engines skip.
 */
test.use({
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});

test.skip(
  !process.env.DATABASE_URL,
  "DATABASE_URL is not set; /intake resolves the room against the database."
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

test.describe("photo frame camera", () => {
  test("opens in the frame under the oval, and a tap takes the photo into the form", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "the fake camera is a Chromium flag");
    await page.goto(`/intake?room=${roomSlug()}`);

    // Tapping the frame opens the camera IN the frame, not the phone's app...
    await page.getByText("Tócala para tomarla ahora").click();
    const camera = page.getByLabel("Vista previa de la cámara");
    await expect(camera).toBeVisible();
    // ...and the oval is on top of the live stream the whole time.
    await expect(
      page.getByRole("img", { name: "Guía para centrar la cara" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Tomar foto" }).click();

    // The stream is gone, the photo is in the frame, still under the oval, and
    // the form's own file input holds the capture -- the submit path is unchanged.
    await expect(camera).toHaveCount(0);
    await expect(page.locator("img[src^='blob:']")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Guía para centrar la cara" })
    ).toBeVisible();
    const files = await page
      .getByLabel(/tu foto/i)
      .evaluate((element: HTMLInputElement) => ({
        count: element.files?.length ?? 0,
        type: element.files?.[0]?.type ?? "",
        size: element.files?.[0]?.size ?? 0,
      }));
    expect(files.count).toBe(1);
    expect(files.type).toBe("image/jpeg");
    expect(files.size).toBeGreaterThan(1000);

    await expect(
      page.getByRole("button", { name: "Cambiar foto" })
    ).toBeVisible();
  });

  test("cancelling puts the frame back without a photo", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "the fake camera is a Chromium flag");
    await page.goto(`/intake?room=${roomSlug()}`);
    await page.getByText("Tócala para tomarla ahora").click();
    await expect(page.getByLabel("Vista previa de la cámara")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByLabel("Vista previa de la cámara")).toHaveCount(0);
    await expect(page.getByText("Tócala para tomarla ahora")).toBeVisible();
  });
});
