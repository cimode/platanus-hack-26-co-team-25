import { cn } from "@/lib/utils";

/**
 * What you look at while a life is being written.
 *
 * This is not decoration. `docs/domain.md` D19 measures a live pair simulation
 * at **~33 seconds** -- the model imagines the beats year by year, and only a
 * cache hit is instant. Thirty seconds of a blank screen reads as a broken app,
 * so the wait needs somewhere to be spent.
 *
 * It renders the SAME venue as `/room`, deliberately: you tapped through from a
 * room you were standing in, and the flow should not dump you onto a white page
 * to wait. The room stays, the people are gone, and two of them are walking off
 * to go live the life you asked about.
 *
 * `loading.tsx` AWAITS NOTHING (`docs/domain.md:332`). It is a Suspense
 * fallback: the moment it needs data it stops being instant, which defeats the
 * only job it has.
 */
export default function SimulateLoading() {
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 overflow-hidden bg-dark">
      {/* `bg-cover` at `center 70%`, which is screen 1a's technique for a
          STATIC venue -- not `RoomCanvas`'s.
          
          The canvas keeps the plate at its own aspect inside a horizontal
          scroller and centres it by setting `scrollLeft` on mount. Copying that
          here without the scroller showed the left edge of the art: pipes and a
          window, not a room. There is nothing to drag on a loading screen, so
          the right move is to frame the middle of the plate rather than to
          reproduce a mechanism whose whole job was to let you leave the edge.
          
          `center 70%` keeps the FLOOR in frame as the crop tightens; centring
          it shows ceiling pipes on a short screen. */}
      <div
        aria-hidden="true"
        className="venue-drift pixelated absolute inset-0 select-none bg-cover"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 70%",
        }}
      />

      {/* A cream veil, not a dark scrim: the palette is warm and a dark overlay
          muddies the art. Same technique as screens 1a and 1c. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, color-mix(in oklab, var(--background) 62%, transparent) 0%, color-mix(in oklab, var(--background) 80%, transparent) 100%)",
        }}
      />

      <div
        aria-busy="true"
        aria-live="polite"
        className={cn(
          "relative m-auto flex w-[280px] flex-col items-center gap-3",
          "rounded-[22px] bg-card px-6 py-7 text-center",
          // NOT `shadow-toy`: that shadow reads from `--primary-shadow` and
          // gives a card the coral lip of a button. Nothing here is pressable.
          "shadow-[0_8px_28px_rgba(51,38,29,0.18)]"
        )}
        role="status"
      >
        {/* The pair, walking. A spinner would say "something is happening";
            these two say WHAT is happening, and they cost nothing extra --
            `@utility walking` already exists and is already inside the
            `prefers-reduced-motion` block, so this stops when it should. */}
        <span aria-hidden="true" className="flex items-end gap-1">
          <span
            className="walking pixelated block h-[62px] w-[34px] bg-bottom bg-contain bg-no-repeat"
            style={{ backgroundImage: "url(/sprites/avatar1.png)" }}
          />
          <span
            className="walking pixelated block h-[62px] w-[34px] bg-bottom bg-contain bg-no-repeat"
            style={{
              backgroundImage: "url(/sprites/avatar3.png)",
              animationDelay: "-0.4s",
            }}
          />
        </span>

        <h1 className="font-display font-extrabold text-[19px] text-ink leading-tight">
          Escribiendo esta vida
        </h1>

        {/* Honest about the cost. "Cargando" on a thirty-second wait is a lie
            of omission -- people leave at ten. Naming the work buys the time. */}
        <p className="font-display text-[13px] text-ink-muted leading-snug">
          El modelo está imaginando año por año. Toma unos segundos.
        </p>

        <p className="font-mono text-[9.5px] text-ink-faint lowercase">
          se escribe una vez · después es instantánea
        </p>
      </div>
    </main>
  );
}
