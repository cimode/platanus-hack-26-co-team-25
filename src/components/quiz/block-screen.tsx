"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { answerBlockAction } from "@/app/quiz/actions";
import {
  FLOW_QUIZ_FIRST_STEP,
  FlowProgress,
} from "@/components/intake/flow-progress";
import { Button } from "@/components/ui/button";
import type { OptionKey } from "@/lib/domain/quiz";
import type { PublicBlock, PublicOption } from "@/lib/use-cases/quiz-progress";
import { OptionCard, type OptionMark } from "./option-card";

/**
 * One block, one screen (issue #9, `CLAUDE_DESIGN_QUIZ_BLOCK.md`).
 *
 * This is the island — `"use client"` sits here and not on the page, so the
 * fifteen blocks cost one small component on the wire instead of a whole route
 * (`ui-composition` §3; the phone is on venue wifi and completion is the demo).
 *
 * What it receives is deliberately thin: `{ position, scenario, options: [{
 * key, text }] }`. No pillar, no keying, no focus pillar, no domain, no source
 * — not because it does not display them, but because a client prop is
 * serialized into the HTML as an RSC payload, and a payload is as readable as
 * the DOM (`e2e/quiz.spec.ts` AC-7 greps the served bytes for exactly that).
 *
 * The elicitation, as decided in the issue:
 *
 *   tap an unmarked card   → "Más yo" if it is free, otherwise "Menos yo"
 *   tap a marked card      → that mark is cleared
 *   tap a third card       → "Menos yo" moves to it; "Más yo" stays put
 *
 * A card can therefore never hold both marks: the only way to re-tap the "Más
 * yo" card is to clear it first. That is what makes the "conflict" state of
 * §9 impossible by construction rather than by validation.
 *
 * Advance is explicit and enabled only once both marks are placed (one under
 * single-pick) — a mis-tap on the last card must never submit the block.
 *
 * The four cards are laid out in `order` — `shownOrderFor(participantId,
 * position)`, the very string written to `quiz_responses.shown_order` (D10).
 * Rendering `block.options` in its stored `a,b,c,d` order instead would put the
 * same pillar in the same slot fifteen times (the mapping AUDIT.md calls
 * learnable) AND make every recorded `shown_order` a fiction, so the position-
 * bias analysis it exists for would read an order nobody was shown.
 */
export function BlockScreen({
  block,
  total,
  backTo,
  order,
  singlePick,
  initialMost = null,
  initialLeast = null,
}: {
  block: PublicBlock;
  /** 15 — passed rather than imported so the island never reads the constant. */
  total: number;
  /** `/quiz?block=N-1`, or null on the first block: there is nothing behind it. */
  backTo: string | null;
  /**
   * The slot order, e.g. `"dacb"`: the option keys — already in the HTML as the
   * submitted `mostKey` — permuted, and nothing else. It carries no pillar.
   */
  order: string | null;
  singlePick: boolean;
  /** The stored row's marks, so a re-answer opens on what was written. */
  initialMost?: OptionKey | null;
  initialLeast?: OptionKey | null;
}) {
  const [most, setMost] = useState<OptionKey | null>(initialMost);
  const [least, setLeast] = useState<OptionKey | null>(
    singlePick ? null : initialLeast
  );

  const select = (key: OptionKey) => {
    if (key === most) {
      setMost(null);
      return;
    }
    if (singlePick) {
      setMost(key);
      return;
    }
    if (key === least) {
      setLeast(null);
      return;
    }
    if (most === null) {
      setMost(key);
      return;
    }
    setLeast(key);
  };

  const markOf = (key: OptionKey): OptionMark => {
    if (key === most) return "most";
    if (key === least) return "least";
    return null;
  };

  const ready = most !== null && (singlePick || least !== null);
  const isLast = block.position === total;
  const cards = inShownOrder(block.options, order);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-4 overflow-hidden px-5 pt-4 pb-5">
      <header className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          {backTo ? (
            <Button asChild className="-ml-2 px-2" size="sm" variant="ghost">
              <Link href={backTo}>Atrás</Link>
            </Button>
          ) : (
            <span className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
              dipia
            </span>
          )}

          {/* One text node, in mono: the counter is the whole progress copy. */}
          <span className="font-mono text-xs tracking-[0.06em] text-ink-muted tabular-nums">
            {block.position}/{total}
          </span>
        </div>

        {/* The whole flow's bar, not the quiz's own: registration and the
            three declared screens are behind this block (issue #42). */}
        <FlowProgress step={FLOW_QUIZ_FIRST_STEP + block.position - 1} />
      </header>

      <p className="shrink-0 font-display text-lg leading-snug font-bold text-balance text-ink">
        {block.scenario}
      </p>

      <form
        action={answerBlockAction}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <input name="position" type="hidden" value={block.position} />
        <input name="mostKey" type="hidden" value={most ?? ""} />
        <input name="leastKey" type="hidden" value={least ?? ""} />

        {/* 2x2 of visually equal cards (§2). `min-h-0` keeps the bottom row on
            screen at 390x844 whatever the copy does — a card below the fold is
            a card nobody marks (§7.1). */}
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
          {cards.map((option) => (
            <OptionCard
              key={option.key}
              mark={markOf(option.key)}
              onSelect={() => select(option.key)}
              text={option.text}
            />
          ))}
        </div>

        <p
          aria-live="polite"
          className="min-h-4 text-center text-xs text-ink-muted"
        >
          {hint(most, least, singlePick)}
        </p>

        <Submit isLast={isLast} ready={ready} />
      </form>
    </main>
  );
}

/**
 * `block.options` in the slots `order` names, e.g. `"dacb"` → d, a, c, b.
 *
 * A pure function of its arguments, so the server render and the hydration
 * agree; the marks stay keyed by `option.key`, never by slot index, so a
 * reorder cannot move a mark.
 *
 * Anything that is not a permutation of exactly these four keys — a null order,
 * a truncated string, a repeat — falls back to the stored order rather than
 * dropping or duplicating a card: four cards on screen is the harder invariant
 * (§7.1), and a wrong-but-complete order is recorded as what it is.
 */
function inShownOrder(
  options: PublicOption[],
  order: string | null
): PublicOption[] {
  if (!order) return options;

  const slots = [...order].map((key) =>
    options.find((option) => option.key === key)
  );
  const complete =
    slots.length === options.length &&
    new Set(slots).size === options.length &&
    slots.every((option) => option !== undefined);

  return complete ? (slots as PublicOption[]) : options;
}

/** What is still missing, in one line, without naming a card. */
function hint(
  most: OptionKey | null,
  least: OptionKey | null,
  singlePick: boolean
): string {
  if (most === null) return "Marcá la que más te suena a vos";
  if (!singlePick && least === null) return "Ahora la que menos";
  return "";
}

/**
 * The advance control.
 *
 * Its own component so `useFormStatus` can read *this* form's pending state:
 * a second submit while the first is in flight would upsert the same row
 * twice and, on block 15, race the completing write.
 */
function Submit({ isLast, ready }: { isLast: boolean; ready: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="h-12 w-full shrink-0 rounded-2xl font-display text-base font-bold shadow-toy"
      disabled={!ready || pending}
      type="submit"
    >
      {isLast ? "Terminar" : "Siguiente"}
    </Button>
  );
}
