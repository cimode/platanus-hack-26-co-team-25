"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { setSessionCookie } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { assignQuizForm } from "@/lib/use-cases/assign-quiz-form";
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
 * On success the hand-off is straight to `/quiz` (docs/domain.md D20, D21):
 * there is no declared round in between any more, so all twelve questions have
 * to exist by the time the redirect lands -- and they do. `assignQuizForm`
 * deals this participant their own twelve blocks out of the committed bank and
 * writes them in ONE INSERT, awaited before the redirect. No model, no pool, no
 * background chain, nothing to outrun: the questions were written offline and
 * committed, so the only cost of having them is the row.
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
  try {
    const { participant, sessionToken } = await registerParticipant(
      {
        roomSlug: room,
        name,
        gender,
        birthdate,
        // The parse above already refused anything but the ticked literal.
        dataConsent: true,
        // Checkboxes: `getAll` is the whole array, and none ticked is [].
        tags: formData
          .getAll("tags")
          .filter((v): v is string => typeof v === "string"),
        photo: {
          bytes: new Uint8Array(await file.arrayBuffer()),
          contentType: file.type,
        },
      },
      serverDeps()
    );
    await setSessionCookie(sessionToken);
    participantId = participant.id;
  } catch (error) {
    if (error instanceof RegisterParticipantError) {
      return COPY[error.reason] ?? { error: ROOM_MISSING };
    }
    throw error;
  }

  // Awaited, not deferred: the redirect lands on block 1, and the twelve
  // blocks it walks have to be this participant's before the response leaves.
  // One INSERT, and it upserts -- a double submit writes the same twelve rows.
  await assignQuizForm({ participantId }, serverDeps());

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // swallow the navigation and re-render the form over a created row.
  redirect("/quiz");
}
