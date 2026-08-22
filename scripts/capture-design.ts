/**
 * capture-design.ts — rewrite docs/design/screenshots/ from the live /design route.
 *
 *   pnpm run design:capture
 *
 * These are the images attached to a Claude Design handoff, so they must be the
 * system as it actually renders — never a mock, never stale. `e2e/design-system.spec.ts`
 * guards the same route against drift; this one produces the shareable artefacts.
 *
 * Boots its own dev server on a port nothing else uses, so a running `pnpm dev`
 * on :3000 or a Playwright run on :3100 does not collide.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const PORT = 3141;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join(process.cwd(), "docs/design/screenshots");

/**
 * Sections in the order they appear on /design, addressed positionally --
 * `main > div > section` nth, exactly as e2e/design-system.spec.ts does. The
 * page derives its ids from the section title, so "Shape & depth" becomes an id
 * with a space and an ampersand in it; positional is the sturdier handle.
 */
const SECTIONS = [
  "01-brand",
  "02-typography",
  "03-surfaces",
  "04-lenses",
  "05-shape-depth",
  "06-controls",
  "07-in-situ",
  "08-loading",
] as const;

const SECTION = "main > div > section";
/** Index of "In situ" above -- the one section also shot at phone width. */
const IN_SITU = 6;

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
}

/** Fonts must be settled or Baloo 2 flaps with its fallback mid-capture. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const server = spawn("pnpm", ["exec", "next", "dev", "-p", String(PORT)], {
    stdio: "ignore",
    detached: false,
  });

  const shot = async (page: Page, name: string, target?: string) => {
    const locator = target ? page.locator(target) : undefined;
    const path = join(OUT, `${name}.png`);
    if (locator) await locator.screenshot({ path });
    else await page.screenshot({ path, fullPage: true });
    console.log(`  ${name}.png`);
  };

  try {
    console.log(`booting next dev on :${PORT} …`);
    await waitForServer(`${BASE}/design`);

    const browser = await chromium.launch();

    // --- desktop -----------------------------------------------------------
    const desktop = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await desktop.newPage();
    await page.goto(`${BASE}/design`, { waitUntil: "networkidle" });
    await settle(page);

    console.log("capturing desktop …");
    await shot(page, "00-overview-desktop");
    await shot(page, "00-masthead", "main > header");
    for (let i = 0; i < SECTIONS.length; i++) {
      await shot(page, SECTIONS[i], `${SECTION} >> nth=${i}`);
    }
    await desktop.close();

    // --- mobile ------------------------------------------------------------
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mpage = await mobile.newPage();
    await mpage.goto(`${BASE}/design`, { waitUntil: "networkidle" });
    await settle(mpage);

    console.log("capturing mobile …");
    await shot(mpage, "99-overview-mobile");
    await shot(mpage, "07b-in-situ-mobile", `${SECTION} >> nth=${IN_SITU}`);
    await mobile.close();

    await browser.close();
    console.log(`\ndone — ${OUT}`);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
