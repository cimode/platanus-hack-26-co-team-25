"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ImagineOffspringState,
  imagineOffspringAction,
} from "@/app/match/actions";
import { cn } from "@/lib/utils";

/**
 * The match reveal, client-side (CONTEXT.md §3 step 6).
 *
 * A three-beat choreography over a black stage:
 *
 *   approach → two circles slide in from opposite edges to almost touch
 *   eclipse  → a veil fades the screen to full black; hearts float up
 *   reveal   → the veil lifts on THREE circles: the two faces above, the
 *              AI-imagined child below
 *
 * The layout swaps from two circles to three *while the veil is opaque*, so the
 * rearrangement is never seen — the eclipse is the cut. The child's generation
 * (a server action, ~18s) is fired on mount and runs alongside the animation;
 * the third circle shows a pending state until it resolves, so a slow model
 * never holds the beats.
 *
 * Motion is decoration: under `prefers-reduced-motion` the whole timeline
 * collapses to the final reveal at once, and no heart ever moves.
 *
 * Two components on purpose: `MatchReveal` owns what SURVIVES a replay (the
 * generated child), and the inner `MatchStage` owns the animation. "De nuevo"
 * bumps a key so the stage remounts and its mount-only timeline runs afresh —
 * cleaner than re-driving state, and it keeps the effect's dependency list
 * honestly empty.
 */

interface Face {
  src: string;
  name: string;
}

type Phase = "approach" | "eclipse" | "reveal";

const APPROACH_MS = 2200;
const AFTER_APPROACH_MS = 2600;
const VEIL_FADE_MS = 700;
const SWAP_AFTER_ECLIPSE_MS = 900;
const ECLIPSE_HOLD_MS = 2600;

interface Heart {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
}

function makeHearts(count: number): Heart[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: 6 + Math.random() * 88,
    delay: Math.random() * 1.6,
    duration: 1.9 + Math.random() * 1.6,
    size: 20 + Math.random() * 26,
    drift: -40 + Math.random() * 80,
  }));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function MatchReveal({
  parentA,
  parentB,
}: {
  parentA: Face;
  parentB: Face;
}) {
  const [runId, setRunId] = useState(0);
  const [child, setChild] = useState<ImagineOffspringState>({ status: "idle" });

  // Generation runs once on mount and again only when asked; it deliberately
  // does NOT restart when the animation replays.
  const generate = useCallback(() => {
    setChild({ status: "idle" });
    imagineOffspringAction().then(setChild, (error: unknown) =>
      setChild({
        status: "error",
        message:
          error instanceof Error ? error.message : "no se pudo generar la cría",
      })
    );
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <MatchStage
      child={child}
      key={runId}
      onRegenerate={generate}
      onReplay={() => setRunId((n) => n + 1)}
      parentA={parentA}
      parentB={parentB}
    />
  );
}

function MatchStage({
  parentA,
  parentB,
  child,
  onReplay,
  onRegenerate,
}: {
  parentA: Face;
  parentB: Face;
  child: ImagineOffspringState;
  onReplay: () => void;
  onRegenerate: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("approach");
  const [slid, setSlid] = useState(false);
  const [showTriad, setShowTriad] = useState(false);
  const hearts = useMemo(() => makeHearts(16), []);

  // Mount-only: every value it touches is a module constant, a stable setter,
  // or a global, so the empty dependency list is the honest one. Replay is a
  // remount (the `key` on this component), not a re-run of this effect.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setSlid(true);
      setShowTriad(true);
      setPhase("reveal");
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const push = (ms: number, fn: () => void) =>
      timers.push(setTimeout(fn, ms));
    // Next frame: flip `slid` so the transition from off-screen actually runs.
    const raf = requestAnimationFrame(() => setSlid(true));

    push(AFTER_APPROACH_MS, () => setPhase("eclipse"));
    push(AFTER_APPROACH_MS + SWAP_AFTER_ECLIPSE_MS, () => setShowTriad(true));
    push(AFTER_APPROACH_MS + ECLIPSE_HOLD_MS, () => setPhase("reveal"));

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  const veilVisible = phase === "eclipse";
  const revealed = phase === "reveal";

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6">
      {/* Caption / headline, above the stage. */}
      <div className="absolute inset-x-0 top-10 z-30 flex flex-col items-center gap-2 px-6 text-center">
        <p className="font-mono text-[11px] text-background/70 lowercase tracking-[0.06em]">
          dipia · match
        </p>
        <h1
          className={cn(
            "font-display font-extrabold text-background transition-all duration-700",
            revealed ? "text-4xl opacity-100" : "text-2xl opacity-80"
          )}
        >
          {revealed ? "¡es un match!" : "¿harán match?"}
        </h1>
      </div>

      {/* The stage. Pair layout until the triad swaps in under the eclipse. */}
      <div className="relative flex w-full flex-1 items-center justify-center">
        {showTriad ? (
          <div
            className={cn(
              "flex flex-col items-center gap-5 transition-opacity duration-700",
              revealed ? "opacity-100" : "opacity-0"
            )}
          >
            <div className="flex items-start justify-center gap-5">
              <FaceCircle face={parentA} size="sm" />
              <FaceCircle face={parentB} size="sm" />
            </div>
            <ChildCircle
              onRetry={onRegenerate}
              parents={[parentA.name, parentB.name]}
              state={child}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <FaceCircle
              className={cn(
                "transition-transform ease-in-out",
                slid ? "translate-x-0" : "-translate-x-[130vw]"
              )}
              face={parentA}
              style={{ transitionDuration: `${APPROACH_MS}ms` }}
            />
            <FaceCircle
              className={cn(
                "transition-transform ease-in-out",
                slid ? "translate-x-0" : "translate-x-[130vw]"
              )}
              face={parentB}
              style={{ transitionDuration: `${APPROACH_MS}ms` }}
            />
          </div>
        )}
      </div>

      {/* The veil: fades the whole screen to full black between the beats. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-20 bg-dark transition-opacity",
          veilVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDuration: `${VEIL_FADE_MS}ms` }}
      />

      {/* Hearts, above the veil, only while the screen is eclipsed. */}
      {veilVisible ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-30 overflow-hidden"
        >
          {hearts.map((heart) => (
            <span
              className="absolute bottom-24 text-primary"
              key={heart.id}
              style={{
                left: `${heart.left}%`,
                fontSize: `${heart.size}px`,
                animation: `heart-float ${heart.duration}s ease-out ${heart.delay}s infinite`,
                ["--heart-drift" as string]: `${heart.drift}px`,
              }}
            >
              ❤
            </span>
          ))}
        </div>
      ) : null}

      {/* Controls appear once the reveal has landed. */}
      {revealed ? (
        <div className="absolute inset-x-0 bottom-8 z-30 flex justify-center gap-3">
          <button
            className="rounded-full bg-background px-5 py-2.5 font-display text-sm font-bold text-ink shadow-toy transition-transform hover:-translate-y-0.5"
            onClick={onReplay}
            type="button"
          >
            de nuevo
          </button>
          <button
            className="rounded-full bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-toy transition-transform hover:-translate-y-0.5"
            onClick={onRegenerate}
            type="button"
          >
            otro bebé
          </button>
        </div>
      ) : null}
    </div>
  );
}

