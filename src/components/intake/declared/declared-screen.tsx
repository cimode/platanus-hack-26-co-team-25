"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  type DeclaredScreenState,
  declaredScreenAction,
} from "@/app/intake/declared/actions";
import { BandTapGroup } from "@/components/intake/declared/band-tap-group";
import {
  BANDS,
  type BandKey,
  type DeclaredScreen as DeclaredScreenCopy,
} from "@/components/intake/declared/bands";
import { TagPicker } from "@/components/intake/declared/tag-picker";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";
import type { DeclaredBand } from "@/lib/domain/participant";

/**
 * One screen of the declared round (step 4, issue #8).
 *
 * This is the `"use client"` boundary and it is drawn here rather than on the
 * page (ui-composition hard rule 6): only the screen in front of the
 * participant crosses the wire, and it needs the client for exactly two things
 * -- `useActionState`'s `pending`, and the "pick one for each" message that the
 * action returns INSTEAD of redirecting when a band on this screen is untapped.
 *
 * Nothing is persisted on that path, so a reopened `/intake/declared` still
 * lands here; the taps survive because each `BandTapGroup` holds its own
 * selection in state across the re-render.
 */

export interface SavedDeclared {
  bands: Record<BandKey, DeclaredBand | null>;
  tags: string[];
}

const INITIAL: DeclaredScreenState = {};

export function DeclaredScreen({
  screen,
  saved,
  previousScreenId,
}: {
  screen: DeclaredScreenCopy;
  saved: SavedDeclared;
  previousScreenId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    declaredScreenAction,
    INITIAL
  );

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-4">
      <StepHeading step={4} title={screen.title} />

      {/* Which screen this is; the action re-reads the round from the rows. */}
      <input name="screen" type="hidden" value={screen.id} />

      {screen.bands.map((key) => (
        <BandTapGroup
          band={BANDS[key]}
          defaultValue={saved.bands[key]}
          key={key}
        />
      ))}

      {screen.tags ? <TagPicker defaultValue={saved.tags} /> : null}

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
              Back
            </Link>
          </Button>
        ) : null}
        <Button
          className="h-12 flex-1 rounded-2xl font-display text-base font-bold shadow-toy"
          disabled={pending}
          type="submit"
        >
          Continue
        </Button>
      </div>
    </form>
  );
}
