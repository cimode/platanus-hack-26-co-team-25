"use client";

import { useActionState } from "react";
import { type ConsentState, consentAction } from "@/app/intake/actions";
import { IntakeDone } from "@/components/intake/intake-done";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";
import type { Consent } from "@/lib/domain/participant";

const INITIAL: ConsentState = {};

/**
 * The three lenses, in the order the room reads them. Only the romantic one
 * carries a note, and D12 is why: one switch covers the ranking AND the
 * AI-offspring render, so the copy has to say both out loud.
 */
const LENSES = [
  {
    key: "romantic",
    label: "Romantic",
    note: "Covers the romantic ranking and the AI-offspring render.",
  },
  { key: "business", label: "Business", note: null },
  { key: "friendship", label: "Friendship", note: null },
] as const;

/**
 * The switch itself: a native checkbox wearing a switch.
 *
 * Native rather than a scripted control on purpose -- it toggles, submits and
 * reports its state with JavaScript off, which is the difference between a
 * consent screen and a consent screen that silently records three noes on a
 * phone whose bundle never arrived.
 */
const SWITCH_CLASS = [
  "relative h-7 w-12 shrink-0 appearance-none rounded-full",
  "bg-surface-alt transition-colors checked:bg-primary",
  "before:absolute before:top-1 before:left-1 before:size-5",
  "before:rounded-full before:bg-card before:transition-transform",
  "before:content-[''] checked:before:translate-x-5",
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
].join(" ");

/**
 * Step 3 -- consent.
 *
 * Every switch is rendered from the saved row, and the row defaults to false on
 * all three columns. Nothing here can turn one on: returning to this screen
 * shows the choices that were saved, never a helpful suggestion.
 *
 * The done screen is rendered from `state.saved` -- the action's own answer --
 * rather than from a `?done=1` in the URL, so it is reachable only by having
 * just saved. `useActionState` carries a Server Function's result into the
 * re-render even before hydration, so this holds with JavaScript off too.
 */
export function ConsentStep({
  roomSlug,
  name,
  photoUrl,
  consent,
}: {
  roomSlug: string;
  name: string;
  photoUrl: string;
  consent: Consent;
}) {
  const [state, formAction, pending] = useActionState(consentAction, INITIAL);

  if (state.saved) {
    return <IntakeDone consent={state.saved} name={name} photoUrl={photoUrl} />;
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-8">
      <StepHeading step={3} title="Who gets to see you, and how." />

      <input name="room" type="hidden" value={roomSlug} />

      <div className="flex items-center gap-4">
        {/* biome-ignore lint/performance/noImgElement: the PhotoStore owns this URL, and a data: URL is not a host next/image can be configured for */}
        <img
          // biome-ignore lint/a11y/noRedundantAlt: the intake criteria pin "Your photo" as the accessible name
          alt="Your photo"
          className="size-16 rounded-2xl border-2 border-border object-cover"
          src={photoUrl}
        />
        <p className="font-display text-xl font-extrabold text-ink">{name}</p>
      </div>

      <p className="text-sm text-ink-muted">
        Anyone not opted in to a lens never appears in that lens&apos;s ranking.
      </p>

      <ul className="space-y-3">
        {LENSES.map((lens) => (
          <li
            className="rounded-2xl border border-border bg-card p-4"
            key={lens.key}
          >
            <div className="flex items-center justify-between gap-4">
              <label
                className="font-display text-base font-bold text-ink"
                htmlFor={`consent-${lens.key}`}
              >
                {lens.label}
              </label>
              <input
                className={SWITCH_CLASS}
                defaultChecked={consent[lens.key]}
                id={`consent-${lens.key}`}
                name={lens.key}
                type="checkbox"
              />
            </div>
            {lens.note ? (
              <p className="mt-2 text-xs text-ink-muted">{lens.note}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <p
        aria-live="polite"
        className="min-h-5 text-sm font-medium text-destructive"
      >
        {state.error ?? ""}
      </p>

      <Button
        className="mt-auto h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
        disabled={pending}
        type="submit"
      >
        Save and continue
      </Button>
    </form>
  );
}
