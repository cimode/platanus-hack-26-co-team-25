"use client";

import { useState } from "react";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import { EndingCard } from "@/components/simulate/ending-card";
import { EventCard } from "@/components/simulate/event-card";
import { TimelinePath } from "@/components/simulate/timeline-path";
import type { SimulatedLife } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * The life, as one horizontally dragged strip: the ONLY client island on 1f.
 *
 * It holds one number -- which card is centred -- and everything else is a prop
 * or a pure component. The year pill and the walking pair both read that
 * number, which is why it lives here and not in two places.
 *
 * `initial: "center"` because a life has no natural end to start at; the room
 * opens centred for the same reason and the rank row opens at the start for the
 * opposite one.
 */
export function TimelineRail({ life }: { life: SimulatedLife }) {
  const { ref, handlers } = useDragScroll({ initial: "center" });
  const [active, setActive] = useState(0);

  const events = life.events;
  const last = Math.max(1, events.length - 1);

  return (
    <div
      className={cn(
        // `relative` is load-bearing: the venue's veil is an `absolute inset-0`
        // sibling, so anything without a stacking position of its own paints
        // UNDER it. The year pill spent one build washed out for exactly that
        // reason while the header and the CTA -- which do carry it -- stayed
        // crisp.
        "relative flex min-h-0 flex-1 flex-col justify-end gap-1 pb-3",
        // Bottom-aligned, like the rank row on 1c: the strip stands on the
        // venue floor rather than floating in the middle of the room, and the
        // slack collects overhead as ceiling instead of as dead cream.
        "min-h-0"
      )}
    >
      {/*
        The pill exists ONLY on the paired branch. Friendship structurally has
        no `horizonYears`, so there is nothing to put after "de" -- and
        PILLARS.md §6.1 is explicit that friendship makes no duration claim
        (AC-SIM-4). The narrowing below is the type doing that work, not a
        convention someone has to remember.
      */}
      {life.lens === "friendship" ? null : (
        <p className="px-6 pb-1 text-center">
          <span className="inline-block rounded-full bg-ink px-3.5 py-1.5 font-display font-bold text-[12px] text-background">
            Año {events[active]?.year ?? 1} de {life.horizonYears}
          </span>
        </p>
      )}

      <TimelinePath events={events} progress={active / last} />

      <section
        aria-label="La vida simulada. Desplaza horizontalmente para recorrerla."
        className="flex cursor-grab gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-6 py-3 active:cursor-grabbing"
        onScroll={(event) => {
          // The centred card, from the scroller's own geometry. Measured here
          // rather than passed down, because `TimelinePath` must not read
          // layout from a sibling -- that is the constraint that keeps 1e a
          // one-file swap (AC-SIM-7).
          const el = event.currentTarget;
          const stride = el.scrollWidth / Math.max(1, el.children.length);
          setActive(
            Math.min(
              events.length - 1,
              Math.max(0, Math.round(el.scrollLeft / stride))
            )
          );
        }}
        ref={ref}
        /* Focusable so the arrow keys reach it: WCAG 2.1.1 wants a scrollable
           region keyboard-operable, and Safari still does not do it for us. */
        // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
        tabIndex={0}
        {...handlers}
      >
        {events.map((event, index) => (
          <EventCard
            delay={index * 40}
            event={event}
            key={`${event.year}-${event.kind}`}
          />
        ))}

        {life.lens === "friendship" ? null : (
          <EndingCard
            ending={life.ending}
            horizonYears={life.horizonYears}
            otherName={life.other.name}
          />
        )}
      </section>
    </div>
  );
}
