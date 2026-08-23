import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { LENS_COOKIE } from "@/app/lens";
import { LifeBoard } from "@/components/simulate/life-board";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

/**
 * Screen 1f -- one simulated life, for this viewer and one other person.
 *
 * A Server Component. `otherId` comes from the segment and the subject from
 * `resolveViewerId` -- the impersonation cookie, else the participant behind
 * `dipia_session`: the URL names WHO you are simulating with, never who you
 * are. The session fallback adds a way to BE someone, not a way to see more:
 * the resolved id is passed as `subjectId` and everything downstream is
 * unchanged.
 *
 * Unknown id, yourself, and anyone absent from your ranking under this lens all
 * reach the same `notFound()`. One check, not three -- a distinguishable 404 is
 * an oracle for who is in the room (AC-SIM-2).
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
  const { id } = await params;
  const store = await cookies();
  const lens = store.get(LENS_COOKIE)?.value;

  if (!isLens(lens)) redirect("/room");

  const deps = serverDeps();
  const viewerId = await resolveViewerId(deps);
  if (!viewerId) redirect("/");

  /*
   * THE REAL PORT, not a fixture.
   *
   * This screen shipped against `mockSimulatedLife` for exactly as long as it
   * took the other team to land issue #33 -- `simulate-pair`, the engine
   * adapter and a Postgres cache, wired here as `serverDeps().timelines`. Their
   * data beats a fixture outright, so the fixture is deleted rather than kept
   * as a fallback: a screen that renders invented lives in the demo and real
   * ones in production is a screen nobody can trust either way.
   *
   * The seam held. Their `simulate-pair` returns `SimulatedLife` from
   * `@/lib/domain/reveal/timeline` -- the type R13 argued back into existence
   * after an earlier refactor deleted it. Had it stayed deleted, this would be
   * two incompatible shapes to reconcile instead of one import.
   */
  const life = await deps.timelines.simulate({
    subjectId: viewerId,
    otherId: id,
    lens,
  });
  if (!life) notFound();

  return (
    <main
      className={cn(
        `lens-${lens}`,
        "relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden"
      )}
    >
      <VenueFloor />
      <LifeBoard lens={lens} life={life} />
      <p className="relative shrink-0 px-6 pt-2 pb-6 font-mono text-[10px] text-ink-faint lowercase">
        ⟷ solo arrastre horizontal · auto-avanza con los avatares
      </p>
    </main>
  );
}

function VenueFloor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated pointer-events-none absolute inset-0 bg-cover opacity-[0.34]"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 74%",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, color-mix(in oklab, var(--background) 58%, transparent) 14%, color-mix(in oklab, var(--background) 48%, transparent) 46%, color-mix(in oklab, var(--background) 72%, transparent) 78%, color-mix(in oklab, var(--background) 84%, transparent) 100%)",
        }}
      />
    </>
  );
}
