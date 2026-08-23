"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarKey } from "@/lib/domain/emotes/emotes";
import { cn } from "@/lib/utils";
import { subscribeAction } from "./action-bus";
import { FacedAvatar } from "./faced-avatar";
import { useEmotePlayer } from "./use-emote-player";

/**
 * `babyOnBoard` — the match reveal, saved as one library sequence.
 *
 * Two avatars walk in from the edges in their own direction (`walk-right` /
 * `walk-left`, faces turned away in profile), meet at the centre and fall in
 * love (`love`, front — the faces appear), the screen eclipses to black with
 * hearts, and a third avatar is born: the child, wearing a face generated from
 * both parents'.
 *
 * It plays on mount (`auto`) and again whenever the action bus fires
 * `babyOnBoard` — which is what `fireEvent("kid", "babyOnBoard", pair)` does,
 * i.e. what the simulation calls when the narrator gives the pair a child. A
 * fired signal may carry a fresh `childFaceUrl` (a just-generated offspring),
 * which overrides the prop for that take.
 *
 * Animation only: the surrounding copy belongs to the screen, which can follow
 * along through `onPhase`. Motion stops under `prefers-reduced-motion` — the
 * whole timeline collapses to the final portrait.
 */

interface Person {
  readonly avatar: AvatarKey;
  readonly faceUrl: string | null;
  readonly name: string;
}

export type BabyPhase = "approach" | "meet" | "eclipse" | "reveal";

export interface BabyOnBoardProps {
  /** Enters from the left, walking right. */
  readonly a: Person;
  /** Enters from the right, walking left. */
  readonly b: Person;
  /** The newborn avatar; `faceUrl` is the generated offspring face. */
  readonly child: {
    readonly avatar: AvatarKey;
    readonly faceUrl: string | null;
  };
  /** Play once on mount. Default true. */
  readonly auto?: boolean;
  /** Called as each beat begins, so a screen can sync its copy. */
  readonly onPhase?: (phase: BabyPhase) => void;
  readonly className?: string;
}

export function BabyOnBoard({
  a,
  b,
  child,
  auto = true,
  onPhase,
  className,
}: BabyOnBoardProps) {
  const [take, setTake] = useState(auto ? 1 : 0);
  const [childFace, setChildFace] = useState<string | null>(child.faceUrl);

  useEffect(() => {
    return subscribeAction((signal) => {
      if (signal.action !== "babyOnBoard") return;
      if (signal.pair?.childFaceUrl !== undefined)
        setChildFace(signal.pair.childFaceUrl);
      setTake((n) => n + 1);
    });
  }, []);

  return (
    <div
      className={cn(
        "relative isolate size-full overflow-hidden bg-dark [container-type:size]",
        className
      )}
    >
      {take > 0 ? (
        <Stage
          a={a}
          b={b}
          child={{ avatar: child.avatar, faceUrl: childFace }}
          key={take}
          onPhase={onPhase}
        />
      ) : null}
    </div>
  );
}

const OFF_A = "-10%";
const OFF_B = "110%";
const REST_A = "43%";
const REST_B = "57%";
const FLANK_A = "39%";
const FLANK_B = "61%";

interface Heart {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
}

