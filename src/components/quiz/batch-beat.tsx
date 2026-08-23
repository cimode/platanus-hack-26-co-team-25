import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The opening moment and the two between-batch beats (issue #9,
 * `CLAUDE_DESIGN_QUIZ_BLOCK.md` §3: "between-batch moments are *transitions*,
 * not waits").
 *
 * Presentational and server-rendered: it holds no state, so it stays off the
 * client bundle entirely. The batch it opens is already stored by the time
 * this renders — `quizProgress` obtained it — and the roll-forward prefetch
 * for the batch after it is scheduled by `page.tsx` in `after()`, not here.
 *
 * Under D16 it is also the designed loading moment: the request that renders
 * this screen is the one that authored the batch inline if the entry prefetch
 * had not landed. So a beat is never a spinner — it is the five seconds of
 * reading that pay for the five blocks behind it.
 *
 * `?start=1` dismisses it. Progress is read from the rows, so the beat cannot
 * be "already dismissed" in a column: the URL is the whole of that state, and
 * a reload without it simply shows the moment again.
 */
export function BatchBeat({ batch }: { batch: number }) {
  const opening = batch <= 1;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6 py-10">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
          dipia · quiz
        </p>

        <h1 className="font-display text-4xl leading-tight font-extrabold text-ink">
          {opening ? (
            <>
              Quince escenas<span className="text-primary">.</span>
            </>
          ) : (
            `Tanda ${batch} de 3`
          )}
        </h1>

        <p className="text-base text-ink-soft">
          {opening
            ? "En cada una marcas la opción que más se parece a ti y la que menos. No hay respuestas correctas."
            : "Cinco escenas más. Sigue con lo primero que se te venga a la cabeza."}
        </p>
      </div>

      <Button
        asChild
        className="h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
      >
        <Link href="/quiz?start=1">{opening ? "Empezar" : "Seguir"}</Link>
      </Button>
    </main>
  );
}
