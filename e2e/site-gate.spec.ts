import { expect, test } from "@playwright/test";

/**
 * The site gate (issue #50).
 *
 * This file only runs under `E2E_GATE=1`, which is what makes
 * playwright.config.ts boot the dev server with `SITE_GATE_PASSWORD` set and
 * leave every other spec out of the run:
 *
 *     E2E_GATE=1 E2E_PORT=3250 E2E_ISOLATED=1 \
 *       pnpm exec playwright test e2e/site-gate.spec.ts --project=mobile
 *
 * Without the variable there is no gate at all -- which is exactly what
 * e2e/intake.spec.ts and the rest of the suite keep proving (AC-6).
 */

/** Must match `GATE_PASSWORD` in playwright.config.ts. */
const PASSWORD = "test-gate-pw";

test.describe("site gate", () => {
  test("AC-1 · a navigation is sent to a page that says nothing", async ({
    page,
    request,
  }) => {
    const response = await page.goto("/intake");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/gate");
    expect(url.searchParams.get("next")).toBe("/intake");
    expect(response?.request().redirectedFrom()?.url()).toContain("/intake");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();

    // The raw document, not the serialised DOM: a <script> the browser already
    // executed would still be in the source.
    const html = await (await request.get("/gate?next=/intake")).text();
    expect(html).not.toContain("<script");
    for (const word of ["dipia", "hookai", "quiz"]) {
      expect(
        html.toLowerCase(),
        `the gate must not mention "${word}"`
      ).not.toContain(word);
    }
  });

  test("AC-2 · every non-navigation answers a bare 401", async ({
    request,
  }) => {
    const cases: Array<[string, string, Record<string, string>?]> = [
      ["GET", "/_next/static/chunks/anything.js"],
      ["GET", "/api/anything"],
      ["GET", "/robots.txt"],
      ["GET", "/favicon.ico"],
      ["HEAD", "/"],
      ["OPTIONS", "/intake"],
      ["POST", "/intake", { "Next-Action": "0000000000" }],
    ];

    for (const [method, path, headers] of cases) {
      const response = await request.fetch(path, {
        method,
        headers,
        maxRedirects: 0,
      });
      const where = `${method} ${path}`;
      expect(response.status(), where).toBe(401);
      expect(await response.text(), where).toBe("");
      expect(response.headers()["cache-control"], where).toBe("no-store");
      expect(response.headers()["x-robots-tag"], where).toBe(
        "noindex, nofollow"
      );
    }
  });

  test("AC-3 · a wrong password keeps you out", async ({ page, context }) => {
    await page.goto("/intake");
    await page.getByLabel("Contraseña").fill("not-the-password");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("Esa no es.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/gate");
    expect(
      (await context.cookies()).filter((c) => c.name === "dipia_gate")
    ).toHaveLength(0);

    await page.goto("/intake");
    expect(new URL(page.url()).pathname).toBe("/gate");
  });

  test("AC-4 · the right password unlocks the site for this browser", async ({
    page,
    context,
  }) => {
    const slug = process.env.E2E_ROOM_SLUG;
    const target = slug ? `/intake?room=${slug}` : "/intake";

    const assets: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/_next/")) assets.push(response.status());
    });

    await page.goto(target);
    expect(new URL(page.url()).pathname).toBe("/gate");

    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/intake/);
    expect(new URL(page.url()).pathname).toBe("/intake");

    const cookie = (await context.cookies()).find(
      (c) => c.name === "dipia_gate"
    );
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.path).toBe("/");
    // Not `secure` here only because the test server is plain http; behind
    // Vercel the `x-forwarded-proto: https` header turns it on.
    expect(cookie?.secure).toBe(false);
    expect(cookie?.value).not.toContain(PASSWORD);

    // The registration screen itself -- and the `/_next/*` assets that were 401
    // a moment ago now load.
    if (slug) {
      await expect(
        page.getByRole("button", { name: /^empezar$/i })
      ).toBeVisible();
    }
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((status) => status < 400)).toBe(true);
  });
});
