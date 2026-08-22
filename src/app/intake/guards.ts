import { redirect } from "next/navigation";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import type { Consent, Participant } from "@/lib/domain/participant";

/**
 * The two guards every screen after step 3 repeats (issue #8).
 *
 * Progress is read from the rows and never from a status column
 * (docs/domain.md §0), so each of `/intake/declared` and `/intake/gates/*`
 * re-resolves the participant from the `hookai_session` cookie and re-checks
 * the floor for itself: a URL typed into the bar reaches the page without the
 * one before it ever rendering.
 *
 * `photoUrl` is the second floor rule (§0), and the redirect carries the
 * participant's OWN room so step 2 renders instead of "This room doesn't
 * exist": `/intake` resolves a slug from `?room=` or `HOOKAI_ROOM_SLUG`, and
 * the venue default is not set outside the venue.
 */
export async function requireIntakeParticipant(): Promise<Participant> {
  const deps = serverDeps();
  const token = await readSessionToken();
  const me = token ? await deps.participants.bySessionToken(token) : null;

  // No cookie, or a cookie nobody answers to: step 1.
  if (!me) redirect("/intake");

  if (!me.photoUrl) {
    const room = await deps.rooms.byId(me.roomId);
    redirect(room ? intakePath(room.slug) : "/intake");
  }

  return me;
}

/** The URL step 2 renders at; the page re-resolves the slug (D9). */
export function intakePath(slug: string): string {
  return `/intake?${new URLSearchParams({ room: slug }).toString()}`;
}

/** Which gate screen a lens is asked on; friendship has none (D5). */
export type Gate = "romantic" | "business";

/**
 * The next gate this participant consented to after `done`, or `/quiz`.
 *
 * The order is the order consent was asked in. A lens without consent has no
 * screen at all -- not a disabled one, not an empty one: asking is itself a
 * disclosure event (PILLARS.md A8), so the participant is forwarded past it
 * before a single control renders.
 *
 * `/quiz` belongs to issue #9; this issue only ever points at it.
 */
export function nextGatePath(consent: Consent, done?: Gate): string {
  if (done === undefined && consent.romantic) return "/intake/gates/romantic";
  if (done !== "business" && consent.business) return "/intake/gates/business";
  return "/quiz";
}
