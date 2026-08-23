import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { LENS_COOKIE } from "@/app/lens";
import { SimulatedLifeScreen } from "@/components/simulate/simulated-life-screen";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";

/**
 * Screen 1f — the simulated life for the viewer and one other person under the
 * active lens. The URL names the other person only; the viewer always comes
 * from the impersonation cookie.
 */
/**
 * A live pair simulation costs ~33s (`docs/domain.md` D19): the model narrates
 * the beats year by year, and only a cache hit returns immediately. The
 * platform default is well under that, so without this the request is killed
 * mid-generation and the screen fails for a reason that has nothing to do with
 * the code.
 *
 * 120s matches `/intake` and `/quiz`, the other two routes that wait on a
 * model, and sits under every plan's ceiling.
 */
export const maxDuration = 120;

export default async function SimulatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: otherId } = await params;
  const store = await cookies();
  const viewerId = store.get(IMPERSONATION_COOKIE)?.value;
  const rawLens = store.get(LENS_COOKIE)?.value;
  const lens = isLens(rawLens) ? rawLens : null;

  if (!viewerId) redirect("/");
  if (!lens) redirect("/room");

  const life = await serverDeps().timelines.simulate({
    subjectId: viewerId,
    otherId,
    lens,
  });
  if (life === null) notFound();

  return <SimulatedLifeScreen lens={lens} life={life} />;
}
