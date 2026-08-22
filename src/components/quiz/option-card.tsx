import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The two marks, spelled the way the participant reads them. */
export const MOST_LABEL = "Más yo";
export const LEAST_LABEL = "Menos yo";

export type OptionMark = "most" | "least" | null;

/**
 * One option, as a card that IS its text (docs/domain.md D14: option images are
 * cancelled, so the type carries the whole card).
 *
 * Three rules from `CLAUDE_DESIGN_QUIZ_BLOCK.md` shape everything here:
 *
 *  - §3 "no option may look like the right answer": at rest all four cards are
 *    identical — same fill, same ring, same weight. Nothing is primary, nothing
 *    is default, and the shuffle (`shownOrderFor`) means there is no first card
 *    either.
 *  - §6 "do not use a colour to distinguish most from least without a second
 *    cue": each mark carries a visible word — "Más yo" / "Menos yo" — and its
 *    own shape. Most lifts on `shadow-toy` with a solid ring; least sits flat
 *    and recedes with a dashed one. Read with no colour at all, they still
 *    differ.
 *  - §3 "the cards are mostly empty": eight words in a card built for an
 *    illustration, so the type is the filling — centred, large for its box,
 *    with the mark pinned to the bottom where it cannot reflow the text.
 *
 * The accessible name is the option text alone (`aria-label`), which is what
 * makes `getByRole("button", { name: "…" })` the way to reach a card: the mark
 * is state, and state belongs in `aria-pressed`, not in the name.
 *
 * NOTHING about the pillar or the keying reaches this component. It receives a
 * key and a text; `pillar`, `keyed`, `focusPillar` and `source` stay on the
 * server (PILLARS.md §8 rule 1) — a prop it never takes is a prop that cannot
 * be serialized into the RSC payload.
 */
export function OptionCard({
  text,
  mark,
  onSelect,
}: {
  text: string;
  mark: OptionMark;
  onSelect: () => void;
}) {
  return (
    <button
      aria-label={text}
      aria-pressed={mark !== null}
      className={cn(
        "flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-center transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        mark === null &&
          "border-border bg-card text-ink shadow-card active:translate-y-px",
        mark === "most" &&
          "-translate-y-0.5 border-primary bg-primary-tint text-ink shadow-toy",
        mark === "least" &&
          "border-dashed border-ink-faint bg-surface-alt text-ink-muted"
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        className={cn(
          "text-balance text-base leading-snug font-semibold",
          mark === "least" && "line-through decoration-1"
        )}
      >
        {text}
      </span>

      {/* Reserved height, so placing a mark never reflows the grid under the
          thumb — the card looks the same size marked and unmarked. */}
      <span className="flex h-5 items-center">
        {mark !== null && (
          <Badge
            className="font-mono text-xs tracking-[0.06em] lowercase"
            variant={mark === "most" ? "default" : "outline"}
          >
            {mark === "most" ? MOST_LABEL : LEAST_LABEL}
          </Badge>
        )}
      </span>
    </button>
  );
}