function makeHearts(n: number): Heart[] {
  return Array.from({ length: n }, (_, id) => ({
    id,
    left: 8 + Math.random() * 84,
    size: 16 + Math.random() * 24,
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 1.7,
    drift: -60 + Math.random() * 120,
  }));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function Stage({
  a,
  b,
  child,
  onPhase,
}: {
  a: Person;
  b: Person;
  child: { avatar: AvatarKey; faceUrl: string | null };
  onPhase?: (phase: BabyPhase) => void;
}) {
  const pa = useEmotePlayer();
  const pb = useEmotePlayer();
  const pc = useEmotePlayer();

  const [ax, setAx] = useState(OFF_A);
  const [bx, setBx] = useState(OFF_B);
  const [walk, setWalk] = useState(false); // has the approach transition armed
  const [front, setFront] = useState(false); // parents turned to face front
  const [showChild, setShowChild] = useState(false);
  const [veil, setVeil] = useState(false);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const hearts16 = useMemo(() => makeHearts(20), []);

  const phaseRef = useRef(onPhase);
  phaseRef.current = onPhase;

  // Mount-only timeline; a replay is a remount (the `key` on this component).
  // biome-ignore lint/correctness/useExhaustiveDependencies: players/setters are stable; this runs once per take
  useEffect(() => {
    const emit = (p: BabyPhase) => phaseRef.current?.(p);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    const flank = () => {
      pa.stop();
      pb.stop();
      setFront(true);
      setAx(FLANK_A);
      setBx(FLANK_B);
    };
    const reveal = () => {
      emit("reveal");
      setVeil(false);
      at(1000, () => setHearts([]));
      setShowChild(true);
      pc.play("celebrate");
    };

    if (prefersReducedMotion()) {
      flank();
      reveal();
      return () => timers.forEach(clearTimeout);
    }

    // 1) directional profile walk in from the edges (faces turned away)
    emit("approach");
    pa.play("walk-right", { loop: true });
    pb.play("walk-left", { loop: true });
    const raf = requestAnimationFrame(() => {
      setWalk(true);
      setAx(REST_A);
      setBx(REST_B);
    });

    // 2) they turn front and fall in love — faces appear
    at(3800, () => {
      emit("meet");
      setFront(true);
      pa.play("love");
      pb.play("love");
    });

    // 3) eclipse, swap under black, lighten onto the child
    at(6100, () => {
      emit("eclipse");
      setVeil(true);
      setHearts(hearts16);
    });
    at(7200, flank);
    at(8600, reveal);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: "38cqh",
          background:
            "radial-gradient(120% 90% at 50% 130%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 70%)",
        }}
      />

      <Mover x={ax} armed={walk} bottom="13cqh">
        <FacedAvatar
          avatar={a.avatar}
          faceUrl={a.faceUrl}
          height="34cqh"
          label={a.name}
          onEnd={pa.stop}
          playing={pa.playing}
          showFace={front}
        />
      </Mover>

      <Mover x={bx} armed={walk} bottom="13cqh">
        <FacedAvatar
          avatar={b.avatar}
          faceUrl={b.faceUrl}
          height="34cqh"
          label={b.name}
          onEnd={pb.stop}
          playing={pb.playing}
          showFace={front}
        />
      </Mover>

      <Mover x="50%" armed={false} bottom="9cqh" hidden={!showChild}>
        <FacedAvatar
          avatar={child.avatar}
          faceUrl={child.faceUrl}
          height="24cqh"
          label="bebé"
          onEnd={pc.stop}
          playing={pc.playing}
          showFace={true}
        />
      </Mover>

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-20 bg-dark transition-opacity duration-1000",
          veil ? "opacity-100" : "opacity-0"
        )}
      />

      {hearts.length > 0 ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-30 overflow-hidden"
        >
          {hearts.map((h) => (
            <span
              className="absolute bottom-[22cqh] text-primary"
              key={h.id}
              style={{
                left: `${h.left}%`,
                fontSize: `${h.size}px`,
                animation: `heart-float ${h.duration}s ease-out ${h.delay}s infinite`,
                ["--heart-drift" as string]: `${h.drift}px`,
              }}
            >
              ❤
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function Mover({
  x,
  armed,
  bottom,
  hidden = false,
  children,
}: {
  x: string;
  armed: boolean;
  bottom: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute z-10 -translate-x-1/2 transition-[left,opacity] ease-in-out",
        hidden ? "opacity-0" : "opacity-100"
      )}
      style={{
        left: x,
        bottom,
        transitionDuration: armed ? "3800ms, 500ms" : "0ms, 500ms",
      }}
    >
      {children}
    </div>
  );
}
