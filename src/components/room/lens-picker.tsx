"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { chooseLensAction } from "@/app/actions";
import { LENSES, type Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

const LABEL: Record<Lens, string> = {
  romantic: "Románticamente",
  business: "Trabajando",
  friendship: "De amigos",
};

/**
 * "¿Cómo quieres conectar?" -- the only action on screen 1b.
 *
 * A real `<select>`, not a custom dropdown. It is keyboard- and
 * screen-reader-correct for free, it opens as the native wheel on a phone, and
 * the form still submits with JavaScript disabled -- which matters on venue
 * wifi, where hydration is the slowest thing on the page.
 *
 * The only reason this is a Client Component at all is the live preview: the
 * card wears `lens-{selected}`, so choosing "Trabajando" turns the dot AND the
 * Vamos button violet before you commit. That is the lens system paying for
 * itself -- there is not one conditional colour in here.
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
        <div
          className={cn(
            "flex flex-1 items-center gap-2 rounded-[14px] border-2 border-border",
            "bg-background px-3.5 py-2.5",
            "focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/25"
          )}
        >
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-primary"
          />
          <label className="sr-only" htmlFor="lens">
            Tipo de conexión
          </label>
          <select
            className="w-full cursor-pointer bg-transparent font-bold text-[15px] text-ink outline-none"
            id="lens"
            name="lens"
            onChange={(event) => setLens(event.target.value as Lens)}
            value={lens}
          >
            {LENSES.map((option) => (
              <option key={option} value={option}>
                {LABEL[option]}
              </option>
            ))}
          </select>
        </div>

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
