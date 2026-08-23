"use client";

import { useCallback, useState } from "react";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import { EndingCard } from "@/components/simulate/ending-card";
import { EventCard } from "@/components/simulate/event-card";
import { TimelinePath } from "@/components/simulate/timeline-path";
import type { SimulatedLife } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

export function TimelineRail({
  life,
  className,
}: {
  readonly life: SimulatedLife;
  readonly className?: string;
}) {
  const { ref, handlers } = useDragScroll({ initial: "start" });
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      if (life.events.length === 0) return;
      const cards = node.querySelectorAll<HTMLElement>("[data-event-card]");
      if (cards.length === 0) return;
      const mid = node.scrollLeft + node.clientWidth / 2;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const center = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      });
      setActiveIndex(best);
    },
    [life.events.length]
  );

  const horizonYears =
    life.lens === "friendship" ? undefined : life.horizonYears;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <header className="px-6">
        <p className="font-mono text-ink-faint text-xs lowercase">
          {life.subject.name} · {life.other.name}
        </p>
        <h1 className="font-display font-extrabold text-3xl text-ink">
          Vida simulada
        </h1>
      </header>

      <TimelinePath events={life.events} progress={activeIndex} />

      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onScroll}
        ref={ref}
        {...handlers}
      >
        {life.events.map((event) => (
          <div data-event-card key={`${event.year}-${event.kind}`}>
            <EventCard
              horizonYears={horizonYears}
              kind={event.kind}
              text={event.text}
              year={event.year}
            />
          </div>
        ))}
      </div>

      {life.lens !== "friendship" ? <EndingCard life={life} /> : null}
    </div>
  );
}
