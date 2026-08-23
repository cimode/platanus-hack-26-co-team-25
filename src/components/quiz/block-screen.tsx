"use client";

import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { preload, useFormStatus } from "react-dom";
import { answerBlockAction } from "@/app/quiz/actions";
import { useEmotePlayer } from "@/components/emotes/use-emote-player";
import {
  FLOW_QUIZ_FIRST_STEP,
  FlowProgress,
} from "@/components/intake/flow-progress";
import { Button } from "@/components/ui/button";
import { emoteSheet } from "@/lib/domain/emotes/emotes";
import type { Avatar } from "@/lib/domain/participant/avatar";
import type { OptionKey } from "@/lib/domain/quiz";
import type { PublicBlock, PublicOption } from "@/lib/use-cases/quiz-progress";
import { type OptionMark, OptionRow } from "./option-card";
import { SceneStage, SceneText } from "./scene-stage";

/**
 * One block, one screen (issue #9, `CLAUDE_DESIGN_QUIZ_BLOCK.md`, style "B ·
 * Diálogo"): the participant's avatar tells the scene in a speech bubble and
 * the four options are the replies of an RPG dialogue menu.
 *
 * This is the island -- `"use client"` sits here and not on the page, so the
 * fifteen blocks cost one small component on the wire instead of a whole route
 * (`ui-composition` §3; the phone is on venue wifi and completion is the demo).
 *
 * What it receives is deliberately thin: `{ position, scenario, options: [{
 * key, text }] }` and the avatar's id. No pillar, no keying, no focus pillar,
 * no domain, no source -- not because it does not display them, but because a
 * client prop is serialized into the HTML as an RSC payload, and a payload is
 * as readable as the DOM (`e2e/quiz.spec.ts` AC-7 greps the served bytes for
 * exactly that).
 *
 * SINGLE PICK (the default, `src/app/quiz/single-pick.ts`): the tap is the
 * answer. Each row is a submit button carrying `mostKey`, so without
 * JavaScript the browser posts it on its own. Hydrated, the click is
 * intercepted: the row takes "Más yo", the sprite celebrates, and ~650ms later
 * -- enough for the press and the hop to read -- the form is submitted with
 * that row as the submitter. A second tap inside that window is ignored, not
 * queued: two submits for one block would upsert the same row twice and, on
 * block 15, race the completing write.
 *
 * MOST + LEAST (`HOOKAI_QUIZ_MOST_LEAST=1`): the two-mark elicitation as the
 * issue decided it --
 *
 *   tap an unmarked row   → "Más yo" if it is free, otherwise "Menos yo"
 *   tap a marked row      → that mark is cleared
 *   tap a third row       → "Menos yo" moves to it; "Más yo" stays put
 *
 * -- with the marks in hidden inputs and an explicit "Siguiente ▸" enabled
 * only once both are placed, so a mis-tap on the last row never submits.
 *
 * The four rows are laid out in `order` -- `shownOrderFor(participantId,
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
  avatar,
  initialMost = null,
  initialLeast = null,
}: {
  block: PublicBlock;
  /** 15 -- passed rather than imported so the island never reads the constant. */
  total: number;
  /** `/quiz?block=N-1`, or null on the first block: there is nothing behind it. */
  backTo: string | null;
  /**
   * The slot order, e.g. `"dacb"`: the option keys -- already in the HTML as
   * the submitted `mostKey` -- permuted, and nothing else. It carries no pillar.
   */
  order: string | null;
  singlePick: boolean;
  /** The participant's stored plate; null only for a row older than the column. */
  avatar: Avatar | null;
  /** The stored row's marks, so a re-answer opens on what was written. */
  initialMost?: OptionKey | null;
  initialLeast?: OptionKey | null;
}) {
  const [most, setMost] = useState<OptionKey | null>(initialMost);
  const [least, setLeast] = useState<OptionKey | null>(
    singlePick ? null : initialLeast
  );
  const [submitting, setSubmitting] = useState(false);
  const player = useEmotePlayer();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The reaction sheet is ~160KB; fetched once, after hydration, while the
  // scenario is being read, so the first celebration has a frame to show and
  // the first paint paid for nothing but the idle plate.
  const celebrate = avatar ? emoteSheet(avatar, "celebrate") : null;
  useEffect(() => {
    if (celebrate) preload(celebrate.src, { as: "image" });
  }, [celebrate]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (giveUp.current) clearTimeout(giveUp.current);
    },
    []
  );

  const react = () => {
    if (celebrate) player.play("celebrate");
  };

  const pick = (key: OptionKey, event: MouseEvent<HTMLButtonElement>) => {
    if (singlePick) {
      // Ours from here: the native submit would post before the press reads.
      event.preventDefault();
      if (submitting) return;
      const submitter = event.currentTarget;
      setMost(key);
      setSubmitting(true);
      react();
      timer.current = setTimeout(() => {
        formRef.current?.requestSubmit(submitter);
      }, SUBMIT_DELAY_MS);
      // Venue wifi drops requests. Without this the screen locks on the first
      // tap that never reaches the server -- the four rows stay out of play,
      // the block never advances, and the only way out is a reload nobody
      // thinks to try. A tap that has not navigated in ten seconds is a tap
      // that failed, so the rows come back and the participant can try again.
      // (The Server Action upserts by position, so a double answer is one row.)
      giveUp.current = setTimeout(() => setSubmitting(false), GIVE_UP_MS);
      return;
    }

    if (key === most) {
      setMost(null);
      return;
    }
    if (key === least) {
      setLeast(null);
      return;
    }
    if (most === null) {
      setMost(key);
      react();
      return;
    }
    setLeast(key);
  };

  const markOf = (key: OptionKey): OptionMark => {
    if (key === most) return "most";
    if (key === least) return "least";
    return null;
  };

  const ready = most !== null && least !== null;
  const isLast = block.position === total;
  const rows = inShownOrder(block.options, order);

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

        {/* The whole flow's bar, not the quiz's own: registration is the step
            behind block 1 (issue #42). */}
        <FlowProgress step={FLOW_QUIZ_FIRST_STEP + block.position - 1} />
      </header>

      <SceneStage
        avatar={avatar}
        className="shrink-0"
        eyebrow={`escena ${block.position} de ${total}`}
        onEnd={player.stop}
        playing={player.playing}
      >
        <SceneText text={block.scenario} />
      </SceneStage>

      <form
        action={answerBlockAction}
        className="flex min-h-0 flex-1 flex-col gap-3"
        ref={formRef}
      >
        <input name="position" type="hidden" value={block.position} />
        {!singlePick && (
          <>
            <input name="mostKey" type="hidden" value={most ?? ""} />
            <input name="leastKey" type="hidden" value={least ?? ""} />
          </>
        )}

        {/* Four full-width replies, centred in whatever height the bubble
            left. `min-h-0` keeps the last row on screen at 390x844 whatever
            the copy does -- a row below the fold is a row nobody taps (§7.1). */}
        {/* `overflow-y-auto` is the concession to a phone smaller than the
            390x844 target: the column cannot scroll (h-dvh, overflow-hidden),
            so without it a long scenario plus four long options would push the
            fourth row off a 640px screen with no way to reach it. At the
            target size nothing overflows and nothing scrolls. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-y-auto">
          {rows.map((option) => (
            <OptionRow
              key={option.key}
              disabled={submitting}
              mark={markOf(option.key)}
              onSelect={(event) => pick(option.key, event)}
              optionKey={option.key}
              submits={singlePick}
              text={option.text}
            />
          ))}
        </div>

        <p
          aria-live="polite"
          className="min-h-4 shrink-0 text-center text-xs text-ink-muted"
        >
          {hint(most, least, singlePick)}
        </p>

        {!singlePick && <Submit isLast={isLast} ready={ready} />}
      </form>
    </main>
  );
}

/** Long enough for the press and the hop to read; short enough to feel like a tap. */
const SUBMIT_DELAY_MS = 650;

/** After this, a tap that has not navigated is assumed lost and can be retaken. */
const GIVE_UP_MS = 10_000;

/**
 * `block.options` in the slots `order` names, e.g. `"dacb"` → d, a, c, b.
 *
 * A pure function of its arguments, so the server render and the hydration
 * agree; the marks stay keyed by `option.key`, never by slot index, so a
 * reorder cannot move a mark.
 *
 * Anything that is not a permutation of exactly these four keys -- a null
 * order, a truncated string, a repeat -- falls back to the stored order rather
 * than dropping or duplicating a row: four rows on screen is the harder
 * invariant (§7.1), and a wrong-but-complete order is recorded as what it is.
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

/** What to do next, in one line, without naming a row. */
function hint(
  most: OptionKey | null,
  least: OptionKey | null,
  singlePick: boolean
): string {
  if (singlePick) return "Toca la que más se parece a ti";
  if (most === null) return "Marca la que más se parece a ti";
  if (least === null) return "Ahora la que menos";
  return "";
}

/**
 * The advance control of most+least mode.
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
      {isLast ? "Terminar ▸" : "Siguiente ▸"}
    </Button>
  );
}
