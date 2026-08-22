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
 * `initial: "start"` because rank position 1 is the whole message; you do not
 * scroll back to find it. (The room opens centred for the opposite reason.)
 */

const BANDS: readonly { value: RankBand | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "high", label: "Alta" },
  { value: "mid", label: "Media" },
];

const SORTS: readonly { value: RankSort; label: string }[] = [
  { value: "position", label: "Afinidad" },
  { value: "name", label: "Nombre" },
];

export function RankBoard({ entries }: { entries: readonly RankEntry[] }) {
  const [sort, setSort] = useState<RankSort>("position");
  const [band, setBand] = useState<RankBand | "all">("all");
  const { ref, handlers } = useDragScroll({ initial: "start" });

  const visible = applyRankView(entries, { sort, band });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 px-6">
        <Chips
          items={BANDS}
          label="Filtrar por banda"
          name="rank-band"
          onChange={setBand}
          value={band}
        />
        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-ink-faint/25" />
        <Chips
          items={SORTS}
          label="Ordenar por"
          name="rank-sort"
          onChange={setSort}
          value={sort}
        />
      </div>

      {visible.length === 0 ? (
        /*
         * A designed state, not a blank row -- and deliberately silent about
         * what was removed. Saying "3 ocultos" would hand back exactly the
         * count the filter is meant to withhold (AC-RANK-4).
         */
        <p
          aria-label="Nadie en esta banda"
          className="mx-6 rounded-[18px] border-2 border-ink-faint/20 border-dashed px-5 py-8 text-center font-mono text-[11px] text-ink-muted lowercase"
          role="status"
        >
          nadie en esta banda todavía
        </p>
      ) : (
        <section
          aria-label="Tu ranking. Desplazá horizontalmente para ver a todos."
          className="flex cursor-grab gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-6 pb-3 active:cursor-grabbing"
          ref={ref}
          /* Focusable so the arrow keys reach it: WCAG 2.1.1 wants a scrollable
             region keyboard-operable, and Safari still does not do it for us. */
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
  );
}

/**
 * A real radio group, wearing chips.
 *
 * Native `<input type="radio">` behind a `sr-only` peer rather than three
 * buttons with `role="radio"`. Biome's a11y rule pushed for it and Biome was
 * right: a native group gives arrow-key navigation, roving focus and the
 * "one of three" announcement for free, and all three are things a hand-rolled
 * version has to remember. The chip is a `<span>` styled off `peer-checked`,
 * so the colour is decoration on top of real semantics rather than instead of
 * them.
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
    <fieldset aria-label={label} className="flex gap-1.5">
      {items.map((item) => (
        <label className="relative cursor-pointer" key={item.value}>
          {/* Transparent and full-size rather than `sr-only`: a clipped 1px
              input has no hit area, so it is unreachable by pointer AND
              unactionable to Playwright. This keeps the native control as the
              thing you actually click. */}
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
              "bg-card text-ink-muted transition-colors hover:text-ink",
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
