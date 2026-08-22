"use client";

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { LENSES, type Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

const LABEL: Record<Lens, string> = {
  romantic: "Románticamente",
  business: "Trabajando",
  friendship: "De amigos",
};

/**
 * The lens chooser.
 *
 * This WAS a native `<select>`, which bought keyboard and screen-reader
 * correctness for free -- but a native select's popup cannot be styled, so on
 * desktop it dropped a grey OS menu into the middle of a cream toy-styled card.
 * There is no CSS that fixes that; the popup is drawn by the operating system.
 *
 * So: the WAI-ARIA listbox pattern, same as the roster combobox on 1a. The cost
 * is real and worth naming -- this needs JavaScript, where the native control
 * did not. It is an acceptable trade only because 1a's combobox already made
 * that bargain, so no screen in the flow gains a no-JS path by keeping this one.
 *
 * Each option carries its OWN `lens-*` class, so the three dots show the three
 * real accents side by side. Not one colour is hardcoded here.
 */
export function LensSelect({
  value,
  onChange,
}: {
  value: Lens;
  onChange: (lens: Lens) => void;
}) {
  const listId = useId();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => LENSES.indexOf(value));
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const choose = useCallback(
    (lens: Lens) => {
      onChange(lens);
      setActive(LENSES.indexOf(lens));
      setOpen(false);
    },
    [onChange]
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + LENSES.length) % LENSES.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(LENSES[active]);
      else setOpen(true);
    }
  }

  return (
    <div className="relative flex-1">
      <span className="sr-only" id={labelId}>
        Tipo de conexión
      </span>

      <button
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        className={cn(
          "flex w-full items-center gap-2 rounded-[14px] border-2 border-border",
          "bg-background px-3.5 py-2.5 text-left transition-colors",
          "hover:border-primary/50",
          "focus-visible:border-primary focus-visible:outline-none",
          "focus-visible:ring-4 focus-visible:ring-ring/25"
        )}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        type="button"
      >
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full bg-primary"
        />
        <span className="flex-1 font-bold text-[15px] text-ink">
          {LABEL[value]}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-ink-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          aria-labelledby={labelId}
          className={cn(
            "absolute inset-x-0 top-full z-30 mt-2 overflow-hidden",
            "rounded-[14px] border-2 border-border bg-card p-1",
            "shadow-[0_8px_28px_rgba(51,38,29,0.22)]"
          )}
          id={listId}
          role="listbox"
        >
          {LENSES.map((lens, i) => (
            /* In the aria-activedescendant listbox pattern the options are
               deliberately NOT focusable: focus stays on the trigger, and
               aria-activedescendant names the active one. Keyboard selection
               lives on the trigger's onKeyDown. tabIndex here would break the
               pattern rather than fix it. */
            // biome-ignore lint/a11y/useFocusableInteractive: see above
            <div
              aria-selected={lens === value}
              className={cn(
                `lens-${lens}`,
                "flex cursor-pointer items-center gap-2.5 rounded-[10px]",
                "px-3 py-2.5 text-[15px] transition-colors",
                i === active ? "bg-accent" : "bg-transparent"
              )}
              id={`${listId}-${i}`}
              key={lens}
              onMouseEnter={() => setActive(i)}
              // Pointer-down, not click: the trigger blurs first on touch and a
              // click handler would never fire.
              onPointerDown={(event) => {
                event.preventDefault();
                choose(lens);
              }}
              role="option"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full bg-primary"
              />
              <span className="flex-1 font-bold text-ink">{LABEL[lens]}</span>
              {lens === value ? (
                <Check aria-hidden="true" className="size-4 text-primary" />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
