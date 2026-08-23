"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  type DeclaredScreenState,
  declaredScreenAction,
} from "@/app/intake/declared/actions";
import { BandTapGroup } from "@/components/intake/declared/band-tap-group";
import { TagPicker } from "@/components/intake/declared/tag-picker";
import { Button } from "@/components/ui/button";
import type { DeclaredBand } from "@/lib/domain/participant";

/**
 * One screen of the declared round (issue #8, reshaped by #42).
 *
 * This is the `"use client"` boundary and it is drawn here rather than on the
 * page (ui-composition hard rule 6): only the screen in front of the
 * participant crosses the wire, and it needs the client for exactly two things
 * -- `useActionState`'s `pending`, and the "elige una opción en cada pregunta"
 * message the action returns INSTEAD of redirecting when a question on this
 * screen is unanswered.
 *
 * What it receives is deliberately thin, and for the same reason the quiz's
 * block screen is: a client prop is serialized into the HTML as an RSC payload,
 * and a payload is as readable as the DOM. So the band KEYS never cross --
 * only an opaque field id, the question and its four options. Nothing served
 * for this screen names the axis it measures (AC-5, AC-6).
 *
 * Nothing is persisted on the refusal path, so a reopened `/intake/declared`
 * still lands here; the taps survive because each `BandTapGroup` holds its own
 * selection in state across the re-render.
 */

export interface Question {
  /** `q1`…`q6` -- what the group posts under; the action maps it back. */
  field: string;
  /** Ends in "?", and is the whole of the card's copy. */
  question: string;
  options: readonly string[];
  /** What is already stored, so a resumed screen opens on it. */
  value: DeclaredBand | null;
}

const INITIAL: DeclaredScreenState = {};

export function DeclaredScreen({
  screenId,
  questions,
  showTags,
  savedTags,
  previousScreenId,
}: {
  screenId: string;
  questions: readonly Question[];
  showTags: boolean;
  savedTags: string[];
  previousScreenId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    declaredScreenAction,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      {/* Which screen this is; the action re-reads the round from the rows. */}
      <input name="screen" type="hidden" value={screenId} />

      {questions.map((question) => (
        <BandTapGroup
          defaultValue={question.value}
          field={question.field}
          key={question.field}
          options={question.options}
          question={question.question}
        />
      ))}

      {showTags ? <TagPicker defaultValue={savedTags} /> : null}

      <p
        aria-live="polite"
        className="min-h-5 text-sm font-medium text-destructive"
      >
        {state.error ?? ""}
      </p>

      <div className="mt-auto flex items-center gap-3">
        {previousScreenId ? (
          <Button
            asChild
            className="h-12 rounded-2xl px-5 font-display text-base font-bold"
            variant="outline"
          >
            <Link href={`/intake/declared?screen=${previousScreenId}`}>
              Atrás
            </Link>
          </Button>
        ) : null}
        <Button
          className="h-12 flex-1 rounded-2xl font-display text-base font-bold shadow-toy"
          disabled={pending}
          type="submit"
        >
          Continuar
        </Button>
      </div>
    </form>
  );
}
