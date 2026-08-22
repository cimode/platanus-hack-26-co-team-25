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
 * Only this much is a Client Component -- the wordmark and the venue plate
 * above it stay on the server and never reach the wire.
 *
 * It owns the column from the field down to the CTA, because the CTA is pinned
 * to the bottom of the screen (`mt-auto`) while the field sits under the
 * wordmark. Splitting them across two components would mean neither could push
 * the other.
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
    <form action={formAction} className="relative flex flex-1 flex-col">
      <div className="mt-[120px] space-y-3">
        <h1 className="font-display font-bold text-[22px] text-ink">
          Impersonar Usuario
        </h1>

        <ParticipantCombobox
          name="participantId"
          onSelect={setSelected}
          roster={roster}
        />

        <p className="font-mono text-[10.5px] text-ink-faint lowercase">
          demo interno · hack 26 bogotá · sin contraseña
        </p>

        {/* Announced rather than merely drawn: a validation error the screen
            reader never reaches is not a validation error. */}
        <p aria-live="polite" className="min-h-5 text-destructive text-sm">
          {state.error ?? ""}
        </p>
      </div>

      <div className="mt-auto flex justify-end pt-8">
        <button
          className={cn(
            "rounded-[18px] bg-primary px-7 py-3.5",
            "font-display font-bold text-[19px] text-primary-foreground",
            "shadow-toy transition-transform",
            "hover:-translate-y-0.5 hover:shadow-toy-lg active:translate-y-0.5",
            "focus-visible:outline-2 focus-visible:outline-ink",
            "focus-visible:outline-offset-2",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
          disabled={pending || selected === null}
          type="submit"
        >
          {pending ? "Entrando..." : "Ámonos →"}
        </button>
      </div>
    </form>
  );
}
