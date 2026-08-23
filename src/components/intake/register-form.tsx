"use client";

import { useActionState, useRef, useState } from "react";
import { type RegisterState, registerAction } from "@/app/intake/actions";
import { PhotoField } from "@/components/intake/photo-field";
import { TagPicker } from "@/components/intake/tags/tag-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: RegisterState = {};

/** Longest side, in CSS pixels, after the on-device re-encode. */
const MAX_EDGE = 512;

/** Enough for a face at 512 px; small enough to survive venue wifi. */
const JPEG_QUALITY = 0.82;

/**
 * The same ceiling the use case enforces, repeated here only to spare a phone
 * the upload. The server number is the real one.
 */
const MAX_BYTES = 1024 * 1024;

/** The server's own sentence, so the two paths read identically. */
const TOO_LARGE = "La foto pesa demasiado. Intenta de nuevo.";

/**
 * The one authorisation this version asks for (issue #49): habeas data wants
 * it explicit, in plain Spanish, and naming what is kept and how to undo it.
 */
const DATA_TREATMENT =
  "Acepto el tratamiento de mis datos personales (nombre, foto, fecha de " +
  "nacimiento y respuestas) para esta experiencia. Puedo pedir que se borren " +
  "escribiendo a privacidad@dipia.lat.";

/**
 * The one registration screen (issue #42): photo, name, gender, birthdate, one
 * submit.
 *
 * The smallest island that needs to be one -- `useActionState` is what turns
 * the server's sentences into visible copy without a navigation, and the page
 * above it stays on the server. Nothing here carries a heading, a step number
 * or a word about what is being measured.
 *
 * No field carries `required`: the browser would block the submit and the
 * participant would never see the server's sentence -- and the server has to
 * own that sentence anyway, because a Server Action is reachable without this
 * form.
 *
 * The re-encode happens on the phone. A modern camera produces 3-4 MB per shot,
 * the server ceiling is 1 MiB, and ~100 people are uploading over the same wifi
 * at the same time. It is a courtesy, never a control: with JavaScript off the
 * original file is submitted and the server refuses it the same way.
 */
export function RegisterForm({ roomSlug }: { roomSlug: string }) {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL);
  const [preview, setPreview] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const previewUrl = useRef<string | null>(null);

  function showPreview(blob: Blob) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(blob);
    setPreview(previewUrl.current);
  }

  async function handleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    // Captured synchronously: React nulls `currentTarget` once the handler
    // yields, and everything below this line is after an await.
    const input = event.currentTarget;
    const file = input.files?.[0];
    setTooLarge(false);
    if (!file) {
      setPreview(null);
      return;
    }

    setEncoding(true);
    try {
      const smaller = await downscale(file);
      if (smaller) {
        // Replacing the input's own FileList keeps the submit a plain form
        // submit -- no fetch, no hand-built FormData. Assigning `.files` fires
        // no change event, so this cannot loop.
        const transfer = new DataTransfer();
        transfer.items.add(smaller);
        input.files = transfer.files;
      }
      const chosen = smaller ?? file;
      setTooLarge(chosen.size > MAX_BYTES);
      showPreview(chosen);
    } finally {
      setEncoding(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-6">
      {/* The slug, not an id: the action resolves it against `rooms` itself. */}
      <input name="room" type="hidden" value={roomSlug} />

      <div className="space-y-3">
        <PhotoField
          invalid={Boolean(tooLarge || state.photoError)}
          onChange={handleChange}
          preview={preview}
        />
        <FieldError message={tooLarge ? TOO_LARGE : state.photoError} />
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-name">
            ¿Cómo te llamas?
          </Label>
          <Input
            aria-invalid={state.nameError ? true : undefined}
            autoCapitalize="words"
            autoComplete="name"
            className="h-12 rounded-xl bg-card px-4"
            id="intake-name"
            name="name"
            type="text"
          />
          {/* Name also carries whatever could not be blamed on a field -- an
              unresolvable room -- because it is the first text box on screen. */}
          <FieldError message={state.nameError ?? state.error} />
        </div>

        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-gender">
            ¿Con qué te identificas?
          </Label>
          {/* A native select: it submits, it opens as the phone's own wheel and
              it needs no JavaScript at all. */}
          <select
            aria-invalid={state.genderError ? true : undefined}
            className="h-12 w-full rounded-xl border border-input bg-card px-4 text-sm text-ink"
            defaultValue=""
            id="intake-gender"
            name="gender"
          >
            <option disabled value="">
              Elige una opción
            </option>
            <option value="F">Mujer</option>
            <option value="M">Hombre</option>
            <option value="NB">No binario</option>
          </select>
          <FieldError message={state.genderError} />
        </div>

        <div className="space-y-2">
          <Label className="text-ink" htmlFor="intake-birthdate">
            ¿Cuándo naciste?
          </Label>
          <Input
            aria-invalid={state.birthdateError ? true : undefined}
            className="h-12 rounded-xl bg-card px-4"
            id="intake-birthdate"
            name="birthdate"
            type="date"
          />
          <FieldError message={state.birthdateError} />
        </div>
      </div>

      {/* Common Ground (PILLARS.md §2). It came back to this screen when the
          declared round went away (D20): without it the engine's commonGround
          and structural terms have no input at all, and a term with no input
          is a constant that ranks nobody above anybody. */}
      <TagPicker defaultValue={[]} />

      <div className="space-y-2">
        {/* A NATIVE checkbox, not the shadcn one: Radix renders a button and
            submits nothing without JavaScript, and this is the one field the
            whole submit hangs on. No `required` either -- the browser's own
            bubble would replace the server's sentence, and the action is a
            public endpoint that has to refuse on its own anyway. */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
          <input
            aria-invalid={state.dataError ? true : undefined}
            className="mt-0.5 size-5 shrink-0 accent-primary"
            id="intake-datos"
            name="dataConsent"
            type="checkbox"
          />
          <Label
            className="text-ink-soft text-xs leading-snug font-normal"
            htmlFor="intake-datos"
          >
            {DATA_TREATMENT}
          </Label>
        </div>
        <FieldError message={state.dataError} />
      </div>

      <Button
        className="mt-auto h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
        disabled={pending || encoding || tooLarge}
        type="submit"
      >
        Empezar
      </Button>
    </form>
  );
}

/**
 * One field's error line.
 *
 * Always in the DOM, never conditionally mounted: `aria-live` announces changes
 * to a region that was already there, so a region inserted along with its text
 * is the classic way to ship an error a screen reader never hears. The reserved
 * height also keeps the form from jumping under the thumb on a phone.
 */
function FieldError({ message }: { message?: string }) {
  return (
    <p
      aria-live="polite"
      className="min-h-5 text-sm font-medium text-destructive"
    >
      {message ?? ""}
    </p>
  );
}

/**
 * Re-encode to a JPEG whose longest side is <= 512 px.
 *
 * Returns null rather than throwing when the browser cannot do it: the caller
 * then submits the original file, and the server decides. A photo field that
 * fails closed because a canvas was unavailable would cost more completions
 * than a large upload does.
 */
async function downscale(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return null;

    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}
