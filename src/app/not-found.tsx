import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The app's own 404 (root `not-found.tsx`), for `notFound()` anywhere and for
 * every unmatched URL.
 *
 * Until now there was none, so both landed on Next's default: a white page, in
 * English, with no way out. That is the page `/profile/[id]` and
 * `/simulate/[id]` hand people, and those two routes reach it on purpose and
 * often -- every suppression cause collapses into one identical `notFound()`.
 *
 * THE COPY MUST SAY NOTHING ABOUT A PERSON.
 *
 * `/profile` and `/simulate` are deliberately oracle-proof: unknown id, your
 * own id, someone below the floor, someone who did not consent to this lens --
 * all one 404, byte-identical (AC-PROF-2, AC-SIM-2), because a distinguishable
 * one tells you who is in the room. Wording like "esa persona no está
 * disponible para vos" would leak, in prose, exactly what that design spends
 * two use cases protecting. So this page talks about the ADDRESS and never
 * about who might be behind it -- and it is fully static, so the two documents
 * `bodyText` compares in those specs stay identical.
 *
 * `404` is the `<h1>` and stays the `<h1>`: `e2e/simulate.spec.ts` AC-SIM-2
 * waits on that landmark before comparing the two bodies.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 bg-background px-6 py-16">
      <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        dipia
      </p>

      <h1 className="font-display font-extrabold text-6xl text-ink leading-none">
        404
      </h1>

      <p className="font-display font-bold text-2xl text-ink">
        Aquí no hay página
      </p>

      <p className="text-base text-ink-muted">
        El enlace no lleva a ninguna parte. Puede estar mal escrito o haber
        cambiado de lugar.
      </p>

      <Link
        className={cn(
          "mt-2 w-fit rounded-[14px] bg-primary px-5 py-2.5",
          "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        )}
        href="/room"
      >
        Volver a la sala
      </Link>
    </main>
  );
}
