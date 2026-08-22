"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";
import { findParticipant } from "@/lib/use-cases/list-participants";
import { IMPERSONATION_COOKIE, type ImpersonateState } from "./impersonation";
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
