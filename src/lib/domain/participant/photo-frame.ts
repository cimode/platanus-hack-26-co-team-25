/**
 * Where the face is expected to sit inside a registration photo.
 *
 * The intake screen draws this oval over the square preview so the person
 * frames their own face; the sprite and offspring croppers will read the same
 * numbers later, so a photo taken under the guide and a crop taken from it
 * agree by construction. Pure data on purpose -- no imports, no I/O, no
 * rendering opinion beyond the geometry.
 *
 * Every value is a fraction of the square's side (0 = left/top, 1 =
 * right/bottom), so it survives any pixel size. The centre sits slightly above
 * the middle because a head framed dead-centre leaves the chin cropped and the
 * forehead swimming.
 */
export const FACE_GUIDE = {
  /** Horizontal centre of the oval. */
  centerX: 0.5,
  /** Vertical centre of the oval, above the middle of the square. */
  centerY: 0.44,
  /** Half-width: the oval spans ~60 % of the square. */
  radiusX: 0.3,
  /** Half-height: taller than it is wide, as a head is. */
  radiusY: 0.38,
} as const;

export type FaceGuide = typeof FACE_GUIDE;
