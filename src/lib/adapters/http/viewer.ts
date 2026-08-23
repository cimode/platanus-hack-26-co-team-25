import { cookies } from "next/headers";
import type { ParticipantId, SessionToken } from "@/lib/domain/participant";
import type { ParticipantRepository } from "@/lib/ports/participant-repository";
import { readSessionToken } from "./session";

/**
 * Who is looking, resolved from the request's cookies.
 *
 * The app carries two identity cookies and until now nothing bridged them:
 * `/intake` writes `dipia_session` and only `/quiz` reads it, while the demo
 * chooser writes `dipia_impersonating` and only `/room`, `/rank`, `/profile`
 * and `/simulate` read it. So a person who actually registered and finished
 * the quiz held a session and no impersonation, and every screen after the
 * quiz treated them as nobody -- `/room` bounced them to the demo console,
 * which lists the whole roster by name.
 *
 * One order, in one module, for all four screens:
 *
 *     dipia_impersonating  ??  participants.bySessionToken(dipia_session).id
 *
 * IMPERSONATION WINS. It is the demo control, and a control that cannot
 * override the real session is not a control -- the operator picking a name on
 * `/` has to land in that person's room even when their own browser holds a
 * session from registering earlier.
 *
 * It lives beside `session.ts` because it is the same kind of thing: a driving
 * adapter whose whole job is turning cookies into something the core can use.
 * The screens call it and pass the id down; they never read a cookie
 * themselves, so the two-cookie rule cannot drift back apart across four files.
 */

/** Who the demo is currently pretending to be -- the ONLY module that reads it. */
export const IMPERSONATION_COOKIE = "dipia_impersonating";

/** The two cookie values, already read. Split out so the rule is unit-testable. */
export interface ViewerCookies {
  /** `dipia_impersonating`: a participant id, or undefined when unset. */
  impersonating: string | undefined;
  /** `dipia_session`: the registration credential, or null when unset. */
  sessionToken: SessionToken | null;
}

export interface ViewerDeps {
  participants: Pick<ParticipantRepository, "bySessionToken">;
}

/**
 * The rule itself, over values rather than over a request.
 *
 * `deps.participants` is touched ONLY on the session branch, so a screen
 * holding an impersonation cookie resolves its viewer without opening a
 * connection -- `serverDeps().participants` is a getter, and this never fires
 * it when the answer is already in hand.
 */
export async function viewerIdFrom(
  viewerCookies: ViewerCookies,
  deps: ViewerDeps
): Promise<ParticipantId | null> {
  if (viewerCookies.impersonating) return viewerCookies.impersonating;
  if (viewerCookies.sessionToken === null) return null;

  // An unknown or tampered token resolves to null rather than throwing: the
  // adapter already guards the uuid cast, and a stale cookie is a stranger.
  const participant = await deps.participants.bySessionToken(
    viewerCookies.sessionToken
  );
  return participant?.id ?? null;
}

/** `viewerIdFrom` over the live request. Server Components and Actions only. */
export async function resolveViewerId(
  deps: ViewerDeps
): Promise<ParticipantId | null> {
  const store = await cookies();
  return viewerIdFrom(
    {
      impersonating: store.get(IMPERSONATION_COOKIE)?.value,
      // Through `session.ts`, which stays the only reader of its own cookie.
      sessionToken: await readSessionToken(),
    },
    deps
  );
}
