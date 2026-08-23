import { type NextRequest, NextResponse } from "next/server";
import {
  GATE_COOKIE_MAX_AGE,
  GATE_COOKIE_NAME,
  gateCookieValue,
  passwordIsCorrect,
  safeNextPath,
} from "@/lib/site-gate/gate";

/**
 * `/gate` -- the only path the proxy lets through (issue #50).
 *
 * A route handler rather than a page, because for a browser that has not
 * unlocked yet **every** `/_next/*` asset answers 401: there is no client
 * bundle, no stylesheet and no font to load. So this returns one self-contained
 * HTML document with inline CSS and not a single `<script>`.
 *
 * It also says nothing. No wordmark, no product name, no hint of what is behind
 * it and no hint of the password's shape -- just a field and a button, in
 * Spanish, the language of the room.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD ?? "";
  // No gate configured (local dev, CI): there is nothing to unlock, and a
  // stray password form would only confuse.
  if (!password) return NextResponse.redirect(new URL("/", request.url), 302);

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  return htmlResponse(gatePage(next), 200);
}

export async function POST(request: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD ?? "";
  if (!password) return NextResponse.redirect(new URL("/", request.url), 303);

  const form = await request.formData();
  const submitted = form.get("password");
  const next = safeNextPath(readString(form.get("next")));

  if (!passwordIsCorrect(readString(submitted), password)) {
    // A small constant delay blunts online guessing without a rate-limiting
    // service, and the message is the same whatever was wrong.
    await sleep(1000);
    return htmlResponse(gatePage(next, "Esa no es."), 401);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set({
    name: GATE_COOKIE_NAME,
    value: gateCookieValue(password),
    httpOnly: true,
    sameSite: "strict",
    // Plain http on localhost would drop a `Secure` cookie, so it follows the
    // scheme the browser actually used -- behind Vercel that is the
    // `x-forwarded-proto` header, not the internal request URL.
    secure: isHttps(request),
    path: "/",
    maxAge: GATE_COOKIE_MAX_AGE,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function readString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

function isHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return request.nextUrl.protocol === "https:";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/** Minimal escaping -- `next` is the only value that reaches the document. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function gatePage(next: string, message?: string): string {
  const note = message
    ? `<p class="note" role="alert">${escapeHtml(message)}</p>`
    : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Acceso</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: oklch(0.18 0 0);
    color: oklch(0.96 0 0);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  form { width: 100%; max-width: 20rem; display: grid; gap: 12px; }
  label { font-size: 0.875rem; }
  input, button {
    font: inherit;
    width: 100%;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid oklch(0.4 0 0);
  }
  input {
    background: oklch(0.24 0 0);
    color: oklch(0.96 0 0);
  }
  button {
    background: oklch(0.96 0 0);
    color: oklch(0.18 0 0);
    border-color: oklch(0.96 0 0);
    font-weight: 600;
    cursor: pointer;
  }
  .note { margin: 0; font-size: 0.875rem; color: oklch(0.75 0.14 25); }
</style>
</head>
<body>
<form method="post" action="/gate">
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="off"
         autocapitalize="off" autocorrect="off" spellcheck="false" autofocus>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  ${note}
  <button type="submit">Entrar</button>
</form>
</body>
</html>
`;
}
