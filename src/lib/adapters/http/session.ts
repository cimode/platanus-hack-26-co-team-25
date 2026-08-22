import { cookies } from "next/headers";
import type { SessionToken } from "@/lib/domain/participant";

/**
 * The `hookai_session` cookie -- the ONLY module that reads or writes it.
 *
 * Identity is a session token in an httpOnly cookie (docs/domain.md D4): no
 * email, no login, and a new device is a new participant. Keeping both sides of
 * the cookie here is what makes "the token is never readable from page script"
 * a property of one file rather than a convention spread over three actions and
 * a page.
 */

export const SESSION_COOKIE = "hookai_session";

/** A week: longer than the event, shorter than "forever" for a demo credential. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * `secure` off in development so the cookie survives `http://localhost`, on
 * everywhere else -- a session cookie sent in the clear on venue wifi is the
 * whole of this product's auth.
 */
const SECURE = process.env.NODE_ENV !== "development";

export async function readSessionToken(): Promise<SessionToken | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return value ? (value as SessionToken) : null;
}

/**
 * Only callable from a Server Action or Route Handler -- HTTP cannot set a
 * cookie once a Server Component has begun streaming (Next `cookies()` docs).
 */
export async function setSessionCookie(token: SessionToken): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: SECURE,
    maxAge: MAX_AGE_SECONDS,
  });
}
