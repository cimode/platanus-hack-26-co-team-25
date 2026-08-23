"use client";

import { UserRound } from "lucide-react";
import { useRef } from "react";
import { FACE_GUIDE } from "@/lib/domain/participant/photo-frame";
import { cn } from "@/lib/utils";

/** The one sentence that teaches the framing, once a photo exists to frame. */
const HINT = "Centra tu cara dentro del óvalo, de frente y con buena luz";

/** Said out loud by the guide overlay, and by nothing else on the screen. */
const GUIDE_LABEL = "Guía para centrar la cara";

/**
 * The square that says "a photo goes here" and then shows the one that was
 * chosen, under an oval face guide (issue #47).
 *
 * The real control is still the plain `<input type="file" capture="user">`:
 * it is only visually hidden, so it keeps its label, its tab stop and its
 * no-JavaScript submit. The square is a `<label>` for it, which is why tapping
 * anywhere on the frame opens the camera without a line of script.
 *
 * The guide is advice, not a crop. Nothing here resizes or cuts the image --
 * the geometry lives in `FACE_GUIDE` so the sprite and offspring croppers can
 * cut to the same oval later.
 */
export function PhotoField({
  invalid,
  onChange,
  preview,
}: {
  invalid: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      {/* The frame IS the label for the file input below, which is why tapping
          anywhere on it opens the camera without a line of script. */}
      <label
        className={cn(
          "relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-muted text-center",
          invalid ? "border-2 border-destructive" : "border border-border"
        )}
        htmlFor="intake-photo"
      >
        {preview ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: a blob: URL that exists only in this tab, which next/image cannot optimise and must not try to */}
            <img
              alt=""
              className="absolute inset-0 size-full object-cover"
              src={preview}
            />
            <FaceGuide />
            <span className="sr-only">Tu foto — obligatoria</span>
          </>
        ) : (
          <>
            <UserRound
              aria-hidden="true"
              className="size-24 text-ink-faint"
              strokeWidth={1.25}
            />
            <span className="font-medium text-ink text-sm">
              Tu foto — obligatoria
            </span>
            <span className="text-ink-muted text-xs">
              Tócala para tomarla ahora
            </span>
          </>
        )}
      </label>

      <input
        accept="image/*"
        capture="user"
        className="sr-only"
        id="intake-photo"
        name="photo"
        onChange={onChange}
        ref={input}
        type="file"
      />

      {preview ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-muted text-xs">{HINT}</p>
          <button
            className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 font-medium text-ink text-xs"
            onClick={() => input.current?.click()}
            type="button"
          >
            Cambiar foto
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The oval, and everything outside it dimmed.
 *
 * A `viewBox` of 0..100 makes the SVG units percentages of the square, so
 * `FACE_GUIDE`'s fractions drop straight in and the drawing is resolution-free.
 * `white`/`black` inside the mask are luminance, not colour: they say "keep"
 * and "punch out", and no token could stand in for them.
 */
function FaceGuide() {
  const cx = FACE_GUIDE.centerX * 100;
  const cy = FACE_GUIDE.centerY * 100;
  const rx = FACE_GUIDE.radiusX * 100;
  const ry = FACE_GUIDE.radiusY * 100;

  return (
    <svg
      aria-label={GUIDE_LABEL}
      className="absolute inset-0 size-full"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 100"
    >
      <title>{GUIDE_LABEL}</title>
      <mask id="intake-face-guide">
        <rect fill="white" height="100" width="100" x="0" y="0" />
        <ellipse cx={cx} cy={cy} fill="black" rx={rx} ry={ry} />
      </mask>
      <rect
        className="fill-dark/45"
        height="100"
        mask="url(#intake-face-guide)"
        width="100"
        x="0"
        y="0"
      />
      <ellipse
        className="fill-none stroke-card/80"
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        strokeDasharray="4 3"
        strokeWidth={1}
      />
    </svg>
  );
}
