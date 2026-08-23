"use client";

/**
 * The app's error boundary (Next `error.tsx`: a route segment's own boundary,
 * required to be a Client Component).
 *
 * It exists because the flow deliberately throws. `quizProgress` propagates
 * `InstrumentVersionMismatchError` rather than rendering a block against the
 * wrong structure (docs/domain.md D2), and a driving adapter can always meet a
 * database that is momentarily gone. Without a boundary the participant meets
 * Next's own crash page, in English, on a phone, mid-quiz -- and the room's
 * host has no idea whether to tell them to reload.
 *
 * So: the wordmark, one sentence in the product's voice, and a button that
 * retries the render it failed on. Nothing here names what was being measured
 * or what broke; `reset()` re-runs the segment, which is the right first move
 * for every transient cause above.
 */
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
          dipia
        </p>
        <h1 className="font-display text-3xl leading-tight font-extrabold text-ink">
          Se nos cayó algo<span className="text-primary">.</span>
        </h1>
        <p className="text-base text-ink-soft">
          No es culpa tuya y no perdiste nada de lo que ya respondiste. Vuelve a
          intentarlo.
        </p>
      </div>

      <button
        className="h-12 w-full shrink-0 rounded-2xl bg-primary font-display text-base font-bold text-primary-foreground shadow-toy transition-transform active:translate-y-1 active:shadow-none"
        onClick={reset}
        type="button"
      >
        Reintentar
      </button>
    </main>
  );
}
