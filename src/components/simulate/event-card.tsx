import { tagFor } from "@/components/simulate/event-tag";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/** The seven families, as the classes that paint them. */
const TAG_TONE: Record<string, string> = {
  hito: "bg-tag-hito text-tag-hito-foreground",
  mudanza: "bg-tag-mudanza text-tag-mudanza-foreground",
  mascota: "bg-tag-mascota text-tag-mascota-foreground",
  peque: "bg-tag-peque text-tag-peque-foreground",
  ritual: "bg-tag-ritual text-tag-ritual-foreground",
  viaje: "bg-tag-viaje text-tag-viaje-foreground",
  roce: "bg-tag-roce text-tag-roce-foreground",
};

/**
 * One beat of the simulated life.
 *
 * EXACTLY one chip, and it comes from `tagFor(kind)` -- never from a lookup
 * this component owns. That function is an exhaustive `Record` with no
 * `default`, so a seventeenth `EventKind` fails `pnpm run typecheck` there
 * rather than rendering an unstyled chip nobody notices (AC-PORT-7).
 *
 * The chip's colour resolves from `--tag-*`, which is a DIFFERENT palette from
 * the rank bands' `--band-*` even though `--tag-ritual` and `--band-high` are
 * byte-identical. That collision is a coincidence of palette; treating it as a
 * shared meaning is how a chip starts implying a band.
 */
export function EventCard({
  event,
  delay,
}: {
  event: LifeEvent;
  delay: number;
}) {
  const tag = tagFor(event.kind);

  return (
    <article
      className={cn(
        "pop-in flex min-h-[168px] w-[212px] shrink-0 flex-col gap-2 rounded-[18px] bg-card p-4",
        "shadow-toy"
      )}
      /* Inline per card, because the stagger differs per card -- and the
         reduced-motion block matches `[style*="animation"]`, so this is caught
         by the same guard that catches the class. */
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-ink-faint lowercase tabular-nums">
          año {event.year}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-mono font-semibold text-[9.5px] tracking-[0.06em]",
            TAG_TONE[tag.token]
          )}
        >
          {tag.label}
        </span>
      </div>

      <p className="font-display text-[14px] text-ink leading-relaxed">
        {event.text}
      </p>
    </article>
  );
}
