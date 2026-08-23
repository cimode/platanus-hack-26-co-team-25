import {
  canvasTransform,
  type FaceSheet,
  type FaceTransforms,
  photoOval,
} from "@/lib/domain/faces/faces";

/**
 * Drawing a participant's photo into the avatar's blank face.
 *
 * The offline pass (`pnpm faces:pack`) already decided the hard part: which
 * pixels of each frame are the face plate, and the affine that lands the
 * photo's oval on it. All that is left here is to execute it, which is two
 * canvas draws per frame:
 *
 *   1. the photo, warped by that frame's affine, into a scratch the size of
 *      one frame;
 *   2. the mask over it with `destination-in`, which keeps the photo only
 *      where the plate was -- so hair, hands and tears drawn over the face in
 *      the artwork stay on top of it.
 *
 * There is deliberately no `getImageData` anywhere: the mask ships with its
 * decision in the ALPHA channel, so the compositing operator does the work on
 * the GPU. A whole avatar -- the plate and thirteen animations, ~600 frames --
 * lands in well under a tenth of a second.
 *
 * The output is an encoded blob rather than a canvas because a canvas is many
 * times the memory for the same picture, and a room draws twenty of these at
 * once.
 */

/** Side of the square the photo is cropped into before it is warped. */
const PHOTO_SIZE = 320;

/** How many composited clips to hold before revoking the oldest. */
const CACHE_LIMIT = 64;

const photos = new Map<string, Promise<HTMLCanvasElement>>();
const clips = new Map<string, Promise<string | null>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The photo lives in object storage on another origin. Without this the
    // canvas is tainted and `toBlob` throws, so the bucket has to answer with
    // CORS headers; when it does not, `compositeClip` resolves null and the
    // screen keeps the plain sprite rather than breaking.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${src}`));
    image.src = src;
  });
}

/**
 * The photo, squared and cut to the intake oval, ready to be warped.
 *
 * Cached per URL because every clip of a participant warps the same crop:
 * doing it once is the difference between one decode and fourteen.
 */
export function croppedPhoto(photoUrl: string): Promise<HTMLCanvasElement> {
  const cached = photos.get(photoUrl);
  if (cached) return cached;

  const built = loadImage(photoUrl).then((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context for the photo crop");
    const oval = photoOval(PHOTO_SIZE);
    context.beginPath();
    context.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2);
    context.clip();
    // A photo that is not square is cropped from its centre, the same rule the
    // intake capture already applied to what the person saw in the frame.
    const side = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE
    );
    return canvas;
  });

  photos.set(photoUrl, built);
  return built;
}

export interface CompositeRequest {
  /** The original strip (or plate) to draw the face into. */
  readonly sheetSrc: string;
  /** Where the mask and the affines live, from `faceSheet()`. */
  readonly face: FaceSheet;
  readonly photoUrl: string;
  /** Key under which the result is cached and, if evicted, revoked. */
  readonly cacheKey: string;
}

/**
 * The clip with the face on it, as an object URL, or null when it could not be
 * made. Null is not an error the caller has to handle loudly -- it means "draw
 * what you would have drawn anyway".
 */
export function compositeClip(
  request: CompositeRequest
): Promise<string | null> {
  const cached = clips.get(request.cacheKey);
  if (cached) return cached;

  const built = build(request).catch(() => null);
  clips.set(request.cacheKey, built);
  evict();
  return built;
}

async function build({
  sheetSrc,
  face,
  photoUrl,
}: CompositeRequest): Promise<string | null> {
  // Nothing to paint: a clip where the face never shows (walking away from
  // camera) is the original sheet, and saying so costs no fetch at all.
  if (face.painted === 0) return null;

  const [sheet, mask, photo, transforms] = await Promise.all([
    loadImage(sheetSrc),
    loadImage(face.mask),
    croppedPhoto(photoUrl),
    fetch(face.transforms).then((r) => r.json() as Promise<FaceTransforms>),
  ]);

  const { w, h, n } = transforms;
  const out = document.createElement("canvas");
  out.width = w * n;
  out.height = h;
  const target = out.getContext("2d");
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const frame = scratch.getContext("2d");
  if (!(target && frame)) return null;

  target.drawImage(sheet, 0, 0);

  for (let i = 0; i < n; i++) {
    const affine = transforms.f[i];
    if (!affine) continue;
    frame.setTransform(1, 0, 0, 1, 0, 0);
    frame.globalCompositeOperation = "source-over";
    frame.clearRect(0, 0, w, h);
    frame.setTransform(...canvasTransform(affine, photo.width));
    frame.drawImage(photo, 0, 0);
    // Keep the photo only where the plate was.
    frame.setTransform(1, 0, 0, 1, 0, 0);
    frame.globalCompositeOperation = "destination-in";
    frame.drawImage(mask, i * w, 0, w, h, 0, 0, w, h);
    target.drawImage(scratch, i * w, 0);
  }

  // PNG, not WebP: the artwork is pixel art with hard edges, and a lossy
  // encoder rings around every one of them -- it shifts colours across the
  // whole sprite, not just the face, which is both visible at 4x and a lie
  // about what this function touched. The blob never crosses the network, so
  // the only cost of lossless is memory, and it is still a fraction of the
  // canvas it replaces.
  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, "image/png")
  );
  return blob ? URL.createObjectURL(blob) : null;
}

/** Oldest first, so what a screen is showing now outlives what it left behind. */
function evict(): void {
  while (clips.size > CACHE_LIMIT) {
    const oldest = clips.keys().next();
    if (oldest.done) return;
    const dropped = clips.get(oldest.value);
    clips.delete(oldest.value);
    dropped?.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }
}

/** Drop everything. Only tests need this; a page keeps its cache for its life. */
export function resetFaceCache(): void {
  for (const pending of clips.values())
    pending.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  clips.clear();
  photos.clear();
}
