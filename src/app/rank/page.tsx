import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LENS_COOKIE } from "@/app/lens";
import { RankBoard } from "@/components/rank/rank-board";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import type { RankedRoom } from "@/lib/domain/reveal/rank";
import { isLens, type Lens } from "@/lib/domain/room/layout";
import { enterRoom } from "@/lib/use-cases/enter-room";
import { cn } from "@/lib/utils";

/**
 * Screen 1c -- the ranking.
 *
 * A Server Component. The ranking belongs to the VIEWER and nobody else, so
 * there is no dynamic segment and `searchParams` is never read: `/rank?subject=x`
 * has to be inert, and the strongest way to guarantee that is to have no code
 * that could look (AC-RANK-1).
 *
 * Identity is resolved the way `/room` resolves it -- `resolveViewerId` (the
 * impersonation cookie, else the participant behind `dipia_session`) fed
 * through `enterRoom` and the real `ParticipantsPort`. The ranking itself is
 * now real too: `RankingPort.forSubject` is `prepareResults` with its
 * repositories already bound, so nothing on this screen is fabricated.
 *
 * The resolver runs AFTER the lens check below, not before: without a lens this
 * screen must reach no data source at all (AC-RANK-5), and resolving a session
 * token is a repository read.
 *
 * The whole screen is one flex column that fills the viewport: a tight header,
 * a hairline, the rank row centred in everything that is left, and one line of
 * footer. The first build stacked those from the top and left half a phone of
 * dead cream below the fold.
 */
export default async function RankPage() {
  const store = await cookies();
  const raw = store.get(LENS_COOKIE)?.value;

  // Checked FIRST and returned on, so no data call happens at all without a
  // lens (AC-RANK-5). A ranking with no lens is not an empty ranking; it is a
  // question that was never asked.
  if (!isLens(raw)) return <NoLens />;

  const deps = serverDeps();
  const meId = await resolveViewerId(deps);
  const { me } = await enterRoom(meId ?? undefined, deps);

  // Same rule as `/room`: no `me` is a broken session, not an empty state.
  if (!me) redirect("/");

  /*
   * The real ranking, scored from the room's own responses.
   *
   * `forSubject` takes the VIEWER and nothing else that could name a subject,
   * so `/rank?subject=x` is not merely ignored here -- it is unrepresentable
   * at the port (AC-RANK-1). The entries carry their own `photoUrl`, so the
   * board no longer needs the room's sprites threaded through it.
   */
  const room = await deps.ranking.forSubject(me.id, raw);

  return (
    <main
      /*
       * The lens class rides the WHOLE subtree, so `--primary` and `shadow-toy`
       * follow the choice and not one component below contains a conditional
       * colour (AC-RANK-7). No raw hex, no invented utility.
       */
      className={cn(
        `lens-${raw}`,
        "relative mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden"
      )}
    >
      <VenueFloor />
      <Header lens={raw} name={me.name} />
      <Body room={room} />
      <Hint />
    </main>
  );
}

/**
 * The same room you just walked out of, still behind you.
 *
 * Screen 1b puts you IN the venue; this one is the same place seen from the
 * same angle, so the ranking reads as a thing happening in that room rather
 * than a list rendered on a blank page.
 *
 * The veil is CREAM, not a dark scrim -- exactly the technique screen 1a uses
 * for its plate. A dark overlay muddies the art and breaks the warm palette in
 * one stroke; fading the page's own background DOWN over the art makes the
 * floor emerge from the screen instead of being pasted onto it.
 */
