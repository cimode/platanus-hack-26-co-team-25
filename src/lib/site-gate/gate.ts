import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The site gate (issue #50).
 *
 * Until the reveal, nobody may see the app. `SITE_GATE_PASSWORD` is the whole
 * switch: unset or empty means there is no gate at all, which is what local
 * dev, CI and every existing e2e run get. Set (only ever in Vercel, never in
 * this public repo) it locks every path behind one shared password.
 *
 * These are the pure halves -- no `next/*`, no request objects -- so the
 * decision table can be unit-tested directly and `src/proxy.ts` stays a thin
 * translation between `NextRequest`/`NextResponse` and these functions.
 */

/** Cookie that proves this browser typed the password. */
export const GATE_COOKIE_NAME = "dipia_gate";

/** Path of the unlock page. Allow-listed by the proxy; nothing else is. */
export const GATE_PATH = "/gate";

/** 30 days, in seconds. */
export const GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Fixed message the cookie value is an HMAC of. The password is the *key*, so
 * the cookie never carries the password and cannot be reversed into it; and
 * because the value is recomputed from the environment on every request,
 * rotating `SITE_GATE_PASSWORD` invalidates every browser at once.
 */
const GATE_MESSAGE = "dipia-gate-v1";

/** The cookie value a browser that knows `password` is entitled to hold. */
export function gateCookieValue(password: string): string {
  return createHmac("sha256", password).update(GATE_MESSAGE).digest("hex");
}

/** Constant-time compare of two strings that are the same length or not. */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // `timingSafeEqual` throws on different lengths, so compare against a
  // same-length copy and fold the length check into the boolean instead of
  // returning early on it.
  const padded = Buffer.alloc(left.length);
  right.copy(padded);
  return timingSafeEqual(left, padded) && left.length === right.length;
}

/** Does this cookie value prove knowledge of `password`? */
export function gateCookieIsValid(
  cookie: string | null | undefined,
  password: string
): boolean {
  if (!cookie || !password) return false;
  return constantTimeEquals(cookie, gateCookieValue(password));
}

/** Is this submitted password the right one? */
export function passwordIsCorrect(
  submitted: string | null | undefined,
  password: string
): boolean {
  if (!submitted || !password) return false;
  return constantTimeEquals(submitted, password);
}

/**
 * Where to send a browser after it unlocks.
 *
 * Only a same-origin path survives: anything that could leave the origin
 * (`//evil.com`, `https://evil.com`, a backslash form) collapses to `/`, and so
 * does `/gate` itself, which would otherwise bounce the browser straight back
 * to the form it just passed.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  // `//host` and `/\host` are both protocol-relative URLs in a browser.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.includes("\n") || raw.includes("\r")) return "/";
  const pathOnly = raw.split("?")[0] ?? "";
  if (pathOnly === GATE_PATH || pathOnly.startsWith(`${GATE_PATH}/`)) {
    return "/";
  }
  return raw;
}

/**
 * The participant's own flow stays open while the gate is on, for every
 * method -- a Server Action is a POST to the page route:
 *
 * - `/qr` -- the code the host holds up (issue #57). Exact path.
 * - `/intake` and everything under it -- registration and the declared round.
 * - `/quiz` and everything under it -- the fifteen blocks.
 * - `/results` -- where block 15 hands off. Exact path: `/results/<lens>` is
 *   the reveal (issue #10), and the reveal is the product.
 *
 * The password protects the product -- `/`, `/room`, `/rank`, `/match`,
 * `/simulate`, `/design`, the reveal -- and nothing a person who scanned the
 * code is asked to do. `/gate` itself is open so the password can be POSTed.
 */
export const OPEN_PAGES = ["/qr", "/results"] as const;
export const OPEN_PREFIXES = ["/intake", "/quiz"] as const;

/**
 * What an open page may fetch without the cookie: the whole of
 * `/_next/static/` -- stylesheets, fonts and the client JavaScript -- and the
 * favicon. The registration screen is interactive (the on-device photo
 * re-encode, the camera), so withholding the chunks would hand the
 * participant a form that cannot take a photo. GET/HEAD only.
 */
export function isOpenAsset(pathname: string): boolean {
  if (pathname === "/favicon.ico") return true;
  if (!pathname.startsWith("/_next/static/")) return false;
  // A browser normalises `..` away before the request is sent, and Next would
  // not serve outside the folder anyway -- refused here too, so the rule reads
  // the way it is meant: the folder, not anything that can spell its name.
  return !pathname.includes("..");
}

function isExactly(pathname: string, path: string): boolean {
  return pathname === path || pathname === `${path}/`;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** May this request through without the cookie? */
export function isOpen(pathname: string, method: string): boolean {
  if (isExactly(pathname, GATE_PATH)) return true;
  if (OPEN_PAGES.some((page) => isExactly(pathname, page))) return true;
  if (OPEN_PREFIXES.some((prefix) => isUnder(pathname, prefix))) return true;
  const verb = method.toUpperCase();
  return (verb === "GET" || verb === "HEAD") && isOpenAsset(pathname);
}

/** What the proxy should do with one request. */
export type GateDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" };

export type GateRequest = {
  /** `SITE_GATE_PASSWORD`; empty or undefined disables the gate entirely. */
  password: string | undefined;
  pathname: string;
  /** Path + query, used as the `next` target of the redirect. */
  target?: string;
  method: string;
  /** The `Accept` header, which is how a navigation is told from a fetch. */
  accept: string | null | undefined;
  cookie: string | null | undefined;
};

/**
 * The decision table: path x method x cookie.
 *
 * A navigation (GET/HEAD asking for HTML) gets the gate page so a human sees
 * something. Everything else -- Server Actions (POSTs to the page route),
 * route handlers, `/_next/*` assets, `robots.txt`, `OPTIONS` -- gets a bare
 * 401, which tells a crawler or a curious developer nothing at all. The only
 * exceptions are `isOpen`: the gate page, the participant's flow and the
 * static assets.
 */
export function decideGate(request: GateRequest): GateDecision {
  const password = request.password ?? "";
  if (!password) return { kind: "allow" };

  if (isOpen(request.pathname, request.method)) return { kind: "allow" };

  if (gateCookieIsValid(request.cookie, password)) return { kind: "allow" };

  const method = request.method.toUpperCase();
  const wantsHtml = (request.accept ?? "").includes("text/html");
  if ((method === "GET" || method === "HEAD") && wantsHtml) {
    return {
      kind: "redirect",
      to: safeNextPath(request.target ?? request.pathname),
    };
  }

  return { kind: "unauthorized" };
}
