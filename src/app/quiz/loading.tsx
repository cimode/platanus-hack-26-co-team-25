/**
 * `/quiz`'s loading moment (docs/domain.md D16).
 *
 * `loading.tsx` wraps the page in a Suspense boundary, so a navigation into
 * `/quiz` commits at once and this streams while `quizProgress` works. That
 * work is normally one SELECT -- batch 1 was authored in `after()` at
 * registration -- but for the participant who outran the prefetch, or whose
 * prefetch failed, it is `ensureQuizBatch` writing five blocks inline, measured
 * at ~40-70s. Without this file the browser sat on the last screen of the
 * declared round with no feedback for all of it, and the hand-off read as
 * frozen.
 *
 * It must not await anything: a Suspense fallback that suspends on a read is
 * not a loading screen (the `/results` note in docs/domain.md §7). So it carries
 * no count, no name and no block -- the wordmark, and what is happening.
 *
 * `role="status"` with `aria-live="polite"` announces the line on arrival and
 * lets the block replace it without cutting a screen reader off mid-sentence.
 * The pulse is decoration, and `motion-safe:` keeps it off under reduced motion.
 *
 * A Server Component with no state, so it costs the phone nothing on the wire.
 * Laid out as `BatchBeat` is -- the screen it most often resolves into.
 */
export default function QuizLoading() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6 py-10">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
          dipia · quiz
        </p>

        <p className="font-display text-4xl leading-tight font-extrabold text-ink lowercase">
          dipia<span className="text-primary">.</span>
        </p>

        <p
          aria-live="polite"
          className="font-mono text-xs tracking-[0.06em] text-ink-muted tabular-nums motion-safe:animate-pulse"
          role="status"
        >
          Escribiendo tus preguntas…
        </p>
      </div>
    </main>
  );
}
