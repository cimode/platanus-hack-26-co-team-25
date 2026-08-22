import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { LENS_COOKIE } from "@/app/lens";
import { mockRankedRoom, type RankCandidate } from "@/components/rank/mock";
import { RankBoard } from "@/components/rank/rank-board";
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
 * Identity is resolved the way `/room` resolves it -- the impersonation cookie
 * through `enterRoom` and the real `ParticipantsPort`. Only the ranking itself
 * is fabricated, by `mockRankedRoom`, which issue #10's `prepareResults`
 * deletes.
 */
export default async function RankPage() {
  const store = await cookies();
  const raw = store.get(LENS_COOKIE)?.value;

  // Checked FIRST and returned on, so no data call happens at all without a
  // lens (AC-RANK-5). A ranking with no lens is not an empty ranking; it is a
  // question that was never asked.
  if (!isLens(raw)) return <NoLens />;

  const { me, others } = await enterRoom(
    store.get(IMPERSONATION_COOKIE)?.value,
    serverDeps()
  );

  // Same rule as `/room`: no `me` is a broken session, not an empty state.
  if (!me) redirect("/");

  const candidates: readonly RankCandidate[] = others.map((spot) => ({
    id: spot.participant.id,
    name: spot.participant.name,
    // The sprite is already stable per person, so a face never changes between
    // the room and the ranking. Real photos replace this at intake.
    photoUrl: spot.sprite,
  }));

  const room = mockRankedRoom(raw, me, candidates);

  return (
    <Shell lens={raw}>
      <Header lens={raw} name={me.name} />
      <Body room={room} />
    </Shell>
  );
}

/**
 * The lens class rides the whole subtree, so `--primary` and `shadow-toy`
 * follow the choice and not one component contains a conditional colour
 * (AC-RANK-7). No raw hex, no invented utility -- everything below resolves
 * through a token that `globals.css` already defines.
 */
function Shell({ children, lens }: { children: React.ReactNode; lens: Lens }) {
  return (
    <main
      className={cn(
        `lens-${lens}`,
        "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 py-8"
      )}
    >
      {children}
    </main>
  );
}

const LENS_LABEL: Record<Lens, string> = {
  romantic: "románticamente",
  business: "trabajando",
  friendship: "de amigos",
};

function Header({ lens, name }: { lens: Lens; name: string }) {
  return (
    <header className="flex flex-col gap-1.5 px-6">
      <Link
        aria-label="Volver a la sala"
        className="flex w-fit items-center gap-1 font-mono text-[11px] text-ink-faint lowercase"
        href="/room"
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
        la sala
      </Link>
      <h1 className="font-display font-extrabold text-3xl text-ink leading-tight">
        Con quién encajás{" "}
        <span className="text-primary">{LENS_LABEL[lens]}</span>
      </h1>
      <p className="font-mono text-[11px] text-ink-muted lowercase">
        {name} · sólo vos ves este ranking
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
      <p
        aria-label="La sala todavía se está llenando"
        className="mx-6 rounded-[18px] border-2 border-ink-faint/20 border-dashed px-5 py-10 text-center font-mono text-[11px] text-ink-muted lowercase"
        role="status"
      >
        la sala todavía se está llenando. volvé en un rato.
      </p>
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
    <section className="mx-6 flex flex-col items-start gap-3 rounded-[20px] bg-card p-6 shadow-toy">
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
  );
}

/**
 * No lens cookie. Reached without touching any data source at all.
 */
function NoLens() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-6 py-16">
      <h1 className="font-display font-extrabold text-2xl text-ink">
        Primero elegí cómo querés conectar
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
