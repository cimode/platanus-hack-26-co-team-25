import { redirect } from "next/navigation";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { intakeStepOf, type Participant } from "@/lib/domain/participant";

/**
 * The guard every screen after registration repeats (issue #8, #42).
 *
 * Progress is read from the rows and never from a status column
 * (docs/domain.md §0), so `/intake/declared` re-resolves the participant from
 * the `dipia_session` cookie and re-checks for itself: a URL typed into the
 * bar reaches the page without the one before it ever rendering.
 *
 * `intakeStepOf` is the single rule -- a row with no photo, no gender or no
 * birthdate is a registration that did not finish -- and the redirect carries
 * the participant's OWN room so the form renders instead of "Esta sala no
 * existe": `/intake` resolves a slug from `?room=` or `HOOKAI_ROOM_SLUG`, and
 * the venue default is not set outside the venue.
 */
export async function requireIntakeParticipant(): Promise<Participant> {
  const deps = serverDeps();
  const token = await readSessionToken();
  const me = token ? await deps.participants.bySessionToken(token) : null;

  // No cookie, or a cookie nobody answers to: the registration screen.
  if (!me) redirect("/intake");

  if (intakeStepOf(me) === "register") {
    const room = await deps.rooms.byId(me.roomId);
    redirect(room ? intakePath(room.slug) : "/intake");
  }

  return me;
}

/** The URL the registration screen renders at; the page re-resolves it (D9). */
export function intakePath(slug: string): string {
  return `/intake?${new URLSearchParams({ room: slug }).toString()}`;
}