const SIZE = {
  lg: "size-40",
  sm: "size-32",
} as const;

function FaceCircle({
  face,
  size = "lg",
  className,
  style,
}: {
  face: Face;
  size?: keyof typeof SIZE;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <figure
      className={cn("flex flex-col items-center gap-2", className)}
      style={style}
    >
      <div
        className={cn(
          SIZE[size],
          "overflow-hidden rounded-full border-4 border-background/90 shadow-toy-lg"
        )}
      >
        {/* biome-ignore lint/performance/noImgElement: rendered full-bleed in a fixed circle; the child variant is a data: URL next/image cannot optimise */}
        <img
          alt={face.name}
          className="size-full object-cover"
          src={face.src}
        />
      </div>
      <figcaption className="rounded-full bg-dark/70 px-3 py-0.5 font-mono text-[11px] text-background lowercase">
        {face.name}
      </figcaption>
    </figure>
  );
}

function ChildCircle({
  state,
  parents,
  onRetry,
}: {
  state: ImagineOffspringState;
  parents: [string, string];
  onRetry: () => void;
}) {
  const alt = `bebé imaginado de ${parents[0]} y ${parents[1]}`;

  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "size-40 overflow-hidden rounded-full border-4 border-primary shadow-toy-lg",
          "flex items-center justify-center bg-dark/60"
        )}
      >
        {state.status === "ready" ? (
          // biome-ignore lint/performance/noImgElement: a data: URL from the image model, which next/image cannot optimise and must not try to
          <img
            alt={alt}
            className="size-full animate-in fade-in object-cover duration-700"
            src={state.imageUrl}
          />
        ) : state.status === "error" ? (
          <button
            aria-label="Reintentar generar el bebé"
            className="flex size-full flex-col items-center justify-center gap-1 text-primary"
            onClick={onRetry}
            type="button"
          >
            <span className="text-3xl">🙈</span>
            <span className="font-mono text-[10px] lowercase">reintentar</span>
          </button>
        ) : (
          <span
            className="text-3xl text-primary"
            style={{ animation: "heart-pulse 1.2s ease-in-out infinite" }}
          >
            ❤
          </span>
        )}
      </div>
      <figcaption className="rounded-full bg-dark/70 px-3 py-0.5 font-mono text-[11px] text-background lowercase">
        {state.status === "ready"
          ? "su bebé"
          : state.status === "error"
            ? "no salió"
            : "imaginando…"}
      </figcaption>
    </figure>
  );
}
