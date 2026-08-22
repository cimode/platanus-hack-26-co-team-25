"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { serverDeps } from "@/lib/composition";
import { prefetchQuizBatch } from "@/lib/use-cases/ensure-quiz-batch";
import { findParticipant } from "@/lib/use-cases/list-participants";
import { IMPERSONATION_COOKIE, type ImpersonateState } from "./impersonation";

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
    return { error: "Elegí a alguien de la lista para continuar." };
  }

  const participant = await findParticipant(id, serverDeps());
  if (!participant) {
    return { error: "Esa persona no está en la lista." };
  }

  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, participant.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // Start authoring this participant's first five blocks now, in the
  // background (docs/domain.md D16). Measured at ~40-70s; they will spend
  // longer than that on the room and the declared round, so by the time /quiz
  // needs block 1 it is already stored and the screen does one SELECT.
  //
  // `after` runs once the response is sent and is bounded by this route's
  // maxDuration, so it costs the participant nothing. `prefetchQuizBatch`
  // never rejects -- an unhandled rejection in a background task would crash
  // the invocation -- and if it fails anyway, `ensureQuizBatch` simply authors
  // inline when the quiz is reached.
  //
  // TEMPORARY HOME. This belongs in registration (#6); impersonation is
  // today's only "a participant arrives" event. Move it, do not duplicate it.
  after(() =>
    prefetchQuizBatch({ participantId: participant.id, batch: 1 }, serverDeps())
  );

  // `redirect` signals by throwing, so nothing below runs and the declared
  // return type is only reached on the error paths above.
  redirect("/room");
}
