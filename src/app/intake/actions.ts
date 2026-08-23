"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import {
  adoptPoolSet,
  continueQuizGeneration,
} from "@/lib/use-cases/ensure-quiz-batch";
import {
  RegisterParticipantError,
  type RegisterParticipantReason,
  registerParticipant,
} from "@/lib/use-cases/register-participant";

/**
 * Intake's one Server Action (issue #42).
 *
 * The MVP asks everything on a single screen -- photo, name, gender, birthdate
 * -- so there is one action instead of three, and it is a public HTTP endpoint
 * reachable without the page ever rendering: it re-reads nothing from the
 * client it can derive, resolves the room by SLUG (never an id, D9) and
 * validates the `FormData` with zod before a use case sees it.
 *
 * The copy lives here rather than in the use case: the use case speaks in
 * reasons (`birthdate-too-young`, `photo`), the screen speaks Spanish. Nothing
 * it can say names what is being measured.
 *
 * On success the hand-off is straight to `/quiz` (docs/domain.md D20): there is
 * no declared round in between any more, so the first questions have to exist
 * by the time the redirect lands. Two things make that true. First, BEFORE
 * the redirect, `adoptPoolSet` moves a pre-written set of first questions from
 * the room's pool into this participant's rows -- one UPDATE, written while
 * the form was open (`/intake` tops the pool up in `after()`). Second,
 * `continueQuizGeneration` runs in `after()`, off the response and inside
 * `/intake`'s `maxDuration`, and chains whatever is still missing: batch 1
 * when there was nothing to adopt, then 2 and 3 while the first five are
 * answered. Neither call rejects, and the quiz itself never generates on a
 * read -- it shows a "writing your questions" state until the rows exist.
 */

/** Only types are exported beside the action -- they erase at compile time. */
export type RegisterState = {
  nameError?: string;
  genderError?: string;
  birthdateError?: string;
  photoError?: string;
  /** The data-treatment box (issue #49). */
  dataError?: string;
  /** Anything not attributable to one field. */
  error?: string;
};

const ROOM_MISSING = "Esta sala no existe.";

/** One sentence, said the same way whichever side refuses (issue #49). */
const DATA_MISSING = "Necesitamos tu autorización para continuar";

const RegisterInput = z.object({
  room: z.string().trim().min(1).max(200),
  name: z
    .string()
    .trim()
    .min(1, "Escribe tu nombre")
    .max(80, "Máximo 80 caracteres"),
  gender: z.enum(["M", "F", "NB"], { message: "Elige una opción" }),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Escribe tu fecha de nacimiento"),
  /**
   * An unticked checkbox submits NOTHING -- no key at all -- so the literal
   * a browser sends when it is ticked is the whole contract (issue #49).
   */
  dataConsent: z.literal("on", DATA_MISSING),
});

/** `formData.get` returns `File | string | null`; only a string is a field. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function issueFor(error: z.ZodError, field: string): string | undefined {
  return error.issues.find((issue) => issue.path[0] === field)?.message;
}

/** One sentence per refusal, keyed by the reason the use case threw. */
const COPY: Record<RegisterParticipantReason, RegisterState> = {
  "room-not-found": { error: ROOM_MISSING },
  "invalid-name": { nameError: "Escribe tu nombre" },
  "invalid-gender": { genderError: "Elige una opción" },
  "birthdate-malformed": {
    birthdateError: "Escribe tu fecha de nacimiento",
  },
  "birthdate-too-young": {
    birthdateError: "Tienes que tener al menos 18 años",
  },
  "birthdate-too-old": { birthdateError: "Revisa el año, no cuadra" },
  "photo-missing": { photoError: "Agrega una foto" },
  "photo-unsupported-type": {
    photoError: "Ese archivo no sirve como foto",
  },
  "photo-too-large": { photoError: "La foto pesa demasiado, intenta de nuevo" },
  "data-consent": { dataError: DATA_MISSING },
  photo: { photoError: "No pudimos guardar tu foto, intenta de nuevo" },
};

export async function registerAction(
  _previous: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = RegisterInput.safeParse({
    room: text(formData, "room"),
    name: text(formData, "name"),
    gender: text(formData, "gender"),
    birthdate: text(formData, "birthdate"),
    dataConsent: text(formData, "dataConsent"),
  });

  // The file is read before the parse result is judged so that a person who
  // got two things wrong is told about both at once.
  const file = formData.get("photo");
  const hasPhoto = file instanceof File && file.size > 0;

  if (!parsed.success || !hasPhoto) {
    const fields: RegisterState = {
      nameError: parsed.success ? undefined : issueFor(parsed.error, "name"),
      genderError: parsed.success
        ? undefined
        : issueFor(parsed.error, "gender"),
      birthdateError: parsed.success
        ? undefined
        : issueFor(parsed.error, "birthdate"),
      photoError: hasPhoto ? undefined : "Agrega una foto",
      dataError: parsed.success
        ? undefined
        : issueFor(parsed.error, "dataConsent"),
    };
    const named =
      fields.nameError ??
      fields.genderError ??
      fields.birthdateError ??
      fields.photoError ??
      fields.dataError;
    // Nothing left but `room`, which nobody typed.
    return named ? fields : { error: ROOM_MISSING };
  }

  const { room, name, gender, birthdate } = parsed.data;

  let participantId: string;
  let roomId: string;
  try {
    const { participant, sessionToken } = await registerParticipant(
      {
        roomSlug: room,
        name,
        gender,
        birthdate,
        // The parse above already refused anything but the ticked literal.
        dataConsent: true,
        photo: {
          bytes: new Uint8Array(await file.arrayBuffer()),
          contentType: file.type,
        },
      },
      serverDeps()
    );
    await setSessionCookie(sessionToken);
    participantId = participant.id;
    roomId = participant.roomId;
  } catch (error) {
    if (error instanceof RegisterParticipantError) {
      return COPY[error.reason] ?? { error: ROOM_MISSING };
    }
    throw error;
  }

  // Awaited, not deferred: the redirect lands on block 1, and the set it shows
  // has to be this participant's before the response leaves. One UPDATE.
  await adoptPoolSet({ participantId, roomId }, serverDeps());

  // Everything still missing -- batch 1 if nothing was adopted, then 2 and 3
  // -- is authored after the response, claim-guarded so a double submit or a
  // concurrent quiz read never writes the same batch twice (D20).
  after(() =>
    continueQuizGeneration(
      { participantId, roomId, budgetMs: 240_000 },
      serverDeps()
    )
  );

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // swallow the navigation and re-render the form over a created row.
  redirect("/quiz");
}
