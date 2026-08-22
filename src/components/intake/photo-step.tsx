"use client";

import { useActionState, useRef, useState } from "react";
import { type PhotoState, photoAction } from "@/app/intake/actions";
import { StepHeading } from "@/components/intake/step-heading";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const INITIAL: PhotoState = {};

/** Longest side, in CSS pixels, after the on-device re-encode. */
const MAX_EDGE = 512;

/** Enough for a face at 512 px; small enough to survive venue wifi. */
const JPEG_QUALITY = 0.82;

/**
 * The same ceiling `setPhoto` enforces, repeated here only to spare a phone the
 * upload. The server number is the real one; this one exists so a participant
 * whose browser could not re-encode learns it in a millisecond rather than
 * after pushing three megabytes over venue wifi.
 */
const MAX_BYTES = 1024 * 1024;

/** The server's own sentence, so the two paths read identically. */
const TOO_LARGE = "Photo is too large — try again";

/**
 * Step 2 -- photo.
 *
 * The re-encode happens on the phone: a modern camera produces 3-4 MB per
 * shot, the server ceiling is 1 MiB, and ~100 people are uploading over the
 * same wifi at the same time. Shrinking here turns a failed submit into a fast
 * one.
 *
 * It is a courtesy, never a control. The file input keeps the form's own
 * `action`, so with JavaScript off the original file is submitted and the
 * server ceiling in `setPhoto` refuses it exactly the same way -- which is why
 * `next.config.ts` raises Next's Server Action body limit above 1 MiB: below
 * it, the framework answers 413 with an error page and the refusal never gets
 * to be copy on step 2.
 */
export function PhotoStep({ roomSlug }: { roomSlug: string }) {
  const [state, formAction, pending] = useActionState(photoAction, INITIAL);
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
        // submit -- no fetch, no hand-built FormData, no lost progressive
        // enhancement. Assigning `.files` fires no change event, so this
        // cannot loop.
        const transfer = new DataTransfer();
        transfer.items.add(smaller);
        input.files = transfer.files;
      }
      const chosen = smaller ?? file;
      // `downscale` returns null when the browser cannot decode the file, and
      // then the original is what would be submitted. Judge what is actually in
      // the input, not what we hoped to put there.
      setTooLarge(chosen.size > MAX_BYTES);
      showPreview(chosen);
    } finally {
      setEncoding(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-8">
      <StepHeading step={2} title="A real photo, taken right now." />

      <input name="room" type="hidden" value={roomSlug} />

      <div className="space-y-3">
        <Label className="text-ink" htmlFor="intake-photo">
          Take or choose a photo
        </Label>
        <input
          accept="image/*"
          capture="user"
          className="w-full rounded-xl border border-input bg-card p-3 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium file:text-secondary-foreground"
          id="intake-photo"
          name="photo"
          onChange={handleChange}
          type="file"
        />
        <p
          aria-live="polite"
          className="min-h-5 text-sm font-medium text-destructive"
        >
          {(tooLarge ? TOO_LARGE : state.error) ?? ""}
        </p>
      </div>

      {preview ? (
        <div className="flex justify-center">
          {/* biome-ignore lint/performance/noImgElement: a blob: URL that exists only in this tab, which next/image cannot optimise and must not try to */}
          <img
            alt="You, just now"
            className="size-40 rounded-2xl border-2 border-border object-cover"
            src={preview}
          />
        </div>
      ) : null}

      <Button
        className="mt-auto h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
        disabled={pending || encoding || tooLarge}
        type="submit"
      >
        Continue
      </Button>
    </form>
  );
}

/**
 * Re-encode to a JPEG whose longest side is <= 512 px.
 *
 * Returns null rather than throwing when the browser cannot do it: the caller
 * then submits the original file, and the server decides. A photo step that
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
