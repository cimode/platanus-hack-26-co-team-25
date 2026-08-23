"use client";

import { useEffect } from "react";
import { preload } from "react-dom";
import type { Playing } from "@/components/emotes/use-emote-player";
import {
  type AvatarKey,
  type EmoteSheet,
  emoteSheet,
  emoteSheets,
  PLATE_ASPECT,
  plateUrl,
} from "@/lib/domain/emotes/emotes";
import { fallbackMs, frameBox, playback } from "@/lib/domain/emotes/geometry";
import { cn } from "@/lib/utils";

export interface AvatarSpriteProps {
  readonly avatar: AvatarKey;
  /**
   * Height of the idle plate in any CSS length -- `96px`, `6rem`, or the
   * room's `12cqh`. The element's footprint is this box whatever plays in it,
   * so a reaction never reflows the screen around it.
   */
  readonly height: string;
  /** From `useEmotePlayer` / `useParticipantEmotes`. Null is idle. */
  readonly playing?: Playing | null;
  /** A one-shot finished (or was cut short under reduced motion). Loops never call it. */
  readonly onEnd?: () => void;
  /** Accessible name. Defaults to the avatar key. */
  readonly label?: string;
  /** Preload every sheet of this avatar on mount, so the first play has no blank frame. */
  readonly preload?: boolean;
  readonly className?: string;
}

/**
 * One digital avatar, on any screen.
 *
 * Idle is the plate. A reaction swaps in its spritesheet: the frame box is
 * one frame wide and the strip slides under it with `steps(n)`, so nothing on
 * screen is ever wider than a frame (a strip scaled up as one `<img>` exceeds
 * the GPU texture limit on Retina and silently vanishes). The animation is an
 * inline style on purpose: `globals.css` stops every `[style*="animation"]`
 * under prefers-reduced-motion, which covers this one without anyone
 * remembering to list it.
 */
export function AvatarSprite({
  avatar,
  height,
  playing = null,
  onEnd,
  label,
  preload: shouldPreload = true,
  className,
}: AvatarSpriteProps) {
  useEffect(() => {
    if (!shouldPreload) return;
    for (const sheet of emoteSheets(avatar))
      preload(sheet.src, { as: "image" });
  }, [avatar, shouldPreload]);

  const sheet = playing ? emoteSheet(avatar, playing.emote) : null;

  return (
    <span
      aria-label={label ?? avatar}
      className={cn("relative block", className)}
      data-avatar={avatar}
      role="img"
      style={{ height, aspectRatio: PLATE_ASPECT }}
    >
      {playing && sheet ? (
        <Frame
          key={playing.take}
          emote={playing.emote}
          loop={playing.loop}
          onEnd={onEnd}
          plateHeight={height}
          sheet={sheet}
        />
      ) : (
        <span
          className="sprite absolute inset-0 bg-contain bg-bottom bg-no-repeat"
          data-anim="idle"
          style={{ backgroundImage: `url(${plateUrl(avatar)})` }}
        />
      )}
    </span>
  );
}

function Frame({
  sheet,
  emote,
  loop,
  plateHeight,
  onEnd,
}: {
  sheet: EmoteSheet;
  emote: string;
  loop: boolean | undefined;
  plateHeight: string;
  onEnd?: () => void;
}) {
  const box = frameBox(sheet, plateHeight);
  const play = playback(sheet, { loop });
  // `animationend` is the normal exit for a one-shot. Under
  // prefers-reduced-motion the guard removes the animation and that event
  // never fires, so a timer ends the play when the clip would have ended.
  useEffect(() => {
    const ms = fallbackMs(sheet, play.loop);
    if (ms === null || !onEnd) return;
    const timer = setTimeout(onEnd, ms);
    return () => clearTimeout(timer);
  }, [sheet, play.loop, onEnd]);

  return (
    <span
      className="sprite absolute bottom-0 left-1/2 block bg-no-repeat"
      data-anim={emote}
      data-loop={play.loop ? "true" : undefined}
      onAnimationEnd={play.loop ? undefined : onEnd}
      style={{
        height: box.height,
        aspectRatio: box.aspectRatio,
        transform: `translate(-50%, ${box.translateY})`,
        backgroundImage: `url(${sheet.src})`,
        backgroundSize: box.backgroundSize,
        // `--frames` feeds the `emote` keyframe's end position.
        ["--frames" as string]: sheet.frames,
        animation: play.animation,
      }}
    />
  );
}
