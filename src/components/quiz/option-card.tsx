import type { MouseEvent } from "react";
import type { OptionKey } from "@/lib/domain/quiz";
import { cn } from "@/lib/utils";

/** The two marks, spelled the way the participant reads them. */
export const MOST_LABEL = "Más yo";
export const LEAST_LABEL = "Menos yo";

export type OptionMark = "most" | "least" | null;

/**
 * One option, as a row of an RPG dialogue menu (style "B · Diálogo"): the
 * avatar has told the scene in the bubble above, and these four are the
 * replies. A cursor glyph in the gutter, the text, and -- once marked -- the
 * mark word at the row's end.
 *
 * Three rules from `CLAUDE_DESIGN_QUIZ_BLOCK.md` still shape it:
 *
 *  - §3 "no option may look like the right answer": at rest all four rows are
 *    identical -- same fill, same ring, same weight, the same faint cursor.
 *    Nothing is primary and, with the shuffle (`shownOrderFor`), nothing is
 *    first either.
 *  - §6 "do not use a colour to distinguish most from least without a second
 *    cue": each mark carries a visible word and its own shape. Most lifts on
 *    `shadow-toy` with a solid ring and a lit cursor; least sits pressed, flat
 *    and struck through behind a dashed ring, its cursor an ✕.
 *  - §9 "a card settling into selection is the one place motion earns its
 *    keep": the press is the system's pressed pattern (down one step, shadow
 *    gone), and nothing else moves.
 *
 * Under single pick the row IS the submit control: `<button type="submit"
 * name="mostKey" value={key}>`, so a tap answers the block with no JavaScript
 * at all -- the browser posts the submitter's name and value. The island
 * intercepts the click once it has hydrated, to let the press and the sprite's
 * reaction read before the form goes. Under most+least the row is a plain
 * button and the marks travel in hidden inputs.
 *
 * The accessible name is the option text alone (`aria-label`), which is what
 * makes `getByRole("button", { name: "…" })` the way to reach a row: the mark
 * is state, and state belongs in `aria-pressed`, not in the name.
 *
 * NOTHING about the pillar or the keying reaches this component. It receives a
 * key and a text; `pillar`, `keyed`, `focusPillar` and `source` stay on the
 * server (PILLARS.md §8 rule 1) -- a prop it never takes is a prop that cannot
 * be serialized into the RSC payload.
 */
export function OptionRow({
  optionKey,
  text,
  mark,
  submits,
  disabled = false,
  onSelect,
}: {
  optionKey: OptionKey;
  text: string;
  mark: OptionMark;
  /** Single pick: the row submits the form itself, as `mostKey={optionKey}`. */
  submits: boolean;
  /**
   * Out of play while a tap is on its way to the server. Announced rather than
   * enforced with `disabled`: a disabled submitter drops out of the posted
   * FormData, and the island's own guard already ignores the second tap.
   */
  disabled?: boolean;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-disabled={disabled || undefined}
      aria-label={text}
      aria-pressed={mark !== null}
      className={cn(
        "relative min-h-14 w-full rounded-xl border-2 py-3 pr-4 pl-10 text-left font-sans text-[15px] leading-snug font-semibold transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        mark === null &&
          "border-border bg-card text-ink shadow-card hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        mark === "most" &&
          "-translate-y-0.5 border-primary bg-primary-tint text-ink shadow-toy",
        mark === "least" &&
          "translate-y-1 border-dashed border-ink-faint bg-surface-alt text-ink-muted shadow-none"
      )}
      name={submits ? "mostKey" : undefined}
      onClick={onSelect}
      type={submits ? "submit" : "button"}
      value={submits ? optionKey : undefined}
    >
      {/* The menu cursor. Decoration: the row's name is its text. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-4 -translate-y-1/2 font-display text-xl font-extrabold",
          mark === "most" && "text-primary",
          mark === "least" && "text-ink-faint",
          mark === null && "text-ink-faint/40"
        )}
      >
        {mark === "least" ? "✕" : "▸"}
      </span>

      <span className="flex items-center justify-between gap-3">
        <span className={cn(mark === "least" && "line-through decoration-1")}>
          {text}
        </span>
        {mark !== null && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] tracking-[0.06em] lowercase",
              mark === "most" ? "text-primary" : "text-ink-faint"
            )}
          >
            {mark === "most" ? MOST_LABEL : LEAST_LABEL}
          </span>
        )}
      </span>
    </button>
  );
}
