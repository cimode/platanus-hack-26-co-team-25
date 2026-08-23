import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { LENS_COOKIE } from "@/app/lens";
import { TimelineRail } from "@/components/simulate/timeline-rail";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

/**
 * Screen 1f -- one simulated life, for this viewer and one other person.
 *
 * A Server Component. `otherId` comes from the segment and the subject from the
 * impersonation cookie: the URL names WHO you are simulating with, never who
 * you are.
 *
 * Unknown id, yourself, and anyone absent from your ranking under this lens all
 * reach the same `notFound()`. One check, not three -- a distinguishable 404 is
 * an oracle for who is in the room (AC-SIM-2).
 */
export default async function SimulatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await cookies();
  const lens = store.get(LENS_COOKIE)?.value;

  if (!isLens(lens)) redirect("/room");

  const viewerId = store.get(IMPERSONATION_COOKIE)?.value;
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
  const life = await serverDeps().timelines.simulate({
    subjectId: viewerId,
    otherId: id,
    lens,
  });
  if (!life) notFound();

  return (
    <main
      className={cn(
        `lens-${lens}`,
        "relative mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden"
      )}
    >
      <VenueFloor />

      <header className="relative flex shrink-0 items-center gap-1.5 px-6 pt-5 pb-2">
        <Link
          aria-label="Volver al perfil"
          className="-ml-1 shrink-0 text-ink-muted transition-colors hover:text-ink"
          href={`/profile/${life.other.id}`}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="truncate font-display font-extrabold text-[21px] text-ink leading-none">
          {life.subject.name} y {life.other.name}
        </h1>
      </header>

      <TimelineRail life={life} />

      {/*
        INERT, and that is the requirement, not an omission. No Server Action,
        no form, no write, nothing that changes what any other person can see.
        Screen 1f is a simulation; proposing a meeting for real is a different
        issue with its own consent story, and shipping a button that half-works
        would be worse than shipping one that is honestly a placeholder
        (AC-SIM-8).
      */}
      <div className="relative shrink-0 px-6 pt-1 pb-7">
        <button
          className={cn(
            "w-full rounded-[16px] bg-primary px-5 py-3.5",
            "font-display font-bold text-[16px] text-primary-foreground shadow-toy",
            "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          type="button"
        >
          Proponer encuentro
        </button>
      </div>
    </main>
  );
}

/**
 * The same room as 1b, 1c and 1d. The flow never leaves the venue.
 *
 * The veil here runs the OPPOSITE way to screen 1d's: thinnest across the upper
 * half, thickest at the bottom. 1d has a paragraph up top and needed an opaque
 * ground for it; 1f has nothing above the rail but a name, so leaving that band
 * washed out made half a phone of dead cream -- the same complaint screen 1c
 * earned on its first build. Where there is no text to protect, show the room.
 */
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
