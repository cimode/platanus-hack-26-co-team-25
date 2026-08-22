"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  filterParticipants,
  type Participant,
} from "@/lib/domain/participants/participant";
import { cn } from "@/lib/utils";

/**
 * A text input that filters the roster as you type.
 *
 * Hand-rolled rather than composed from shadcn's Combobox: that one is built on
 * `cmdk` via `command.tsx` + `popover.tsx`, and neither is installed here.
 * Adding two primitives and a dependency to render one list was the worse
 * trade, so this implements the WAI-ARIA combobox pattern directly.
 *
 * Filtering happens on the client over the whole roster. At ~100 people that is
 * a few kilobytes of props against a round trip per keystroke on venue wifi.
 */
export function ParticipantCombobox({
  roster,
  name,
  onSelect,
}: {
  roster: readonly Participant[];
  /** Field name for the hidden input the Server Action reads. */
  name: string;
  onSelect: (participant: Participant | null) => void;
}) {
  const listId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Participant | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(
    () => filterParticipants(roster, query),
    [roster, query]
  );

  function choose(participant: Participant) {
    setSelected(participant);
    setQuery(participant.name);
    setOpen(false);
    onSelect(participant);
  }

  function handleChange(value: string) {
    setQuery(value);
    setActive(0);
    setOpen(true);
    // Typing after a choice invalidates it: the field no longer names the
    // person the parent thinks is selected, so the CTA must go back to
    // disabled rather than submit a stale id.
    if (selected) {
      setSelected(null);
      onSelect(null);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter" && open && matches[active]) {
      // Only swallow Enter when it is actually picking something, so the form
      // still submits with the keyboard once a choice is made.
      event.preventDefault();
      choose(matches[active]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={inputId}>
        Nombre del participante
      </label>
      <input
        aria-activedescendant={
          open && matches[active] ? `${listId}-${active}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        autoComplete="off"
        className={cn(
          "h-14 w-full rounded-xl border-2 border-border bg-card px-4",
          "text-base text-foreground placeholder:text-ink-faint",
          "shadow-card transition-colors outline-none",
          "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/25"
        )}
        id={inputId}
        onBlur={() => {
          // Pointer-down on an option fires before blur, but the browser still
          // queues this; defer so the choice lands before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="escribe tu nombre..."
        role="combobox"
        type="text"
        value={query}
      />

      {/* The Server Action reads this, never the visible text. */}
      <input name={name} type="hidden" value={selected?.id ?? ""} />

      {open ? (
        <div
          aria-label="Participantes"
          className={cn(
            "absolute z-10 mt-2 max-h-64 w-full overflow-y-auto",
            "rounded-xl border-2 border-border bg-card py-1 shadow-card"
          )}
          id={listId}
          role="listbox"
        >
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">
              Nadie con ese nombre.
            </p>
          ) : (
            matches.map((person, i) => (
              /* In the aria-activedescendant combobox pattern the options are
                 deliberately NOT focusable: focus stays on the input, and
                 aria-activedescendant names the active option. Keyboard
                 selection lives on the input's onKeyDown. Adding tabIndex here
                 would break the pattern rather than fix it. */
              // biome-ignore lint/a11y/useFocusableInteractive: see above
              <div
                aria-selected={i === active}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-4",
                  "px-4 py-3 text-base",
                  i === active
                    ? "bg-accent text-accent-foreground"
                    : "text-ink-soft"
                )}
                id={`${listId}-${i}`}
                key={person.id}
                onMouseEnter={() => setActive(i)}
                // Pointer-down, not click: on touch the input blurs first and
                // a click handler would never fire.
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(person);
                }}
                role="option"
              >
                <span className="font-semibold">{person.name}</span>
                <span className="font-mono text-xs text-ink-faint lowercase">
                  {person.team}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
