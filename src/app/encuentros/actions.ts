"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LENS_COOKIE } from "@/app/lens";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";

/**
 * The meet loop's two writes.
 *
 * A Server Action is a public HTTP endpoint reachable without ever rendering
 * the form that calls it, so both of these resolve the viewer from cookies and
 * re-check every argument. Nothing here trusts a hidden input for WHO is
 * acting -- the form may name who is being asked, never who is asking.
 */

/** Ask someone to meet. Called from the ending card on `/simulate/[id]`. */
export async function proposeMeetAction(formData: FormData): Promise<void> {
  const otherId = formData.get("otherId");
  if (typeof otherId !== "string" || otherId === "") return;

  const store = await cookies();
  const lens = store.get(LENS_COOKIE)?.value;
  if (!isLens(lens)) return;

  const deps = serverDeps();
  const viewerId = await resolveViewerId(deps);
  if (!viewerId) return;

  await deps.meets.propose({
    viewerId,
    otherId,
    lens,
    // Validated inside the use case against the two closed sets.
    place: formData.get("place"),
    time: formData.get("time"),
  });

  // The sender's own copy of the request lives on `/encuentros`, so that is
  // what has to be re-read. `/simulate/[id]` is re-read too: its card switches
  // to the "already asked" state from the same rows.
  revalidatePath("/encuentros");
  revalidatePath(`/simulate/${otherId}`);
}

/** Accept or decline one request. Called from `/encuentros`. */
export async function respondMeetAction(formData: FormData): Promise<void> {
  const requestId = formData.get("requestId");
  const decision = formData.get("decision");
  if (typeof requestId !== "string" || requestId === "") return;
  if (decision !== "accept" && decision !== "decline") return;

  const deps = serverDeps();
  const viewerId = await resolveViewerId(deps);
  if (!viewerId) return;

  await deps.meets.respond(requestId, viewerId, decision === "accept");

  revalidatePath("/encuentros");
}
