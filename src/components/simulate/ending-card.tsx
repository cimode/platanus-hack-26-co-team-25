import type { Ending } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * The end of the board, and the only thing on this screen that asks for
 * anything.
 *
 * TWO branches, not three. `Ending` has no `"open"` variant, because friendship
 * never reaches this type at all -- it is a `PairedTimeline` field and the
 * friendship branch structurally lacks it. An `"open"` case here would be
 * handling something unreachable, which reads to the next person as though it
 * can happen.
 *
 * No probability, no percentage, no survival fraction (AUDIT.md S10). The
 * simulation narrates ONE life it played out, not a distribution over lives.
 *
 * The CTA is INERT, and that is the requirement rather than an omission: no
 * Server Action, no write, nothing that changes what any other person can see
 * (AC-SIM-8). The line under it describes what accepting WOULD do once that
 * flow exists with its own consent story -- it is copy, not a promise this
 * button currently keeps.
 */
export function EndingCard({
  ending,
  horizonYears,
  otherName,
}: {
  ending: Ending;
  horizonYears: number;
  otherName: string;
}) {
  return (
    <section
      aria-label="Fin de la simulación"
      className={cn(
        "relative shrink-0 self-center",
        "flex w-[276px] flex-col gap-2 rounded-[20px] p-5",
        "border-2 border-primary/55 bg-card shadow-toy"
      )}
    >
      <p className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.1em]">
        fin de la simulación
      </p>

      {ending.outcome === "together" ? (
        <>
          <h2 className="font-display font-extrabold text-[19px] text-ink leading-tight">
            ¿Se conocen en persona?
          </h2>
          <p className="font-display text-[13px] text-ink-muted leading-snug">
            Llegan juntos al año {horizonYears}. Está a unos metros de ti, ahora
            mismo.
          </p>
        </>
      ) : (
        <>
          <h2 className="font-display font-extrabold text-[19px] text-ink leading-tight">
            ¿Se conocen en persona?
          </h2>
          <p className="font-display text-[13px] text-ink-muted leading-snug">
            Se separan en el año {ending.year}.
            {ending.epilogue ? ` ${ending.epilogue}` : ""}
          </p>
        </>
      )}

      <button
        className={cn(
          "mt-1 w-full rounded-[14px] bg-primary px-5 py-3",
          "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
          "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
          "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
        )}
        type="button"
      >
        Proponer encuentro
      </button>

      <p className="font-mono text-[9px] text-ink-faint leading-snug lowercase">
        si acepta → ubicación en vivo compartida dentro del lugar
      </p>

      <p className="font-mono text-[9px] text-ink-faint lowercase">
        una vida posible con {otherName}, no una predicción
      </p>
    </section>
  );
}
