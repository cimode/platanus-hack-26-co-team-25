"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { prefetchQuizBatch } from "@/lib/use-cases/ensure-quiz-batch";
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
 * On success the participant's first five quiz blocks start being written in
 * `after()` (docs/domain.md D16), off the response and inside `/intake`'s
 * `maxDuration`. The declared round takes minutes and authoring takes ~40-70s,
 * so by the time `/quiz` asks for block 1 it is one SELECT instead of a wait on
 * a model. `prefetchQuizBatch` never rejects.
 */

/** Only types are exported beside the action -- they erase at compile time. */
export type RegisterState = {
  nameError?: string;
  genderError?: string;
  birthdateError?: string;
  photoError?: string;
  /** Anything not attributable to one field. */
  error?: string;
};

const ROOM_MISSING = "Esta sala no existe.";

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
    };
    const named =
      fields.nameError ??
      fields.genderError ??
      fields.birthdateError ??
      fields.photoError;
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

  // The person exists and will reach the questions: start authoring their first
  // five blocks now, after the response (docs/domain.md D16).
  after(() => prefetchQuizBatch({ participantId, batch: 1 }, serverDeps()));

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // swallow the navigation and re-render the form over a created row.
  redirect("/intake/declared");
}
