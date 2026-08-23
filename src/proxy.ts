import { type NextRequest, NextResponse } from "next/server";
import { decideGate, GATE_COOKIE_NAME, GATE_PATH } from "@/lib/site-gate/gate";

/**
 * The site gate (issue #50).
 *
 * `proxy.ts` is the Next 16 name for what used to be `middleware.ts`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * It defaults to the Node.js runtime, so `node:crypto` inside
 * `@/lib/site-gate/gate` is fine.
 *
 * There is deliberately **no `config.matcher` export**. Without a matcher the
 * proxy runs on every single request -- pages, route handlers, Server Actions
 * (which are POSTs to the page route), `/_next/static`, `/_next/image`,
 * `/_next/data` and everything under `public/`. That total coverage is the
 * whole point: the audience is developers with LLMs, and any excluded path is
 * a sneak peek. The only allow-list is `/gate`, and it lives in the decision
 * table rather than in a matcher so it cannot be widened by accident.
 *
 * `SITE_GATE_PASSWORD` is the switch. Unset (local dev, CI, every existing e2e
 * run) this function does nothing at all.
 */
export function proxy(request: NextRequest) {
  const password = process.env.SITE_GATE_PASSWORD ?? "";
  const { pathname, search } = request.nextUrl;

  const decision = decideGate({
    password,
    pathname,
    target: `${pathname}${search}`,
    method: request.method,
    accept: request.headers.get("accept"),
    cookie: request.cookies.get(GATE_COOKIE_NAME)?.value,
  });

  if (decision.kind === "allow") {
    const response = NextResponse.next();
    // While the gate is on, nothing about this deployment should be indexed --
    // not even the pages an unlocked browser can see.
    if (password) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (decision.kind === "redirect") {
    const url = new URL(GATE_PATH, request.url);
    url.searchParams.set("next", decision.to);
    const response = NextResponse.redirect(url, 302);
    setGatedHeaders(response.headers);
    return response;
  }

  // Empty body on purpose: a crawler, a curious `curl` and an LLM reading the
  // response all learn the same nothing.
  const response = new NextResponse(null, { status: 401 });
  setGatedHeaders(response.headers);
  return response;
}

function setGatedHeaders(headers: Headers) {
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
}
