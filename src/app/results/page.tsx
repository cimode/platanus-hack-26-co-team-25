import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * `/results` — no longer the hand-off target of the last block, and no longer
 * a dead end either.
 *
 * The completing write and `/quiz`'s own completed branch both send people to
 * `/room` now: with `resolveViewerId` bridging `dipia_session` and
 * `dipia_impersonating`, someone who registered and finished arrives there
 * identified and can pick a lens. This page used to be where they landed
 * instead, with no link anywhere — the demo simply stopped.
 *
 * It is KEPT rather than deleted, for one reason that is not sentiment:
 * `src/lib/site-gate/gate.ts` lists `/results` in `OPEN_PAGES`, and
 * `e2e/site-gate.spec.ts` AC-5 asserts it answers without bouncing to the gate.
 * While `SITE_GATE_PASSWORD` is set, `/room` is behind the password and this
 * page is not — so this stays the one completion-adjacent screen a participant
 * can always reach, and the way out of it has to exist.
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

      <h1 className="font-display font-extrabold text-4xl text-ink">Listo</h1>

      <p className="text-base text-ink-muted">
        Terminaste las doce. Entra a la sala y elige cómo quieres conectar.
      </p>

      <Link
        className={cn(
          "mt-2 w-fit rounded-[14px] bg-primary px-5 py-2.5",
          "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        )}
        href="/room"
      >
        Entrar a la sala
      </Link>
    </main>
  );
}
