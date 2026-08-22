"use client";

import { useState } from "react";
import { RankCard } from "@/components/rank/rank-card";
import { applyRankView, type RankSort } from "@/components/rank/view";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import type { RankBand, RankEntry } from "@/lib/domain/reveal/rank";
import { cn } from "@/lib/utils";

/**
 * The rank row: the only client island on screen 1c.
 *
 * It holds two choices and no logic. Sorting and filtering are the pure
 * `applyRankView`, and the horizontal drag is the shared `useDragScroll` -- so
 * everything on the wire here is `useState` twice and a `.map`. That is the
 * point of keeping the view model out of the component.
 *
 * The controls sit in the header and the row sits in a flex-1 band that CENTRES
 * it vertically. The first build let the row hug the controls and left half a
 * phone of dead cream underneath; the row is the screen's subject, so it takes
 * the slack rather than the whitespace taking it.
 *
 * `initial: "start"` because rank position 1 is the whole message; you do not
 * scroll back to find it. (The room opens centred for the opposite reason.)
 */

const BANDS: readonly { value: RankBand | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "high", label: "Banda alta" },
  { value: "mid", label: "Banda media" },
];

const SORTS: readonly { value: RankSort; label: string }[] = [
  { value: "position", label: "Más compatible" },
  { value: "name", label: "Nombre" },
];

export function RankBoard({ entries }: { entries: readonly RankEntry[] }) {
  const [sort, setSort] = useState<RankSort>("position");
  const [band, setBand] = useState<RankBand | "all">("all");
  const { ref, handlers } = useDragScroll({ initial: "start" });

  const visible = applyRankView(entries, { sort, band });

  return (
    <>
      <div className="relative flex shrink-0 flex-col gap-2 px-6 pb-3">
        <Chips
          items={SORTS}
          label="Ordenar"
          name="rank-sort"
          onChange={setSort}
          value={sort}
        />
        <Chips
          items={BANDS}
          label="Filtrar"
          name="rank-band"
          onChange={setBand}
          value={band}
        />
      </div>

      <div className="relative h-px shrink-0 bg-ink-faint/20" />

      {/*
        flex-1 so the row takes ALL the slack -- the first build stacked
        everything from the top and left half a phone of dead cream below the
        fold. `items-end` rather than `items-center` because the venue is
        behind this band: centred, the sprites float in mid-air over a room;
        pushed down, they stand on its floor. The padding is the distance from
        the bottom of the plate up to the venue's floor line.
      */}
      <div className="relative flex min-h-0 flex-1 items-end pb-[11%]">
        {visible.length === 0 ? (
          /*
           * A designed state, not a blank row -- and deliberately silent about
           * what was removed. Saying "3 ocultos" would hand back exactly the
           * count the filter is meant to withhold (AC-RANK-4).
           */
          <p
            aria-label="Nadie en esta banda"
            className="mx-auto mb-[6%] rounded-[18px] border-2 border-ink-faint/25 border-dashed bg-background/70 px-6 py-8 text-center font-mono text-[11px] text-ink-muted lowercase"
            role="status"
          >
            nadie en esta banda todavía
          </p>
        ) : (
          <section
            aria-label="Tu ranking. Desplazá horizontalmente para ver a todos."
            className="flex w-full cursor-grab gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-5 py-2 active:cursor-grabbing"
            ref={ref}
            /* Focusable so the arrow keys reach it: WCAG 2.1.1 wants a
               scrollable region keyboard-operable, and Safari still does not do
               it for us. */
            // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
            tabIndex={0}
            {...handlers}
          >
            {visible.map((entry, index) => (
              <RankCard delay={index * 45} entry={entry} key={entry.id} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}

/**
 * A real radio group, wearing chips.
 *
 * Native `<input type="radio">` behind a transparent full-size peer rather than
 * three buttons with `role="radio"`. Biome's a11y rule pushed for it and Biome
 * was right: a native group gives arrow-key navigation, roving focus and the
 * "one of three" announcement for free, and all three are things a hand-rolled
 * version has to remember.
 *
 * The input is transparent and FULL SIZE, not `sr-only`: a clipped 1px input
 * has no hit area, so it is unreachable by pointer and unactionable to
 * Playwright.
 */
function Chips<T extends string>({
  items,
  label,
  name,
  onChange,
  value,
}: {
  items: readonly { value: T; label: string }[];
  label: string;
  name: string;
  onChange: (next: T) => void;
  value: T;
}) {
  return (
    <fieldset aria-label={label} className="flex items-center gap-1.5">
      <legend className="float-left mr-2 font-mono text-[10px] text-ink-faint lowercase">
        {label.toLowerCase()}:
      </legend>
      {items.map((item) => (
        <label className="relative cursor-pointer" key={item.value}>
          <input
            checked={item.value === value}
            className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
            name={name}
            onChange={() => onChange(item.value)}
            type="radio"
            value={item.value}
          />
          <span
            className={cn(
              "block rounded-full px-3 py-1.5 font-display font-bold text-[12px]",
              "bg-card/80 text-ink-muted transition-colors hover:text-ink",
              "peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-toy",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-ink peer-focus-visible:outline-offset-2"
            )}
          >
            {item.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
