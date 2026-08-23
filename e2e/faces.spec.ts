import { expect, test } from "@playwright/test";

/**
 * /design/faces -- a real photo in the avatar's blank face.
 *
 * The whole feature is a composite that happens in the browser, so the only
 * honest test is to hand the page a photo and look at the pixels that come
 * out. No database and no network: the page is static over the manifest and
 * the photo never leaves the tab.
 */

/** A solid magenta JPEG. Nothing in the artwork is remotely this colour, so
 *  finding it inside the face oval proves the composite ran and landed. */
const MAGENTA_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkI" +
    "CQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCABAAEABAREA/8QAHwAAAQUBAQEB" +
    "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
    "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
    "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
    "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=",
  "base64"
);

test.describe("faces gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design/faces");
  });

  test("draws the plain avatars until a photo is chosen", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Caras" })).toBeVisible();
    for (const avatar of ["avatar1", "avatar2", "avatar3", "avatar4"]) {
      const card = page.getByTestId(`faces-${avatar}`);
      await expect(card.locator('[data-anim="idle"]')).toBeVisible();
      await expect(page.getByTestId(`faces-${avatar}-state`)).toHaveText(
        "sin foto"
      );
    }
  });

  test("puts the photo in the face of every avatar's idle plate", async ({
    page,
  }) => {
    await page.getByTestId("face-photo").setInputFiles({
      name: "face.jpg",
      mimeType: "image/jpeg",
      buffer: MAGENTA_JPEG,
    });

    for (const avatar of ["avatar1", "avatar2", "avatar3", "avatar4"]) {
      await expect(page.getByTestId(`faces-${avatar}-state`)).toHaveText(
        "con cara",
        { timeout: 15_000 }
      );
      // The composited plate is an object URL, never the shipped artwork.
      const plate = page
        .getByTestId(`faces-${avatar}`)
        .locator('[data-anim="idle"]');
      const image = await plate.evaluate(
        (node) => getComputedStyle(node).backgroundImage
      );
      expect(image).toContain("blob:");
      expect(image).not.toContain(`/sprites/${avatar}.png`);
    }
  });

  test("paints inside the face and nowhere else", async ({ page }) => {
    await page.getByTestId("face-photo").setInputFiles({
      name: "face.jpg",
      mimeType: "image/jpeg",
      buffer: MAGENTA_JPEG,
    });
    await expect(page.getByTestId("faces-avatar1-state")).toHaveText(
      "con cara",
      { timeout: 15_000 }
    );

    // Read the composited plate back and compare it with the original: every
    // pixel that changed must have been the beige face plate, and there must
    // be enough of them to be a face rather than a stray edge.
    const diff = await page.evaluate(async () => {
      const node = document.querySelector(
        '[data-testid="faces-avatar1"] [data-anim="idle"]'
      ) as HTMLElement;
      const url = getComputedStyle(node)
        .backgroundImage.replace(/^url\(["']?/, "")
        .replace(/["']?\)$/, "");
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok, no) => {
          const image = new Image();
          image.onload = () => ok(image);
          image.onerror = no;
          image.src = src;
        });
      const [faced, plain] = await Promise.all([
        load(url),
        load("/sprites/avatar1.png"),
      ]);
      const read = (image: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        return canvas
          .getContext("2d")
          ?.getImageData(0, 0, image.width, image.height)
          .data as Uint8ClampedArray;
      };
      const a = read(faced);
      const b = read(plain);
      // The blank face plate, as authored.
      const PLATE = [209, 180, 146];
      let changed = 0;
      let offPlate = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (
          Math.abs(a[i] - b[i]) +
            Math.abs(a[i + 1] - b[i + 1]) +
            Math.abs(a[i + 2] - b[i + 2]) <
          24
        )
          continue;
        changed++;
        const wasPlate =
          Math.max(
            Math.abs(b[i] - PLATE[0]),
            Math.abs(b[i + 1] - PLATE[1]),
            Math.abs(b[i + 2] - PLATE[2])
          ) <= 26 && b[i + 3] > 128;
        if (!wasPlate) offPlate++;
      }
      return { changed, offPlate, pixels: a.length / 4 };
    });

    expect(diff.changed).toBeGreaterThan(200);
    // A handful of pixels may sit on the plate's own antialiased rim.
    expect(diff.offPlate).toBeLessThan(diff.changed * 0.05);
  });

  test("leaves a clip with no face in it completely untouched", async ({
    page,
  }) => {
    await page.getByTestId("face-photo").setInputFiles({
      name: "face.jpg",
      mimeType: "image/jpeg",
      buffer: MAGENTA_JPEG,
    });
    const card = page.getByTestId("faces-avatar1");
    await expect(page.getByTestId("faces-avatar1-state")).toHaveText(
      "con cara",
      { timeout: 15_000 }
    );

    // Walking away from camera shows the back of a head: there is no plate to
    // paint, so the sprite must draw the shipped artwork, not a composite.
    await card.getByRole("button", { name: "walk-back · avatar1" }).click();
    const strip = card.locator('[data-anim="walk-back"]');
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("faces-avatar1-state")).toHaveText(
      "sin cara aquí"
    );
    const image = await strip.evaluate(
      (node) => getComputedStyle(node).backgroundImage
    );
    expect(image).toContain("/sprites/emotes/avatar1/walk-back.webp");
  });
});
