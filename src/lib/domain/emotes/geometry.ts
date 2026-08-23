import { type EmoteSheet, emoteSeconds } from "./emotes";

/**
 * How a sheet is drawn in place of the idle plate -- pure CSS arithmetic, so
 * any screen gets the same answer whatever unit it sizes avatars in.
 *
 * A frame is taller than the body it holds (headroom for hops), so the frame
 * box is `plateHeight / bodyFraction` tall and sits lower than the plate by
 * the floor margin under the feet: the character's feet land on the line the
 * plate's feet stood on, and the swap in and out of an emote does not jump.
 */
export interface FrameBox {
  /** CSS height of the frame box, e.g. `calc(96px / 0.8)`. */
  readonly height: string;
  /** width / height of one frame. */
  readonly aspectRatio: number;
  /** CSS translateY that drops the box so the feet meet the plate's floor line. */
  readonly translateY: string;
  /** `background-size` that lays the whole strip under a one-frame-wide box. */
  readonly backgroundSize: string;
}

export function frameBox(sheet: EmoteSheet, plateHeight: string): FrameBox {
  return {
    height: `calc(${plateHeight} / ${sheet.bodyFraction})`,
    aspectRatio: sheet.frameWidth / sheet.frameHeight,
    translateY: `${((1 - sheet.feetFraction) * 100).toFixed(2)}%`,
    backgroundSize: `${sheet.frames * 100}% 100%`,
  };
}

export interface Playback {
  /** The inline `animation` value: the `emote` keyframe, one step per frame. */
  readonly animation: string;
  readonly seconds: number;
  readonly loop: boolean;
}

/**
 * The `emote` keyframe (globals.css) slides `background-position-x` from 0 to
 * frames/(frames-1) x 100%; stepping `frames` times lands on every frame once
 * and never shows a blank last step. Inline on purpose: the reduced-motion
 * guard in globals.css stops every `[style*="animation"]`.
 */
export function playback(
  sheet: EmoteSheet,
  options: { readonly loop?: boolean } = {}
): Playback {
  const loop = options.loop ?? sheet.loop === true;
  const seconds = emoteSeconds(sheet);
  return {
    animation: `emote ${seconds}s steps(${sheet.frames}) ${loop ? "infinite" : "1"} none`,
    seconds,
    loop,
  };
}

/**
 * When a one-shot play must be considered over even if `animationend` never
 * fires (prefers-reduced-motion removes the animation; a background tab can
 * throttle it). Loops never end on their own.
 */
export function fallbackMs(sheet: EmoteSheet, loop: boolean): number | null {
  return loop ? null : Math.round((emoteSeconds(sheet) + 0.5) * 1000);
}
