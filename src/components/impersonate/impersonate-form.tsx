"use client";

import { useActionState, useState } from "react";
import { impersonateAction } from "@/app/actions";
import type { ImpersonateState } from "@/app/impersonation";
import type { Participant } from "@/lib/domain/participants/participant";
import { cn } from "@/lib/utils";
import { ParticipantCombobox } from "./participant-combobox";

const INITIAL: ImpersonateState = {};

/**
 * The client island of screen 1a.
 *
 * Only this much is a Client Component -- the wordmark, the heading and the
 * venue art above it stay on the server and never reach the wire.
 */
export function ImpersonateForm({
  roster,
}: {
  roster: readonly Participant[];
}) {
  const [state, formAction, pending] = useActionState(
    impersonateAction,
    INITIAL
  );
  const [selected, setSelected] = useState<Participant | null>(null);

  return (
    <form action={formAction} className="flex flex-1 flex-col">
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-extrabold text-ink">
          Impersonar Usuario
        </h1>

        <ParticipantCombobox
          name="participantId"
          onSelect={setSelected}
          roster={roster}
        />

        <p className="font-mono text-xs text-ink-faint lowercase">
          demo interno · hack 26 bogotá · sin contraseña
        </p>

        {/* Announced rather than merely drawn: a validation error the screen
            reader never reaches is not a validation error. */}
        <p aria-live="polite" className="min-h-5 text-sm text-destructive">
          {state.error ?? ""}
        </p>
      </div>

      {/* The venue art sits between the field and the CTA, so the button has to
          travel with it -- hence the whole form owning the column. */}
      <VenueStage>
        <button
          className={cn(
            "rounded-2xl bg-primary px-8 py-4",
            "font-display text-lg font-bold text-primary-foreground",
            "shadow-toy transition-transform",
            "hover:-translate-y-0.5 hover:shadow-toy-lg active:translate-y-0.5",
            "focus-visible:outline-2 focus-visible:outline-primary-foreground",
            "focus-visible:outline-offset-2",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
          disabled={pending || selected === null}
          type="submit"
        >
          {pending ? "Entrando..." : "Ámonos →"}
        </button>
      </VenueStage>
    </form>
  );
}

/**
 * The room, seen from the login screen.
 *
 * The pixel-art venue plate is not drawn yet, so this renders the system's
 * placeholder convention -- a dashed slot on the room's own dark surface --
 * rather than a stock image that would have to be un-shipped later. Drop the
 * art in as a background on this element and delete the dashed child.
 */
function VenueStage({ children }: { children: React.ReactNode }) {
  return (
    // Bleeds past the page gutter and off the bottom edge: in the mockup the
    // room art IS the floor of the screen, not a card sitting on it. The
    // negative insets have to match main's `px-6 pb-8` exactly.
    <div className="-mx-6 -mb-8 mt-8 flex flex-1 items-end">
      <div className="relative flex min-h-56 w-full items-end justify-end overflow-hidden rounded-t-2xl bg-dark px-6 pt-6 pb-10">
        <div
          aria-hidden="true"
          className="absolute inset-4 rounded-xl border-2 border-dashed border-ink-faint/25"
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-ink-faint/50 lowercase"
        >
          arte del venue · pendiente
        </span>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}
