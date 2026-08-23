"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fireEvent } from "@/components/emotes/action-bus";
import { BabyOnBoard, type BabyPhase } from "@/components/emotes/baby-on-board";
import { TimelineRail } from "@/components/simulate/timeline-rail";
import type { SimulatedLife } from "@/lib/domain/reveal/timeline";
import type { Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

const LENS_LABEL: Record<Lens, string> = {
  romantic: "lente romántico",
  business: "lente de negocios",
  friendship: "lente de amistad",
};

/**
 * Header and board together, because the year pill reads the board's position.
 *
 * The pill lives in the header per the design, and it has to track which tile
 * you are standing on -- so ONE component owns that number and hands it to
 * both. The alternative, two islands sharing state through a context, is more
 * machinery than a screen with a single piece of state deserves.
 *
 * The page above this stays a Server Component: it resolves the viewer, calls
 * the port and paints the venue. Only the number that changes as you drag is
 * on the wire.
 */
/** Rows older than the avatar column still get a body in the reveal. */
const FALLBACK_AVATAR = "avatar1" as const;

export function LifeBoard({ life, lens }: { life: SimulatedLife; lens: Lens }) {
  const [year, setYear] = useState(life.events[0]?.year ?? 1);

  // ─── DEMO ONLY · revert after the event ────────────────────────────────
  // See openspec/changes/demo-baby-always/. The reveal plays through the
  // action bus rather than by rendering it directly, so the presenter's
  // `dipiaActions.fireEvent("kid", "babyOnBoard")` keeps working and the
  // simulation and the console reach it the same way.
  const kidYear =
    life.events.find((event) => event.kind === "kid")?.year ?? null;
  const [phase, setPhase] = useState<BabyPhase | null>(null);
  const fired = useRef(false);

  const pair = useMemo(
    () => ({
      a: {
        avatar: life.other.avatar ?? FALLBACK_AVATAR,
        faceUrl: life.other.photoUrl,
        name: life.other.name,
      },
      b: {
        avatar: life.subject.avatar ?? FALLBACK_AVATAR,
        faceUrl: life.subject.photoUrl,
        name: "Tú",
      },
    }),
    [life.other, life.subject]
  );

  // The rail reports the centred year; the kid card arriving IS the cue.
  useEffect(() => {
    if (kidYear === null || fired.current || year < kidYear) return;
    fired.current = true;
    // The bus carries who and their faces; the avatars ride the props.
    fireEvent("kid", "babyOnBoard", {
      a: { id: life.other.id, name: pair.a.name, faceUrl: pair.a.faceUrl },
      b: { id: life.subject.id, name: pair.b.name, faceUrl: pair.b.faceUrl },
    });
  }, [year, kidYear, pair, life.other.id, life.subject.id]);

  // The reveal is the last beat; hold it, then give the rail back.
  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = setTimeout(() => setPhase(null), 5200);
    return () => clearTimeout(timer);
  }, [phase]);
  // ─── end DEMO ONLY ─────────────────────────────────────────────────────

  return (
    <>
      <header className="relative flex shrink-0 items-start gap-1.5 px-6 pt-5 pb-3">
        <Link
          aria-label="Volver al perfil"
          className="-ml-1 shrink-0 pt-0.5 text-ink-muted transition-colors hover:text-ink"
          href={`/profile/${life.other.id}`}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display font-extrabold text-[21px] text-ink leading-tight">
            Tú + {life.other.name}
          </h1>
          <p className="font-mono text-[10.5px] text-ink-faint lowercase">
            vida simulada · {LENS_LABEL[lens]}
          </p>
        </div>

        {/*
          Friendship structurally has no `horizonYears`, so the pill cannot be
          rendered for it -- the union narrows it away rather than a convention
          asking someone to remember (AC-SIM-4).
        */}
        {/*
         * NEUTRAL tokens, not `--band-*`.
         *
         * The design's pill is a soft tan and `--band-mid` is a soft tan, so
         * the first build reached for it -- and the source guard in
         * `simulate.spec.ts` caught it, which is the whole reason that guard
         * exists. A rank band and a simulated year mean different things; the
         * palette resemblance is a coincidence, and borrowing the token is
         * how a coincidence becomes an implied relationship.
         */}
        {life.lens === "friendship" ? null : (
          <span className="shrink-0 rounded-full border-2 border-ink-faint/30 bg-card px-3 py-1.5 font-display font-bold text-[12px] text-ink">
            Año {year} de {life.horizonYears}
          </span>
        )}
      </header>

      <TimelineRail life={life} onYear={setYear} />

      {/* DEMO ONLY · revert after the event. Mounted always so it hears the
          action bus; invisible until a take begins. */}
      <button
        aria-hidden={phase === null}
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-500",
          phase === null ? "pointer-events-none opacity-0" : "opacity-100"
        )}
        onClick={() => setPhase(null)}
        tabIndex={phase === null ? -1 : 0}
        type="button"
      >
        <BabyOnBoard
          a={pair.a}
          auto={false}
          b={pair.b}
          child={{
            avatar: life.subject.avatar ?? FALLBACK_AVATAR,
            faceUrl: null,
          }}
          onPhase={setPhase}
        />
      </button>
    </>
  );
}
