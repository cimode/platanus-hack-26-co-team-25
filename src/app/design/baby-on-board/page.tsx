"use client";

import { useState } from "react";
import { BabyOnBoard, type BabyPhase, fireEvent } from "@/components/emotes";

/**
 * `/design/baby-on-board` — the `babyOnBoard` action, live.
 *
 * The reveal itself is `<BabyOnBoard>` from the emotes library. The button
 * fires it the exact way the simulation does — `fireEvent("kid",
 * "babyOnBoard", pair)` — so this page is both the catalogue entry and a proof
 * that the two-parameter call reaches the animation. Fixture faces stand in for
 * the registration photos; `childFaceUrl` stands in for a generated offspring.
 */

// All fields so one object serves both shapes: `BabyOnBoard`'s Person (avatar,
// faceUrl, name) and the bus's ActionPair (id, name, faceUrl).
const A = {
  id: "oso",
  avatar: "avatar1" as const,
  name: "Oso Dormilón",
  faceUrl: "/match/parent-a.jpg",
};
const B = {
  id: "zorro",
  avatar: "avatar3" as const,
  name: "Zorro Curioso",
  faceUrl: "/match/parent-b.jpg",
};
const CHILD_FACE = "/match/baby-placeholder.jpg";

const COPY: Record<BabyPhase, string> = {
  approach: "se acercan…",
  meet: "se encontraron",
  eclipse: "se encontraron",
  reveal: "su bebé",
};

export default function BabyOnBoardDemoPage() {
  const [phase, setPhase] = useState<BabyPhase>("approach");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
          design system · babyOnBoard
        </p>
        <h1 className="font-display text-3xl font-extrabold text-ink">
          babyOnBoard
        </h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          La acción de sala guardada en la librería de emotes. Dos avatares
          caminan en su dirección, se encuentran y se enamoran, la pantalla
          eclipsa y nace un tercer avatar con el rostro del hijo. El LLM la
          dispara con dos parámetros —{" "}
          <code className="font-mono text-xs">
            fireEvent(&quot;kid&quot;, &quot;babyOnBoard&quot;, pair)
          </code>{" "}
          — cuando la vida simulada de la pareja incluye un hijo.
        </p>
      </header>

      <div className="relative w-full overflow-hidden rounded-3xl border-2 border-border shadow-toy">
        <div className="aspect-video w-full">
          <BabyOnBoard
            a={A}
            b={B}
            child={{ avatar: "avatar2", faceUrl: CHILD_FACE }}
            onPhase={setPhase}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-6 z-40 text-center">
          <p className="font-mono text-[11px] tracking-[0.06em] text-background/70 lowercase">
            dipia · sala
          </p>
          <p className="font-display text-2xl font-extrabold text-background">
            {COPY[phase]}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-primary px-5 py-2.5 font-display text-sm font-bold text-primary-foreground shadow-toy transition-transform hover:-translate-y-0.5"
          onClick={() =>
            fireEvent("kid", "babyOnBoard", {
              a: A,
              b: B,
              childFaceUrl: CHILD_FACE,
            })
          }
          type="button"
        >
          disparar babyOnBoard
        </button>
        <p className="font-mono text-xs text-ink-faint lowercase">
          o desde la consola: dipiaActions.fireEvent(&quot;kid&quot;,
          &quot;babyOnBoard&quot;)
        </p>
      </div>
    </main>
  );
}
