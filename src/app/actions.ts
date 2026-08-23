"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { IMPERSONATION_COOKIE } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";
import { continueQuizGeneration } from "@/lib/use-cases/ensure-quiz-batch";
import { findParticipant } from "@/lib/use-cases/list-participants";
import type { ImpersonateState } from "./impersonation";
import { LENS_COOKIE } from "./lens";

/**
 * Adopt a participant's identity for the demo.
 *
 * DELIBERATELY UNAUTHENTICATED. This is the internal demo control -- the screen
 * says "sin contraseña" because there is none. It must not survive past the
 * hackathon: anything that ships to real participants needs a real session, and
 * this action would hand any visitor any identity in the room.
 *
 * The id arriving in the FormData is untrusted -- a Server Action is a public
 * HTTP endpoint, reachable without ever rendering the page. So it is resolved
 * against the roster before it is written anywhere.
 */
export async function impersonateAction(
  _previous: ImpersonateState,
  formData: FormData
): Promise<ImpersonateState> {
  const id = formData.get("participantId");

  if (typeof id !== "string" || id === "") {
    return { error: "Elige a alguien de la lista para continuar." };
  }

  const deps = serverDeps();
  const participant = await findParticipant(id, deps);
  if (!participant) {
    return { error: "Esa persona no está en la lista." };
  }

  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, participant.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // Start authoring this participant's questions now, in the background
  // (docs/domain.md D20). The roster carries no room, so the venue default is
  // the room generation is claimed under -- the same one `/intake` falls back
  // to; without it there is nothing to claim and nothing is scheduled.
  //
  // `after` runs once the response is sent and is bounded by this route's
  // maxDuration (120s on `src/app/page.tsx`), which is why the budget here is
  // 90s rather than the registration action's 240s: one batch, two at most.
  // `continueQuizGeneration` never rejects -- an unhandled rejection in a
  // background task would crash the invocation -- and stops itself when the
  // budget is spent; the quiz reads never generate, so whatever is missing is
  // authored by the next claim holder.
  //
  // TEMPORARY HOME. Registration (#6) is the real "a participant arrives"
  // event and already does this; impersonation keeps it for the demo path.
  const venueSlug = process.env.HOOKAI_ROOM_SLUG;
  const room = venueSlug ? await deps.rooms.bySlug(venueSlug) : null;
  if (room) {
    const roomId = room.id;
    after(() =>
      continueQuizGeneration(
        { participantId: participant.id, roomId, budgetMs: 90_000 },
        serverDeps()
      )
    );
  }

  // `redirect` signals by throwing, so nothing below runs and the declared
  // return type is only reached on the error paths above.
  redirect("/room");
}

/**
 * Commit to a lens and move on to the ranking.
 *
 * The submitted value is checked against the three real lenses rather than
 * trusted: the cookie it writes drives `lens-*` on every screen downstream, and
 * an unrecognised value there means a subtree that silently keeps the default
 * accent instead of the one the user chose.
 */
export async function chooseLensAction(formData: FormData): Promise<void> {
  const lens = formData.get("lens");
  if (!isLens(lens)) return;

  const store = await cookies();
  store.set(LENS_COOKIE, lens, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/rank");
}
