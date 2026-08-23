/**
 * `/results` — the hand-off target of block 12 (issue #9).
 *
 * A placeholder on purpose, and a small one: #10 replaces this whole route
 * with `/results/[lens]` (the loading moment, the lens switcher and the ranked
 * list). It exists here because the completing write has to land somewhere
 * that is not a 404 mid-demo, and because "the quiz is over" is a real state
 * the rows can express — `participants.quiz_completed_at` is non-null, and
 * `/quiz` sends anyone in that state here rather than serving block 12 again.
 *
 * It carries no number: `e2e/quiz.spec.ts` asserts that no counter is visible
 * once the quiz is done, so "12/12 respuestas" here would read as a block.
 */
export default function ResultsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        dipia · quiz
      </p>

      <h1 className="font-display text-4xl font-extrabold text-ink">Listo</h1>

      <p className="text-base text-ink-muted">
        Terminaste las doce. Guarda el teléfono: lo que sigue aparece en la
        pantalla grande.
      </p>
    </main>
  );
}
