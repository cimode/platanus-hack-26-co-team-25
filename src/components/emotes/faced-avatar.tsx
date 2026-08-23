"use client";

import type { AvatarKey } from "@/lib/domain/emotes/emotes";
import { PLATE_ASPECT } from "@/lib/domain/emotes/emotes";
import { FACE_GUIDE } from "@/lib/domain/participant/photo-frame";
import { cn } from "@/lib/utils";
import { AvatarSprite, type AvatarSpriteProps } from "./avatar-sprite";

/**
 * An avatar wearing a participant's registration face.
 *
 * The emote sheets are faceless pixel bodies (the plate has a blank oval where
 * a real photo goes — `docs/design`), so the face is an overlay, not part of
 * the sheet. This composes `AvatarSprite` with that overlay in one place, so
 * any screen gets "the pixel body doing X with this person's face on it"
 * without re-deriving where the face sits.
 *
 * The crop reads `FACE_GUIDE` — the same oval the intake screen framed the
 * photo under — so a face taken under the guide lands centred here by
 * construction rather than by eye.
 *
 * `showFace` exists because a directional walk (`walk-left` / `walk-right`) is a
 * ¾-back view: the head is turned away and a front photo does not belong on it.
 * Callers hide the face while walking and show it when the avatar turns front
 * (the `love` reveal, the idle plate).
 */
export interface FacedAvatarProps extends AvatarSpriteProps {
  /** The registration photo. Null renders the bare pixel avatar. */
  readonly faceUrl?: string | null;
  /** False while the body is in profile, so the front face is not shown. */
  readonly showFace?: boolean;
  /** Face centre as a fraction of the sprite box height. Front-facing default. */
  readonly faceTop?: string;
  /** Face diameter as a fraction of the sprite height. */
  readonly faceScale?: number;
}

export function FacedAvatar({
  faceUrl,
  showFace = true,
  faceTop = "33%",
  faceScale = 0.26,
  height,
  className,
  avatar,
  label,
  ...sprite
}: FacedAvatarProps & { avatar: AvatarKey }) {
  return (
    <span
      className={cn("relative inline-block", className)}
      style={{ height, aspectRatio: PLATE_ASPECT }}
    >
      <AvatarSprite avatar={avatar} height={height} label={label} {...sprite} />
      {faceUrl ? (
        // biome-ignore lint/performance/noImgElement: a registration photo is a data:/blob: or bucket URL next/image cannot optimise here, and it is a fixed-size overlay
        <img
          alt=""
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 rounded-full border-2 border-background/90 object-cover shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-opacity duration-300",
            showFace ? "opacity-100" : "opacity-0"
          )}
          src={faceUrl}
          style={{
            top: faceTop,
            width: `calc(${height} * ${faceScale})`,
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            objectPosition: `${FACE_GUIDE.centerX * 100}% ${FACE_GUIDE.centerY * 100}%`,
          }}
        />
      ) : null}
    </span>
  );
}
