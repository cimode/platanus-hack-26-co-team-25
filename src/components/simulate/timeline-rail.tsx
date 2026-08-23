"use client";

import { useState } from "react";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import { EndingCard } from "@/components/simulate/ending-card";
import { TimelinePath } from "@/components/simulate/timeline-path";
import type { SimulatedLife } from "@/lib/domain/reveal/timeline";

/**
 * The board, dragged sideways: the only client island on screen 1f.
 *
 * It holds one number -- which tile the viewer is standing on -- and the year
 * pill in the page header reads the same number through `onYear`. One source,
 * so the pill and the walking pair can never disagree about where you are.
 *
 * `initial: "start"` here, not `"center"`: a life starts at year one, and the
 * design opens on the first beat with the pair already on it.
 */
export function TimelineRail({
  life,
  onYear,
}: {
  life: SimulatedLife;
  onYear?: (year: number) => void;
}) {
  const { ref, handlers } = useDragScroll({ initial: "start" });
  const [active, setActive] = useState(0);

  const events = life.events;

  return (
    <section
      aria-label="La vida simulada. Desplaza horizontalmente para recorrerla."
      className="relative flex min-h-0 flex-1 cursor-grab items-center gap-6 overflow-x-auto overflow-y-hidden overscroll-x-contain px-2 active:cursor-grabbing"
      onScroll={(event) => {
        // The tile under the viewport's left third, from the scroller's own
        // geometry. Measured HERE rather than inside `TimelinePath`, because no
        // sibling of that component may read layout -- it is the constraint
        // that kept its props contract to two (AC-SIM-7).
        const el = event.currentTarget;
        const index = Math.round(el.scrollLeft / 96);
        const next = Math.min(events.length - 1, Math.max(0, index));
        setActive(next);
        onYear?.(events[next]?.year ?? 1);
      }}
      ref={ref}
      /* Focusable so the arrow keys reach it: WCAG 2.1.1 wants a scrollable
         region keyboard-operable, and Safari still does not do it for us. */
      // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
      tabIndex={0}
      {...handlers}
    >
      <TimelinePath events={events} progress={active} />

      {life.lens === "friendship" ? null : (
        <EndingCard
          ending={life.ending}
          horizonYears={life.horizonYears}
          otherName={life.other.name}
        />
      )}
    </section>
  );
}
