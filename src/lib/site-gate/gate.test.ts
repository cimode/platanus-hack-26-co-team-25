import { describe, expect, it } from "vitest";
import {
  decideGate,
  gateCookieIsValid,
  gateCookieValue,
  passwordIsCorrect,
  safeNextPath,
} from "./gate";

/** AC-5 -- the pure halves of the gate (issue #50). */

const HTML = "text/html,application/xhtml+xml";

describe("safeNextPath", () => {
  it("keeps a same-origin path with its query and refuses everything else", () => {
    expect(safeNextPath("/intake?room=x")).toBe("/intake?room=x");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/gate")).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });
});

describe("gateCookieValue", () => {
  it("is stable for one password and different for another", () => {
    expect(gateCookieValue("p")).toBe(gateCookieValue("p"));
    expect(gateCookieValue("p")).not.toBe(gateCookieValue("p2"));
  });

  it("never contains the password", () => {
    expect(gateCookieValue("hunter2")).not.toContain("hunter2");
  });

  it("validates only its own password", () => {
    expect(gateCookieIsValid(gateCookieValue("p"), "p")).toBe(true);
    expect(gateCookieIsValid(gateCookieValue("p"), "p2")).toBe(false);
    expect(gateCookieIsValid("", "p")).toBe(false);
    expect(gateCookieIsValid(null, "p")).toBe(false);
    // A prefix of the right value must not pass.
    expect(gateCookieIsValid(gateCookieValue("p").slice(0, 10), "p")).toBe(
      false
    );
  });
});

describe("passwordIsCorrect", () => {
  it("accepts the exact password only", () => {
    expect(passwordIsCorrect("p", "p")).toBe(true);
    expect(passwordIsCorrect("P", "p")).toBe(false);
    expect(passwordIsCorrect("pp", "p")).toBe(false);
    expect(passwordIsCorrect("", "p")).toBe(false);
    expect(passwordIsCorrect("anything", "")).toBe(false);
  });
});

describe("decideGate", () => {
  const password = "s3cret";
  const cookie = gateCookieValue(password);

  it("allows everything when the password variable is empty", () => {
    for (const pathname of ["/", "/intake", "/_next/static/x.js", "/api/x"]) {
      expect(
        decideGate({
          password: "",
          pathname,
          method: "GET",
          accept: HTML,
          cookie: null,
        })
      ).toEqual({ kind: "allow" });
    }
    expect(
      decideGate({
        password: undefined,
        pathname: "/intake",
        method: "POST",
        accept: null,
        cookie: null,
      })
    ).toEqual({ kind: "allow" });
  });

  it("redirects an HTML navigation to the gate, carrying the target", () => {
    expect(
      decideGate({
        password,
        pathname: "/room",
        target: "/room?lens=romantic",
        method: "GET",
        accept: HTML,
        cookie: null,
      })
    ).toEqual({ kind: "redirect", to: "/room?lens=romantic" });
  });

  it("401s everything that is not an HTML navigation", () => {
    const cases: Array<[string, string, string | null]> = [
      ["/_next/image", "GET", "image/avif"],
      ["/_next/data/build/room.json", "GET", "*/*"],
      ["/api/anything", "GET", "application/json"],
      ["/robots.txt", "GET", "text/plain"],
      ["/", "HEAD", null],
      ["/room", "OPTIONS", HTML],
      ["/room", "POST", HTML],
    ];
    for (const [pathname, method, accept] of cases) {
      expect(
        decideGate({ password, pathname, method, accept, cookie: null }),
        `${method} ${pathname}`
      ).toEqual({ kind: "unauthorized" });
    }
  });

  it("allows /gate itself so the password can be typed", () => {
    expect(
      decideGate({
        password,
        pathname: "/gate",
        method: "POST",
        accept: HTML,
        cookie: null,
      })
    ).toEqual({ kind: "allow" });
  });

  it("keeps the participant's flow and its assets open, and the product gated", () => {
    const open: Array<[string, string]> = [
      ["/qr", "GET"],
      ["/qr/", "HEAD"],
      ["/intake", "GET"],
      ["/intake", "POST"],
      ["/quiz", "GET"],
      ["/quiz", "POST"],
      ["/results", "GET"],
      ["/_next/static/css/app.css", "GET"],
      ["/_next/static/chunks/%5Broot%5D__dev._.css", "GET"],
      ["/_next/static/media/baloo.woff2", "GET"],
      ["/_next/static/chunks/main-app.js", "GET"],
      ["/_next/static/chunks/app/intake/page.js", "GET"],
      ["/favicon.ico", "GET"],
    ];
    for (const [pathname, method] of open) {
      expect(
        decideGate({ password, pathname, method, accept: null, cookie: null }),
        `${method} ${pathname}`
      ).toEqual({ kind: "allow" });
    }
    const closed: Array<[string, string, string | null]> = [
      ["/qr/anything", "GET", HTML],
      ["/qrcode", "GET", HTML],
      ["/intake-x", "GET", HTML],
      ["/quizzes", "GET", HTML],
      ["/results/romantic", "GET", HTML],
      ["/", "GET", HTML],
      ["/room", "GET", HTML],
      ["/rank", "GET", HTML],
      ["/match", "GET", HTML],
      ["/simulate/abc", "GET", HTML],
      ["/design", "GET", HTML],
      ["/_next/static/css/app.css", "POST", null],
      ["/_next/static/media/../chunks/x.js", "GET", null],
      ["/_next/image", "GET", "image/avif"],
    ];
    for (const [pathname, method, accept] of closed) {
      expect(
        decideGate({ password, pathname, method, accept, cookie: null }).kind,
        `${method} ${pathname}`
      ).not.toBe("allow");
    }
  });

  it("allows any request that carries a valid cookie", () => {
    for (const [pathname, method] of [
      ["/intake", "GET"],
      ["/_next/static/chunks/a.js", "GET"],
      ["/intake", "POST"],
      ["/robots.txt", "HEAD"],
    ]) {
      expect(
        decideGate({ password, pathname, method, accept: null, cookie })
      ).toEqual({ kind: "allow" });
    }
  });

  it("refuses a cookie minted from a rotated password", () => {
    expect(
      decideGate({
        password: "rotated",
        pathname: "/room",
        method: "GET",
        accept: HTML,
        cookie,
      })
    ).toEqual({ kind: "redirect", to: "/room" });
  });
});
