"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  readSessionToken,
  setSessionCookie,
} from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import {
  RegisterParticipantError,
  registerParticipant,
} from "@/lib/use-cases/register-participant";
import { SetConsentError, setConsent } from "@/lib/use-cases/set-consent";
import { SetPhotoError, setPhoto } from "@/lib/use-cases/set-photo";

/**
 * The three intake Server Actions (issue #6).
 *
 * Every one of them is a public HTTP endpoint reachable without ever rendering
 * the page, so each re-reads the session cookie itself and each re-resolves the
 * room by slug -- the Next forms guide's warning, and the reason no room id and
 * no participant id ever crosses the wire.
 *
 * `FormData` is validated with zod against docs/form-response.md §10 before it
 * reaches a use case. The copy lives here rather than in the use case: the use
 * cases speak in reasons (`invalid-name`, `too-large`), the screen speaks
 * English.
 *
 * Register and photo redirect back to `/intake?room=<slug>` on success, and the
 * page decides the step from the rows (docs/domain.md §0). That is what makes
 * the flow work without JavaScript and what makes "reload lands where you left
 * off" true by construction rather than by a step counter someone has to keep
 * in sync.
 *
 * Consent redirects too, and to the next STEP rather than back to `/intake`:
 * issue #8 gave the flow a step 4, so `consent -> declared round` (§0) is a
 * navigation now instead of a done screen the rows could not express. The
 * saved switches stay visible where they always were -- on `/intake` itself,
 * which resolves to step 3 until a band is tapped. `useActionState` still
 * carries the error case into the re-render before hydration, so a phone whose
 * bundle never arrived sees the same screen.
 */

/** Only types are exported beside the actions -- they erase at compile time. */
export type RegisterState = {
  /** Shown next to the Name field, announced with `aria-live`. */
  nameError?: string;
  /** Shown next to Team / Track, for the same reason. */
  teamError?: string;
  trackError?: string;
  /** Anything not attributable to one field. */
  error?: string;
};

export type PhotoState = { error?: string };

export type ConsentState = { error?: string };

const RegisterInput = z.object({
  room: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
  team: z
    .string()
    .trim()
    .max(80, "Team must be 80 characters or fewer")
    .optional(),
  track: z
    .string()
    .trim()
    .max(80, "Track must be 80 characters or fewer")
    .optional(),
});

const ConsentInput = z.object({
  romantic: z.boolean().default(false),
  business: z.boolean().default(false),
  friendship: z.boolean().default(false),
});

const RoomField = z.string().trim().min(1).max(200);

/** The URL the participant continues at; the page re-resolves the slug. */
function intakePath(slug: string): string {
  return `/intake?${new URLSearchParams({ room: slug }).toString()}`;
}

/** `formData.get` returns `File | string | null`; only a string is a field. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** An unchecked box sends nothing at all -- absence IS the "off" (D12). */
function checked(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

function issueFor(error: z.ZodError, field: string): string | undefined {
  return error.issues.find((issue) => issue.path[0] === field)?.message;
}

/**
 * Step 1. Creates the participant and the session in one `db.batch()`, then
 * writes the returned token to the httpOnly cookie -- the only place it is
 * ever written (D4).
 */
export async function registerAction(
  _previous: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = RegisterInput.safeParse({
    room: text(formData, "room"),
    name: text(formData, "name"),
    team: text(formData, "team"),
    track: text(formData, "track"),
  });

  if (!parsed.success) {
    // Each field answers for itself. Folding Team's or Track's length into the
    // generic message put "This room doesn't exist." under the Name field for
    // someone whose only mistake was typing a sentence into Team.
    const fields = {
      nameError: issueFor(parsed.error, "name"),
      teamError: issueFor(parsed.error, "team"),
      trackError: issueFor(parsed.error, "track"),
    };
    if (fields.nameError || fields.teamError || fields.trackError) {
      return fields;
    }
    // Nothing left but `room`, which the participant never typed.
    return { error: "This room doesn't exist." };
  }

  const { room, name, team, track } = parsed.data;

  try {
    const { sessionToken } = await registerParticipant(
      { roomSlug: room, name, team, track },
      serverDeps()
    );
    await setSessionCookie(sessionToken);
  } catch (error) {
    if (error instanceof RegisterParticipantError) {
      return error.reason === "invalid-name"
        ? { nameError: "Name is required" }
        : { error: "This room doesn't exist." };
    }
    throw error;
  }

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // swallow the navigation and re-render step 1 with the cookie already set.
  revalidatePath("/intake");
  redirect(intakePath(room));
}

/**
 * Step 2. The client re-encodes to <= 512 px JPEG first; the use case enforces
 * the ceiling anyway, because this endpoint is reachable without the client.
 */
export async function photoAction(
  _previous: PhotoState,
  formData: FormData
): Promise<PhotoState> {
  const room = RoomField.safeParse(text(formData, "room"));
  if (!room.success) return { error: "This room doesn't exist." };

  const token = await readSessionToken();
  if (!token) return { error: "Your session expired — start again." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Take or choose a photo to continue." };
  }

  try {
    await setPhoto(
      {
        sessionToken: token,
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
      },
      serverDeps()
    );
  } catch (error) {
    if (error instanceof SetPhotoError) return { error: photoCopy(error) };
    throw error;
  }

  revalidatePath("/intake");
  redirect(intakePath(room.data));
}

function photoCopy(error: SetPhotoError): string {
  if (error.reason === "too-large") return "Photo is too large — try again";
  if (error.reason === "unsupported-type") {
    return "That file isn't a photo we can use";
  }
  return "Your session expired — start again.";
}

/**
 * Step 3. Saving with every switch off is a valid answer and stores three noes
 * (docs/domain.md §5): consent is opt-in, so silence is a no, not a prompt.
 *
 * Hands off to the declared round, which is the deferral #6 wrote down and #8
 * closes: the flow is `consent -> declared round` (docs/domain.md §0), and the
 * temporary "You're in" screen is gone. What was saved is still visible -- it
 * is read back from the rows by reopening `/intake?room=...`, where the three
 * switches show what is stored, rather than from a screen only a fresh save
 * could reach.
 */
export async function consentAction(
  _previous: ConsentState,
  formData: FormData
): Promise<ConsentState> {
  const room = RoomField.safeParse(text(formData, "room"));
  if (!room.success) return { error: "This room doesn't exist." };

  const token = await readSessionToken();
  if (!token) return { error: "Your session expired — start again." };

  const parsed = ConsentInput.safeParse({
    romantic: checked(formData, "romantic"),
    business: checked(formData, "business"),
    friendship: checked(formData, "friendship"),
  });
  if (!parsed.success) return { error: "That didn't save — try again." };

  try {
    await setConsent(
      { sessionToken: token, consent: parsed.data },
      serverDeps()
    );
  } catch (error) {
    if (error instanceof SetConsentError) {
      return { error: "Your session expired — start again." };
    }
    throw error;
  }

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // swallow the navigation and re-render step 3 over a saved row.
  redirect("/intake/declared");
}
