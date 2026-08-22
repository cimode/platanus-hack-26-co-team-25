"use client";

import { useState } from "react";
import {
  TAG_GROUP_LABELS,
  TAG_GROUP_ORDER,
  TAG_LABELS,
} from "@/components/intake/declared/bands";
import { MAX_TAGS, TAG_GROUPS } from "@/lib/domain/participant";

/**
 * The tag picker (PILLARS.md §2 Common Ground).
 *
 * A closed vocabulary of 30 slugs, at most 12 of them: free text would make the
 * engine's Jaccard kernel read "cafe" and "café" as strangers. The cap is
 * visible as "n of 12", and at twelve the unpicked ones go `disabled` -- the
 * 13th tap is refused rather than silently dropped at save time, and refusing
 * it in the DOM keeps the box that was tapped from looking picked. The use case
 * checks the cap again anyway, because the action is a public endpoint.
 *
 * Selection reaches the inputs as `defaultChecked` for the same reason it does
 * in `band-tap-group.tsx`: React resets the form when the action resolves, and
 * a reset restores the `checked` attribute.
 */
const CHECKBOX_CLASS = [
  "size-5 shrink-0 appearance-none rounded-md",
  "border-2 border-border bg-card transition-colors",
  "checked:border-primary checked:bg-primary",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

export function TagPicker({ defaultValue }: { defaultValue: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  const full = selected.length >= MAX_TAGS;

  const toggle = (slug: string) => {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug]
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-base font-bold text-ink">
          What you are into
        </p>
        <p className="font-mono text-xs text-ink-muted">{`${selected.length} of ${MAX_TAGS}`}</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Pick up to {MAX_TAGS}. Shared ones are what a stranger can open with.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        {TAG_GROUP_ORDER.map((group) => (
          <div key={group}>
            <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
              {TAG_GROUP_LABELS[group]}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAG_GROUPS[group].map((slug) => (
                <label
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm font-medium text-ink"
                  key={slug}
                >
                  <input
                    className={CHECKBOX_CLASS}
                    defaultChecked={selected.includes(slug)}
                    disabled={full && !selected.includes(slug)}
                    name="tags"
                    onChange={() => toggle(slug)}
                    type="checkbox"
                    value={slug}
                  />
                  <span>{TAG_LABELS[slug] ?? slug}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
