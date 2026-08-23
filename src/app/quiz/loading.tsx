/**
 * `/quiz`'s Suspense fallback (docs/domain.md D16).
 *
 * `loading.tsx` wraps the page in a Suspense boundary, so a navigation into
 * `/quiz` commits at once and this streams while `quizProgress` reads. Reads
 * never generate any more -- the page answers `pending` and `GenerationWait`
 * takes over when the block is not written -- so what this covers is the
 * handful of SELECTs on venue wifi, and it is laid out as the same column as
 * the wait screen it most often resolves into, so the two do not jump.
 *
 * It must not await anything: a Suspense fallback that suspends on a read is
 * not a loading screen (the `/results` note in docs/domain.md §7). So it
 * carries no count, no name, no block and no avatar -- the wordmark, and what
 * is happening.
 *
 * `role="status"` with `aria-live="polite"` announces the line on arrival and
 * lets the block replace it without cutting a screen reader off mid-sentence.
 * The pulse is decoration, and `motion-safe:` keeps it off under reduced motion.
 *
 * A Server Component with no state, so it costs the phone nothing on the wire.
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
