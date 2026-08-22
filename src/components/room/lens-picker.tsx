"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { chooseLensAction } from "@/app/actions";
import type { Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";
import { LensSelect } from "./lens-select";

/**
 * "¿Cómo quieres conectar?" -- the only action on screen 1b.
 *
 * The card wears `lens-{selected}`, so choosing "Trabajando" turns the dot AND
 * the Vamos button violet before you commit. That is the lens token system
 * paying for itself -- there is not one conditional colour in here.
 *
 * The chooser itself is `LensSelect`, a hand-rolled listbox. See the note there
 * for why the native `<select>` it replaced had to go, and what that cost.
 */
export function LensPicker({ people }: { people: number }) {
  const [lens, setLens] = useState<Lens>("romantic");

  return (
    <form
      action={chooseLensAction}
      className={cn(
        `lens-${lens}`,
        "absolute inset-x-4 top-16 z-20 rounded-[22px] bg-card p-4",
        "shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
      )}
    >
      <div className="flex items-center gap-3">
        <Menu aria-hidden="true" className="size-5 text-ink" />
        <h1 className="font-display font-bold text-ink text-xl">
          ¿Cómo quieres conectar?
        </h1>
      </div>

      <div className="mt-3.5 flex gap-2.5">
        <LensSelect onChange={setLens} value={lens} />
        {/* The action reads this, never the listbox's visible label. */}
        <input name="lens" type="hidden" value={lens} />

        <button
          className={cn(
            "shrink-0 rounded-[14px] bg-primary px-6",
            "font-display font-bold text-[17px] text-primary-foreground",
            "shadow-toy transition-transform",
            "hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          type="submit"
        >
          Vamos
        </button>
      </div>

      <p className="mt-2 font-mono text-[10.5px] text-ink-faint lowercase">
        {people === 1 ? "1 persona aquí" : `${people} personas aquí`}
      </p>
    </form>
  );
}
