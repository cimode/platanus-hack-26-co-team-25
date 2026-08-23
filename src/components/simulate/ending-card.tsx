import type { Ending } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * How it ends.
 *
 * TWO branches, not three. `Ending` has no `"open"` variant, because friendship
 * never reaches this type at all -- it is a `PairedTimeline` field and the
 * friendship branch structurally lacks it. Writing an `"open"` case here would
 * be handling something unreachable, which reads to the next person as though
 * it can happen.
 *
 * No probability, no percentage, no survival fraction (AUDIT.md S10). The
 * simulation narrates ONE life it played out, not a distribution over lives --
 * "68% chance you last" is a claim this product cannot support and would not
 * make even if it could.
 *
 * The epilogue renders AFTER the ending in document order, and only on the
 * `apart` branch, because that is where the type puts it.
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
      aria-label="Cómo termina"
      className={cn(
        "flex min-h-[168px] w-[248px] shrink-0 flex-col justify-center gap-2 rounded-[18px] p-4",
        "border-2 border-ink-faint/35 border-dashed bg-background/90"
      )}
    >
      {ending.outcome === "together" ? (
        <>
          <p className="font-display font-bold text-[15px] text-ink">
            Llegan juntos al año {horizonYears}.
          </p>
          <p className="font-mono text-[10.5px] text-ink-muted leading-relaxed">
            hasta donde alcanza esta simulación, siguen ahí.
          </p>
        </>
      ) : (
        <>
          <p className="font-display font-bold text-[15px] text-ink">
            Se separan en el año {ending.year}.
          </p>
          {ending.epilogue ? (
            <p className="font-mono text-[10.5px] text-ink-muted leading-relaxed">
              {ending.epilogue}
            </p>
          ) : null}
        </>
      )}

      <p className="mt-1 font-mono text-[9.5px] text-ink-faint lowercase">
        una vida posible con {otherName}, no una predicción
      </p>
    </section>
  );
}
