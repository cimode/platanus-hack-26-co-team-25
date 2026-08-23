import { type AvatarKey, avatarKey } from "../emotes/emotes";
import { FACE_GUIDE } from "../participant/photo-frame";
import { FACE_MANIFEST } from "./faces.manifest";

/**
 * Putting a participant's real photo on the avatar's blank face.
 *
 * Every avatar plate is drawn with an empty face: a flat beige oval that
 * survives into every frame of every emote sheet. Offline (`pnpm faces:pack`)
 * we find that oval frame by frame and write down two things -- a mask saying
 * which pixels it covers, and a 2x3 affine saying where the photo has to land
 * so the face sits in it, tilted and foreshortened the way the head is.
 *
 * Neither depends on the photo. They are a property of the ARTWORK, so the
 * same two files serve every participant wearing that avatar, and the only
 * thing that is per-person is the photo itself. That is what keeps a room of a
 * hundred people from costing a hundred sets of spritesheets: the composite is
 * a function of (shared art, one photo) evaluated when a frame is drawn, and
 * nothing about it is worth storing.
 *
 * This module is pure: the arithmetic, the lookups, and the shape of the two
 * files. Drawing lives in `src/components/faces/`.
 */

/** The idle plate is a still rather than a strip, but it wears the same face. */
export const FACE_PLATE = "plate";

/** What `faces.manifest.ts` records per clip: enough to decide without fetching. */
export interface FaceSheet {
  /** The plate mask, one alpha strip laid out exactly like the spritesheet. */
  readonly mask: string;
  /** The per-frame affines, fetched only when there is something to draw. */
  readonly transforms: string;
  readonly frames: number;
  /**
   * On how many frames the face is visible at all. Zero is a real answer and
   * the useful one: walking away from camera shows the back of a head for the
   * whole clip, so a screen that reads zero skips the fetch and the composite
   * and draws the original sheet untouched.
   */
  readonly painted: number;
  readonly bytes: number;
}

/**
 * A 2x3 affine `[a, b, c, d, e, f]` mapping the UNIT SQUARE of the squared
 * photo onto frame pixels:
 *
 *     qx = a*u + b*v + c
 *     qy = d*u + e*v + f      with u, v in [0, 1]
 *
 * The unit square rather than pixels is what lets one file serve a 512px
 * intake capture and a 4000px upload alike.
 */
export type FaceAffine = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

/** The body of `<clip>.json`. `f[i]` is null where the face is not visible. */
export interface FaceTransforms {
  readonly w: number;
  readonly h: number;
  readonly n: number;
  readonly fps: number;
  readonly guide: typeof FACE_GUIDE;
  readonly f: readonly (FaceAffine | null)[];
}

/** The clips this avatar has face data for, plate first. */
export function faceClips(spriteOrKey: string): readonly string[] {
  const key = avatarKey(spriteOrKey);
  return key ? Object.keys(FACE_MANIFEST[key] ?? {}) : [];
}

/**
 * The face data for one clip, or null when nobody packed it. Null is not an
 * error anywhere: the caller draws the plain sheet, which is exactly what the
 * screen showed before this feature existed.
 */
export function faceSheet(spriteOrKey: string, clip: string): FaceSheet | null {
  const key = avatarKey(spriteOrKey);
  if (!key) return null;
  return FACE_MANIFEST[key]?.[clip] ?? null;
}

/** Whether a clip is worth compositing at all -- see `FaceSheet.painted`. */
export function hasFace(spriteOrKey: string, clip: string): boolean {
  return (faceSheet(spriteOrKey, clip)?.painted ?? 0) > 0;
}

/** Total bytes a screen would fetch to give this avatar a face everywhere. */
export function faceBytes(spriteOrKey: string): number {
  const key = avatarKey(spriteOrKey);
  if (!key) return 0;
  return Object.values(FACE_MANIFEST[key] ?? {}).reduce(
    (sum, sheet) => sum + sheet.bytes,
    0
  );
}

/**
 * How much tighter than `FACE_GUIDE` the crop is taken. Baked into the packed
 * matrices, so changing it means re-running `pnpm faces:pack`.
 */
export const FACE_ZOOM = 1.15;

export interface Oval {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/**
 * The ellipse to cut out of a squared photo of side `size`.
 *
 * `FACE_GUIDE` is the same oval the intake screen draws over the camera, so a
 * photo taken under the guide and the crop taken from it agree by
 * construction. `zoom` above 1 cuts tighter than the guide, which is the knob
 * for a face that was framed small; it must be the SAME value the offline fit
 * used, because the matrices were solved for that oval.
 */
export function photoOval(size: number, zoom = FACE_ZOOM): Oval {
  return {
    cx: FACE_GUIDE.centerX * size,
    cy: FACE_GUIDE.centerY * size,
    rx: (FACE_GUIDE.radiusX * size) / zoom,
    ry: (FACE_GUIDE.radiusY * size) / zoom,
  };
}

/**
 * The affine as `CanvasRenderingContext2D.setTransform` wants it, for a photo
 * canvas of side `photoSize` drawn at the origin.
 *
 * Canvas takes `(m11, m12, m21, m22, dx, dy)` and computes
 * `x' = m11*x + m21*y + dx`, `y' = m12*x + m22*y + dy` -- so the column order
 * is transposed from how the affine reads on paper, and the photo's pixel
 * coordinates have to be divided back down into the unit square. Both are easy
 * to get subtly wrong and impossible to see at 67x133, so they live here with
 * a test rather than inline at the call site.
 */
export function canvasTransform(
  [a, b, c, d, e, f]: FaceAffine,
  photoSize: number
): readonly [number, number, number, number, number, number] {
  return [a / photoSize, d / photoSize, b / photoSize, e / photoSize, c, f];
}

/** Where frame `index` starts in a strip of `frameWidth`-wide frames. */
export function frameOffset(index: number, frameWidth: number): number {
  return index * frameWidth;
}

/** A cache key that changes when anything the composite depends on changes. */
export function faceCacheKey(
  avatar: AvatarKey,
  clip: string,
  photoUrl: string
): string {
  return `${avatar}|${clip}|${photoUrl}`;
}
