"use client";

import { useId, useState } from "react";
import type { DeclaredBand } from "@/lib/domain/participant";

/**
 * One question: a heading and four taps (issue #8, reshaped by #42, D6).
 *
 * A `radiogroup` of four native radios -- the index tapped IS the band stored,
 * never a float -- so the whole thing submits and reports its state with
 * JavaScript off, and a test can reach every option by role and name.
 *
 * The heading is the question and the question is the accessible name: no
 * label, no hint, nothing that says which axis this is. It posts under an
 * opaque field id for the same reason (`BandCopy.field`) -- a `name` attribute
 * is served bytes, and the column name in the markup would name the axis as
 * loudly as a title would.
 *
 * The selection is React state, and it reaches the input as `defaultChecked`
 * rather than `checked`, which is load-bearing: React resets the form after a
 * Server Action resolves, and a reset restores every input to its `checked`
 * ATTRIBUTE. The screen's action returns "elige una opción en cada pregunta"
 * instead of redirecting when a question is unanswered, so the taps already
 * made have to survive that reset -- keeping state in the attribute is what
 * makes them.
 */
const RADIO_CLASS = [
  "size-5 shrink-0 appearance-none rounded-full",
  "border-2 border-border bg-card transition-colors",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

export function BandTapGroup({
  field,
  question,
  options,
  defaultValue,
}: {
  /** The opaque `name` this group posts under (`q1`…`q6`). */
  field: string;
  question: string;
  /** Exactly four, and the index IS the band that gets stored (D6). */
  options: readonly string[];
  defaultValue: DeclaredBand | null;
}) {
  const [value, setValue] = useState<DeclaredBand | null>(defaultValue);
  const labelId = useId();

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-bold text-ink" id={labelId}>
        {question}
      </h2>

      <div
        aria-labelledby={labelId}
        className="mt-3 flex flex-col gap-2"
        role="radiogroup"
      >
        {options.map((option, index) => {
          const band0to3 = index as DeclaredBand;
          return (
            <label
              className="flex items-center gap-3 rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm font-medium text-ink"
              key={option}
            >
              <input
                className={RADIO_CLASS}
                defaultChecked={value === band0to3}
                name={field}
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
