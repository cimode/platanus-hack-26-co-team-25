import { type TagToken, tagFor } from "@/components/simulate/event-tag";
import type { EventKind } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

const TAG_CHIP: Record<TagToken, string> = {
  hito: "bg-tag-hito text-tag-hito-foreground",
  mudanza: "bg-tag-mudanza text-tag-mudanza-foreground",
  mascota: "bg-tag-mascota text-tag-mascota-foreground",
  peque: "bg-tag-peque text-tag-peque-foreground",
  ritual: "bg-tag-ritual text-tag-ritual-foreground",
  viaje: "bg-tag-viaje text-tag-viaje-foreground",
  roce: "bg-tag-roce text-tag-roce-foreground",
};

export interface EventCardProps {
  readonly year: number;
  readonly kind: EventKind;
  readonly text: string;
  readonly horizonYears?: number;
}

export function EventCard({ year, kind, text, horizonYears }: EventCardProps) {
  const tag = tagFor(kind);
  return (
    <article className="flex w-[min(18rem,78vw)] shrink-0 flex-col gap-3 rounded-2xl border border-ink/10 bg-background/95 p-4 shadow-toy">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-ink-faint">
          {horizonYears !== undefined
            ? `Año ${year} de ${horizonYears}`
            : `Año ${year}`}
        </p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 font-display text-[11px] font-bold",
            TAG_CHIP[tag.token]
          )}
        >
          {tag.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-ink">{text}</p>
    </article>
  );
}