function VenueFloor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[80%] bg-cover opacity-[0.28]"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 74%",
        }}
      />
      {/*
        Two veils, not one, and they do different jobs.

        The first fades the art in from the hairline so there is no seam where
        the plate begins. The second is a flat wash across the whole thing:
        without it the venue's own signage -- "platanus hack [26]", the sponsor
        wall -- reads THROUGH the people standing in front of it, and the row
        stops being the subject of the screen. Atmosphere has to lose to
        content every time.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[80%]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, color-mix(in oklab, var(--background) 62%, transparent) 26%, color-mix(in oklab, var(--background) 52%, transparent) 100%)",
        }}
      />
    </>
  );
}

/** The design's own words. `/room`'s picker says "trabajando"; this says what it ranks. */
const LENS_TITLE: Record<Lens, string> = {
  romantic: "Rank Romántico",
  business: "Rank de Negocios",
  friendship: "Rank de Amistad",
};

function Header({ lens, name }: { lens: Lens; name: string }) {
  return (
    <header className="relative shrink-0 px-6 pt-5 pb-2.5">
      <div className="flex items-center gap-1.5">
        <Link
          aria-label="Volver a la sala"
          className="-ml-1 shrink-0 text-ink-muted transition-colors hover:text-ink"
          href="/room"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="font-display font-extrabold text-[26px] text-ink leading-none">
          {LENS_TITLE[lens]}
        </h1>
        {/* The lens, as one dot. The accent is already on the subtree; this is
            just where you can see which one you picked without reading. */}
        <span
          aria-hidden="true"
          className="ml-auto size-2.5 rounded-full bg-primary"
        />
      </div>
      <p className="mt-1.5 font-mono text-[10.5px] text-ink-muted lowercase">
        {name} · solo tú ves este ranking
      </p>
    </header>
  );
}

function Body({ room }: { room: RankedRoom }) {
  if (room.status === "not-consented") {
    return (
      <Blocked
        cta="Elegir con quién quiero conectar"
        href="/intake"
        title="Todavía no diste permiso para esta lente"
      />
    );
  }

  if (room.status === "below-floor") {
    return (
      <Blocked
        cta="Completar mi perfil"
        href="/intake"
        title="Tu perfil todavía no está completo"
      />
    );
  }

  if (room.entries.length === 0) {
    /*
     * The room is still filling in -- NOT "nobody wanted you". The copy names
     * no one and counts no one, because a count of the absent is itself a
     * disclosure about who opted out (AC-RANK-6, AC-PORT-5).
     */
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6">
        <p
          aria-label="La sala todavía se está llenando"
          className="rounded-[18px] border-2 border-ink-faint/25 border-dashed px-6 py-10 text-center font-mono text-[11px] text-ink-muted lowercase"
          role="status"
        >
          la sala todavía se está llenando. vuelve en un rato.
        </p>
      </div>
    );
  }

  return <RankBoard entries={room.entries} />;
}

/**
 * The two states where the VIEWER is the reason there is no ranking.
 *
 * One shape for both, and deliberately: it names the stage to go back to and
 * nothing finer. `RankedRoom` carries no `floorReason`, and inventing one here
 * would widen a contract issue #10 implements (R14). No other person's name
 * appears anywhere on this branch -- that is the whole point of it.
 */
function Blocked({
  cta,
  href,
  title,
}: {
  cta: string;
  href: string;
  title: string;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 items-center px-6">
      <section className="flex w-full flex-col items-start gap-3 rounded-[20px] bg-card p-6 shadow-toy">
        <h2 className="font-display font-bold text-ink text-lg">{title}</h2>
        <Link
          className={cn(
            "rounded-[14px] bg-primary px-5 py-2.5",
            "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          href={href}
        >
          {cta}
        </Link>
      </section>
    </div>
  );
}

function Hint() {
  return (
    <p className="relative shrink-0 px-6 pt-2 pb-5 font-mono text-[10px] text-ink-faint lowercase">
      ⟷ solo arrastre horizontal · la fila es la línea del rank
    </p>
  );
}

/** No lens cookie. Reached without touching any data source at all. */
function NoLens() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 py-16">
      <h1 className="font-display font-extrabold text-2xl text-ink">
        Primero elige cómo quieres conectar
      </h1>
      <p className="font-mono text-[11px] text-ink-muted lowercase">
        el ranking depende de la lente: no es el mismo para amistad que para
        trabajo.
      </p>
      <Link
        className={cn(
          "w-fit rounded-[14px] bg-primary px-5 py-2.5",
          "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        )}
        href="/room"
      >
        Volver a la sala
      </Link>
    </main>
  );
}
