"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  BANDS,
  DECLARED_SCREENS,
  type DeclaredScreen,
} from "@/components/intake/declared/bands";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { MAX_TAGS } from "@/lib/domain/participant";
import { submitDeclared } from "@/lib/use-cases/submit-declared";

/**
 * The declared round's Server Action -- one per screen, not one per round
 * (issue #8).
 *
 * Each Continue persists exactly what its screen asked for, so a participant
 * who closes the tab on a crowded venue wifi keeps every tap they made
 * (`PILLARS.md` §8: the declared round is the demo insurance). The action is a
 * public HTTP endpoint reachable without the page ever rendering, so it
 * re-reads the cookie itself and validates the `FormData` against
 * docs/form-response.md §10 before a use case sees it.
 *
 * An untapped band RETURNS rather than redirects: `useActionState` threads the
 * message into the re-render, the screen stays where it is, and nothing is
 * written -- so a reopened `/intake/declared` still lands on this screen.
 */

/** Only types are exported beside the action -- they erase at compile time. */
export type DeclaredScreenState = { error?: string };

/** The literal union IS `DeclaredBand`: the band tapped, never a float (D6). */
const band = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

/**
 * docs/form-response.md §10 `DeclaredInput`, minus the acquaintances the picker
 * does not exist for. Partial because the round is saved a screen at a time.
 */
const DeclaredInput = z
  .object({
    moneyPosture: band,
    rootedness: band,
    familyGravity: band,
    capacityHoursBand: band,
    distanceBand: band,
    chronotype: band,
    // The vocabulary AND the cap belong to the use case, which owns the refusal
    // (`reason: "tags"`) for a hand-crafted POST as well as for this form.
    // Re-stating `.max(MAX_TAGS)` here would turn "too many tags" into a parse
    // failure and report the generic copy for it, leaving the message that
    // actually names the cap unreachable.
    tags: z.array(z.string()),
  })
  .partial();

/** The one message a half-answered screen may show. */
const PICK_ONE = "Elige una opción en cada pregunta.";
const GENERIC = "No se pudo guardar. Intenta de nuevo.";

export async function declaredScreenAction(
  _previous: DeclaredScreenState,
  formData: FormData
): Promise<DeclaredScreenState> {
  const submitted = formData.get("screen");
  const screen = DECLARED_SCREENS.find((s) => s.id === submitted);
  if (!screen) return { error: GENERIC };

  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const raw: Record<string, unknown> = {};
  for (const key of screen.bands) {
    // The DOM names are opaque (`q1`..`q6`); the mapping back to the column
    // lives with the copy, so nothing on the wire names the axis.
    const value = formData.get(BANDS[key].field);
    // Untapped: the participant is looking at the screen that asks for it.
    if (typeof value !== "string" || value === "") return { error: PICK_ONE };
    raw[key] = Number(value);
  }
  if (screen.tags) {
    raw.tags = formData
      .getAll("tags")
      .filter((value): value is string => typeof value === "string");
  }

  const parsed = DeclaredInput.safeParse(raw);
  if (!parsed.success) return { error: GENERIC };

  const result = await submitDeclared(
    { sessionToken: token, patch: parsed.data },
    serverDeps()
  );

  if (!result.ok) {
    if (result.reason === "no-session") redirect("/intake");
    // `tags` is both refusals the use case makes -- over the cap, and a slug
    // outside the vocabulary -- so the copy names the list as well as the
    // number. Neither is reachable from the picker, which disables the 13th box
    // and only ever posts its own slugs: this is what a hand-crafted POST gets.
    return {
      error:
        result.reason === "tags"
          ? `Elige hasta ${MAX_TAGS} opciones de la lista.`
          : GENERIC,
    };
  }

  redirect(nextPath(screen, result.complete));
}

/**
 * Where Continue goes. `complete` is the repository's own answer -- all six
 * bands present, so `declared_at` is now set -- and it is what makes the
 * questions the next stop rather than another declared screen (D18).
 */
function nextPath(screen: DeclaredScreen, complete: boolean): string {
  if (complete) return "/quiz";
  const next = DECLARED_SCREENS[DECLARED_SCREENS.indexOf(screen) + 1];
  // No next screen and still incomplete: back to the round, which resumes at
  // whichever band is still untapped.
  return next ? `/intake/declared?screen=${next.id}` : "/intake/declared";
}
