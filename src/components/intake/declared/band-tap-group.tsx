"use client";

import { useId, useState } from "react";
import type { BandCopy } from "@/components/intake/declared/bands";
import type { DeclaredBand } from "@/lib/domain/participant";

/**
 * One declared band: a label, a hint and four taps (issue #8, D6).
 *
 * A `radiogroup` of four native radios -- the index tapped IS the band stored,
 * never a float -- so the whole thing submits and reports its state with
 * JavaScript off, and a test can reach every option by role and name.
 *
 * The selection is React state, and it reaches the input as `defaultChecked`
 * rather than `checked`, which is load-bearing: React resets the form after a
 * Server Action resolves, and a reset restores every input to its `checked`
 * ATTRIBUTE. The screen's action returns "pick one for each" instead of
 * redirecting when a band is untapped, so the taps already made have to survive
 * that reset (AC-4) -- keeping state in the attribute is what makes them.
 */
const RADIO_CLASS = [
  "size-5 shrink-0 appearance-none rounded-full",
  "border-2 border-border bg-card transition-colors",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

export function BandTapGroup({
  band,
  defaultValue,
}: {
  band: BandCopy;
  defaultValue: DeclaredBand | null;
}) {
  const [value, setValue] = useState<DeclaredBand | null>(defaultValue);
  const labelId = useId();

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-base font-bold text-ink" id={labelId}>
        {band.label}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{band.hint}</p>

      {/* aria-labelledby points at the label alone: the hint is copy, not the
          accessible name a test (or a screen reader user) navigates by. */}
      <div
        aria-labelledby={labelId}
        className="mt-3 flex flex-col gap-2"
        role="radiogroup"
      >
        {band.options.map((option, index) => {
          const band0to3 = index as DeclaredBand;
          return (
            <label
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm font-medium text-ink"
              key={option}
            >
              <input
                defaultChecked={value === band0to3}
                className={RADIO_CLASS}
                name={band.key}
                onChange={() => setValue(band0to3)}
                type="radio"
                value={band0to3}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
