"use client";

import { UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FACE_GUIDE } from "@/lib/domain/participant/photo-frame";
import { cn } from "@/lib/utils";

/** The one sentence that teaches the framing, once a photo exists to frame. */
const HINT = "Centra tu cara dentro del óvalo, de frente y con buena luz";

/** Said out loud by the guide overlay, and by nothing else on the screen. */
const GUIDE_LABEL = "Guía para centrar la cara";

/** The live camera, for a screen reader and for the test that looks for it. */
const CAMERA_LABEL = "Vista previa de la cámara";

/** Side of the square a capture is written at; the form's re-encode ceiling. */
const CAPTURE_EDGE = 512;
const JPEG_QUALITY = 0.82;

/**
 * The square that says "a photo goes here", then shows the camera INSIDE it,
 * under the oval face guide, then the photo that was taken (issue #47).
 *
 * The camera is emulated in the frame rather than handed to the phone's own
 * app: the guide is the point of the step, and a full-screen native camera
 * cannot show it -- the person frames blind and finds out afterwards. Here
 * the oval is on top of the live stream the whole time.
 *
 * The real control is still the plain `<input type="file" capture="user">`:
 * it is only visually hidden, so it keeps its label, its tab stop and its
 * no-JavaScript submit. The frame is its `<label>`, which is why a tap opens
 * the camera -- in-frame when `getUserMedia` is available, the phone's own
 * when it is not (no camera, permission refused, an old browser) -- and why a
 * capture is delivered by putting a `File` into that input and firing one
 * native `change` event: the form above never learns which camera it was.
 *
 * The guide is advice, not a crop. Nothing here cuts to the oval -- a capture
 * is the square the person saw, mirrored the way they saw it. The geometry
 * lives in `FACE_GUIDE` so the sprite and offspring croppers can cut to the
 * same oval later.
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
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  /** The stream has frames: only then is there something to capture. */
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [fallbackHint, setFallbackHint] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    setLive(false);
    setReady(false);
  }, []);

  // Leaving the screen mid-stream must not leave the camera light on.
  useEffect(() => stopCamera, [stopCamera]);

  // The <video> only exists while live, so the stream is attached after it
  // mounts rather than when it was obtained.
  useEffect(() => {
    const element = video.current;
    if (!live || !element || !stream.current) return;
    element.srcObject = stream.current;
    element.play().catch(() => {
      // Autoplay refused: the first tap on the frame plays it.
    });
  }, [live]);

  async function openCamera(): Promise<void> {
    if (!canUseCamera()) {
      input.current?.click();
      return;
    }
    setOpening(true);
    setFallbackHint(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1024 },
          height: { ideal: 1024 },
        },
      });
      setLive(true);
    } catch {
      // Refused, absent or not allowed on this origin: the phone's own camera
      // still takes the photo, only without the guide.
      setFallbackHint("No pude abrir la cámara aquí; usa la de tu teléfono.");
      input.current?.click();
    } finally {
      setOpening(false);
    }
  }

  async function takePhoto(): Promise<void> {
    const element = video.current;
    const control = input.current;
    if (!element || !control || !stream.current) return;
    const { videoWidth: width, videoHeight: height } = element;
    // Before the first frame there is nothing to draw; the shutter is disabled
    // until `loadeddata`, so this only guards a race.
    if (!width || !height) return;

    // The frame shows the stream cover-fitted in a square; the capture is that
    // same centred square, at the size the form would re-encode to anyway.
    const side = Math.min(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_EDGE;
    canvas.height = CAPTURE_EDGE;
    const context = canvas.getContext("2d");
    if (!context) {
      stopCamera();
      control.click();
      return;
    }
    // Mirrored, like the preview: what they saw is what they get.
    context.translate(CAPTURE_EDGE, 0);
    context.scale(-1, 1);
    context.drawImage(
      element,
      (width - side) / 2,
      (height - side) / 2,
      side,
      side,
      0,
      0,
      CAPTURE_EDGE,
      CAPTURE_EDGE
    );
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    stopCamera();
    if (!blob) {
      control.click();
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    control.files = transfer.files;
    // The form listens to the input, not to this component: one native
    // change event keeps its re-encode, its preview and its plain submit
    // exactly as they are.
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function onFrameClick(event: React.MouseEvent<HTMLLabelElement>): void {
    if (live) {
      // A tap on the live frame is the shutter -- once there is a frame.
      event.preventDefault();
      if (ready) void takePhoto();
      return;
    }
    if (canUseCamera()) {
      // Otherwise the label's default -- the native picker -- is the fallback.
      event.preventDefault();
      void openCamera();
    }
  }

  return (
    <div className="space-y-3">
      {/* The frame IS the label for the file input below: no JavaScript, and
          it still opens the phone's camera. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the label is not focusable; a keyboard reaches the file input itself (Tab, Enter), which htmlFor already serves */}
      <label
        className={cn(
          "relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-muted text-center",
          invalid ? "border-2 border-destructive" : "border border-border"
        )}
        htmlFor="intake-photo"
        onClick={onFrameClick}
      >
        {live ? (
          <>
            <video
              aria-label={CAMERA_LABEL}
              autoPlay
              className="-scale-x-100 absolute inset-0 size-full object-cover"
              muted
              onLoadedData={() => setReady(true)}
              playsInline
              ref={video}
            />
            <FaceGuide />
            <span className="sr-only">Tu foto — obligatoria</span>
          </>
        ) : preview ? (
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
              {opening ? "Abriendo la cámara…" : "Tócala para tomarla ahora"}
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
      {live ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-muted text-xs">{HINT}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="rounded-lg border border-border bg-card px-3 py-2 font-medium text-ink text-xs"
              onClick={stopCamera}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground text-sm shadow-toy disabled:opacity-60"
              disabled={!ready}
              onClick={() => void takePhoto()}
              type="button"
            >
              Tomar foto
            </button>
          </div>
        </div>
      ) : preview ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-muted text-xs">{HINT}</p>
          <button
            className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 font-medium text-ink text-xs"
            onClick={() => void openCamera()}
            type="button"
          >
            Cambiar foto
          </button>
        </div>
      ) : null}
      {fallbackHint ? (
        <p aria-live="polite" className="text-ink-muted text-xs">
          {fallbackHint}
        </p>
      ) : null}
    </div>
  );
}

/** An in-page camera needs the API and a secure origin; otherwise the phone's. */
function canUseCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
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
