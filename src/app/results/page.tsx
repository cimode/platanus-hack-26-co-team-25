import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * `/results` — where the twelfth block hands off, and the end of the
 * participant's flow.
 *
 * IT IS THE HAND-OFF BECAUSE OF THE GATE. `src/lib/site-gate/gate.ts` opens
 * `/qr`, `/intake`, `/quiz` and `/results`, and nothing else. While
 * `SITE_GATE_PASSWORD` is set — which is exactly the pre-reveal window, the one
 * during which people actually fill the form — `/room` answers a redirect to a
 * password form the participant does not have. Both `actions.ts` and `/quiz`'s
 * own completed branch used to send them there, so the last thing a finished
 * participant saw was a wall.
 *
 * It used to be a TERMINAL, because every screen past the quiz was gated and a
 * CTA that lands on a password form is worse than no CTA. `/encuentros` is open
 * now (same list in `gate.ts`), so there is exactly ONE link onward and it goes
 * somewhere the participant can actually use. Everything else stays unlinked
 * until the reveal.
 *
 * It carries NO counter: `e2e/quiz.spec.ts` asserts none is visible once the
 * quiz is done (the locator matches `N/12`), so a progress number here would
 * read as a block and fail that assertion.
 *
 * Fully static — no `cookies()`, no data source. That is what keeps it
 * answerable without the gate cookie, which `e2e/site-gate.spec.ts` AC-5
 * asserts.
 */
export default function ResultsPage() {
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 overflow-hidden px-6 py-16">
      <VenueFloor />

      <p className="relative font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        dipia · listo
      </p>

      <h1 className="relative font-display font-extrabold text-[42px] text-ink leading-[0.95]">
        Gracias<span className="text-primary">.</span>
        <br />
        Ya estás dentro.
      </h1>

      <p className="relative text-base text-ink-soft">
        Tus respuestas quedaron guardadas. Eso era todo lo que necesitábamos de
        ti.
      </p>

      <p className="relative text-base text-ink-muted">
        Lo que hicimos con ellas te lo mostramos en vivo, en la demo. Un
        adelanto: en esta sala hay gente con la que encajas más de lo que crees,
        y ninguno de ustedes lo sabe todavía.
      </p>

      <Link
        className={cn(
          "relative mt-2 w-fit rounded-[14px] bg-primary px-5 py-2.5",
          "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
          "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        )}
        href="/encuentros"
      >
        Ver mis encuentros
      </Link>

      <p className="relative mt-1 font-mono text-[11px] text-ink-faint leading-relaxed lowercase">
        no cierres la pestaña · nos vemos en la demo
        <br />
        simula la vida que aún no ha pasado
      </p>
    </main>
  );
}

/**
 * The room they are about to be shown, already behind them.
 *
 * The veil is the one `/profile` uses, and deliberately: that screen's own
 * comment records why an opaque top third is required — "a paragraph read over
 * a sponsor wall is not atmospheric, it is unreadable". This screen is four
 * paragraphs, so it takes the proven treatment rather than the lighter wash
 * `/rank` can afford.
 */
function VenueFloor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated pointer-events-none absolute inset-0 bg-cover opacity-[0.2]"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 74%",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, var(--background) 22%, color-mix(in oklab, var(--background) 84%, transparent) 46%, color-mix(in oklab, var(--background) 55%, transparent) 100%)",
        }}
      />
    </>
  );
}
