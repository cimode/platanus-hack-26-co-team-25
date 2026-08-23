"use client";

import { useId, useMemo, useRef, useState } from "react";
import { isDrag } from "@/components/shared/use-drag-scroll";
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
  const inputRef = useRef<HTMLInputElement>(null);
  // Where a press on an option started, so pointerup can tell a tap from a
  // scroll. One ref for the whole list: only one pointer is ever down on it.
  const press = useRef<{ id: number; x: number; y: number } | null>(null);

  function closeSoon() {
    // Pointer-down on an option fires before blur, but the browser still
    // queues this; defer so the choice lands before the list unmounts.
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
  }

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
        onBlur={closeSoon}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder="escribe tu nombre..."
        ref={inputRef}
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
                /* preventDefault on MOUSEdown, not on pointerdown, and that
                   distinction is the whole bug this replaced. Both keep focus
                   on the input so the list does not close under the cursor --
                   but pointerdown is also where the browser decides whether a
                   touch may scroll, so cancelling it there made the list
                   unscrollable on a phone. `mousedown` is a compatibility
                   event that only arrives after a touch has already been
                   ruled a tap, so it can never cost a scroll. */
                onMouseDown={(event) => event.preventDefault()}
                onPointerCancel={() => {
                  press.current = null;
                }}
                /* Arm, do not choose. Choosing here meant the option under
                   your finger was picked the instant it landed, so dragging
                   the list on a phone always selected whatever you touched
                   first -- there was no gesture left to scroll with. */
                onPointerDown={(event) => {
                  cancelClose();
                  press.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                  };
                }}
                onPointerUp={(event) => {
                  const start = press.current;
                  press.current = null;
                  if (!start || start.id !== event.pointerId) return;
                  // Both axes: the strips this slop was written for scroll in
                  // x, this list scrolls in y, and a tap is still a tap in
                  // either. Same constant on purpose -- a picker and a strip
                  // disagreeing about what counts as a drag is how a phone
                  // starts feeling arbitrary.
                  if (
                    isDrag(start.x, event.clientX) ||
                    isDrag(start.y, event.clientY)
                  ) {
                    // A scroll, not a tap. Leave the list where it is -- but
                    // the input may have blurred on the way down, so give back
                    // the close that blur was owed.
                    if (document.activeElement !== inputRef.current)
                      closeSoon();
                    return;
                  }
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
