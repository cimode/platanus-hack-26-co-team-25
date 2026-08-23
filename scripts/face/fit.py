#!/usr/bin/env python3
"""
Stick a photo onto the blank face plate of an emote spritesheet, frame by frame.

The avatars ship with a flat beige face plate (rgb 209,180,146). Every frame
of every emote still carries that plate, re-quantised a few units by the pack
step. So, per frame:

  1. segment the plate  - pixels within `tol` of the plate tone, in the head
                          zone, grouped into connected components;
  2. fit an ellipse     - second-order moments of the plate pixels give the
                          centre, the two semi-axes and the tilt;
  3. build a 2x3 affine - photo oval (FACE_GUIDE) -> that ellipse;
  4. composite          - warp the photo through the matrix and paint it ONLY
                          where the plate was, so hair, hands and tears drawn
                          over the face in the source stay on top.

Outputs, per (avatar, emote, photo): the composited strip (lossless WebP like
the originals), a scaled GIF preview, a debug strip with mask + ellipse, and
the matrices as JSON so a runtime can replay the same placement in a canvas.

    python3 scripts/face/fit.py --avatar avatar1 --emote defeat \
        --photo public/match/parent-a.jpg --out /tmp/facefit

Only needs numpy + Pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import asdict, dataclass

import numpy as np
from PIL import Image, ImageDraw

PLATE = np.array([209, 180, 146], dtype=int)

# src/lib/domain/participant/photo-frame.ts -- same oval the intake screen draws.
FACE_GUIDE = {"centerX": 0.5, "centerY": 0.44, "radiusX": 0.3, "radiusY": 0.38}


# ----------------------------------------------------------------------------
# sheet -> frames
# ----------------------------------------------------------------------------
PLATE_EMOTE = "plate"


def clip_spec(root: str, avatar: str, emote: str) -> dict:
    """Where the frames of one clip live, and how to cut them.

    The idle plate is a single still rather than a strip, but it carries the
    same blank face and wants the same treatment, so it enters here as a clip
    of one frame. Everything downstream -- the tracker, the fit, the filter --
    is written in frames and does not need to know.
    """
    if emote == PLATE_EMOTE:
        path = os.path.join(root, "public/sprites", f"{avatar}.png")
        with Image.open(path) as im:
            width, height = im.size
        return {"src": path, "frameWidth": width, "frameHeight": height, "fps": 1}
    sheet = load_manifest(root)[avatar][emote]
    return {
        "src": os.path.join(root, "public", sheet["src"].lstrip("/")),
        "frameWidth": sheet["frameWidth"],
        "frameHeight": sheet["frameHeight"],
        "fps": sheet["fps"],
    }


def load_manifest(root: str) -> dict:
    with open(os.path.join(root, "public/sprites/emotes/manifest.json")) as f:
        return json.load(f)


def frames_of(path: str, fw: int) -> list[np.ndarray]:
    im = Image.open(path).convert("RGBA")
    n = im.width // fw
    return [np.array(im.crop((i * fw, 0, (i + 1) * fw, im.height))) for i in range(n)]


# ----------------------------------------------------------------------------
# 1. plate segmentation
# ----------------------------------------------------------------------------
def components(mask: np.ndarray) -> tuple[np.ndarray, list[int]]:
    """4-connected labelling (frames are 67x133, a Python BFS is plenty)."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    sizes: list[int] = []
    cur = 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or labels[y, x]:
                continue
            cur += 1
            labels[y, x] = cur
            stack = [(y, x)]
            n = 0
            while stack:
                cy, cx = stack.pop()
                n += 1
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = cur
                        stack.append((ny, nx))
            sizes.append(n)
    return labels, sizes


# A real face plate runs 100-400 px frontal and 34-90 px in profile; the
# plate-toned specks on a sweater or a bag strap run under 20. A clip whose
# best frame never clears this has no face in it at all (walk-back).
MIN_FACE_PX = 25
#: how far a fragment may sit from the piece it joins (hands split the plate)
FRAGMENT_GAP = 4
#: how far the face may travel between two frames before it is a different thing
MAX_JUMP = 16.0
#: a face plate survives an erosion; the knit highlights on a sweater do not
MIN_THICKNESS = 0.25


def plate_pixels(frame: np.ndarray, tol: int, head_zone: float) -> np.ndarray:
    rgb = frame[:, :, :3].astype(int)
    close = (np.abs(rgb - PLATE).max(axis=2) <= tol) & (frame[:, :, 3] > 128)
    close[int(close.shape[0] * head_zone):, :] = False
    return close


def erode(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:] &= mask[:-1]; out[:-1] &= mask[1:]; out[:, 1:] &= mask[:, :-1]; out[:, :-1] &= mask[:, 1:]
    return out


def thickness(mask: np.ndarray) -> float:
    """What fraction of a blob survives being eroded by one pixel.

    The plate tone appears twice in these sprites: as the face, and as the
    highlight threads knitted into a sweater. Size cannot tell them apart -- a
    squiggle of thread runs to 37 px, a face in profile to 34. Thickness can:
    a face is 4-8 px across and keeps a third to four fifths of itself, a
    1-2 px thread keeps nothing.
    """
    n = int(mask.sum())
    return int(erode(mask).sum()) / n if n else 0.0


def dilate(mask: np.ndarray, n: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(n):
        d = out.copy()
        d[1:] |= out[:-1]; d[:-1] |= out[1:]; d[:, 1:] |= out[:, :-1]; d[:, :-1] |= out[:, 1:]
        out = d
    return out


def bbox(mask: np.ndarray) -> tuple[int, int]:
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return (0, 0)
    return (int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))


def assemble(labels: np.ndarray, sizes: list[int], pick: int, min_area: int,
             limit: tuple[float, float]) -> np.ndarray:
    """The picked component plus the fragments a hand or a strand cut off it.

    Two guards keep this from swallowing the sweater. Proximity is measured
    pixel-to-pixel, not centroid-to-centroid, so only pieces that all but touch
    the face can join it. And a merge that would make the face bigger than a
    face has ever been in this clip is refused: the highlight threads knitted
    into a sleeve start a pixel from the jaw and run twenty pixels down the
    arm, and merging one stretches the fitted ellipse to twice the head.
    """
    keep = labels == pick
    near = dilate(keep, FRAGMENT_GAP)
    order = sorted((s, i) for i, s in enumerate(sizes, start=1) if i != pick and s >= min_area)
    for _, i in reversed(order):
        piece = labels == i
        if not (near & piece).any():
            continue
        w, h = bbox(keep | piece)
        if w <= limit[0] and h <= limit[1]:
            keep |= piece
    return trim_neck(keep)


def track(frames: list[np.ndarray], tol: int, head_zone: float, min_area: int) -> list[np.ndarray]:
    """Segment the plate across the whole clip, not frame by frame.

    Frame-local rules cannot tell a narrow profile crescent (a real face) from
    a highlight on a sweater (not one): both are small and neither fills its
    bounding box. Across the clip they are easy to separate -- the face is the
    biggest plate-toned thing anywhere in the clip, and from one frame to the
    next it stays roughly where it was. So: find the best frame, then walk
    outwards from it, each frame picking the component nearest to where the
    face was last seen. A frame with nothing near enough is one where the face
    is hidden, and stays empty -- the mask is what gets painted, so guessing
    here would put the photo on a shoulder.
    """
    per_frame = []
    for frame in frames:
        labels, sizes = components(plate_pixels(frame, tol, head_zone))
        cands = []
        for i, size in enumerate(sizes, start=1):
            if size < min_area:
                continue
            ys, xs = np.nonzero(labels == i)
            cands.append((i, size, float(xs.mean()), float(ys.mean())))
        per_frame.append((labels, sizes, cands))

    solid = [(f, c) for f, (labels, _, cands) in enumerate(per_frame) for c in cands
             if thickness(labels == c[0]) >= MIN_THICKNESS]
    best = max(solid, key=lambda fc: fc[1][1], default=None)
    if best is None or best[1][1] < MIN_FACE_PX:
        return [np.zeros(f.shape[:2], bool) for f in frames]  # no face in this clip
    ref_frame, (ref_label, ref_size, ref_x, ref_y) = best
    floor = max(min_area, ref_size * 0.05)
    ref_w, ref_h = bbox(per_frame[ref_frame][0] == ref_label)
    limit = (ref_w * 1.35, ref_h * 1.35)

    masks: list[np.ndarray] = [np.zeros(f.shape[:2], bool) for f in frames]
    order = list(range(ref_frame, len(frames))) + list(range(ref_frame - 1, -1, -1))
    anchor = (ref_x, ref_y)
    for k, f in enumerate(order):
        if f == ref_frame - 1:
            anchor = (ref_x, ref_y)  # second sweep restarts from the reference
        labels, sizes, cands = per_frame[f]
        near = [(c, np.hypot(c[2] - anchor[0], c[3] - anchor[1])) for c in cands if c[1] >= floor]
        near = [(c, d) for c, d in near if d <= MAX_JUMP]
        if not near:
            continue  # the face is hidden this frame: paint nothing
        pick, _ = max(near, key=lambda cd: cd[0][1] - 6.0 * cd[1])
        masks[f] = assemble(labels, sizes, pick[0], min_area, limit)
        if masks[f].any():
            ys, xs = np.nonzero(masks[f])
            anchor = (float(xs.mean()), float(ys.mean()))
    return masks


def trim_neck(mask: np.ndarray, ratio: float = 0.45) -> np.ndarray:
    """The neck is painted in the plate tone too: drop the narrow rows hanging
    under the widest part of the face.

    Only rows below the LAST wide row go. Cutting at the first narrow row
    instead would take the chin with it whenever something crosses the face --
    two fists over the eyes leave a 3 px bridge, and everything under it is
    still face.
    """
    widths = mask.sum(axis=1)
    if not widths.any():
        return mask
    widest = int(np.argmax(widths))
    limit = widths[widest] * ratio
    last_wide = widest
    for y in range(widest, mask.shape[0]):
        if widths[y] >= limit:
            last_wide = y
    out = mask.copy()
    out[last_wide + 1:] = False
    return out


# ----------------------------------------------------------------------------
# 2. ellipse fit
# ----------------------------------------------------------------------------
@dataclass
class Fit:
    cx: float
    cy: float
    sx: float  # semi-axis across the face
    sy: float  # semi-axis along the face (chin -> forehead)
    theta: float  # tilt of the face's "up" axis, radians, clockwise on screen
    area: int
    mode: str = "moments"  # moments | hold | filled


def fit_ellipse(mask: np.ndarray) -> Fit | None:
    ys, xs = np.nonzero(mask)
    n = len(xs)
    if n < 6:
        return None
    cx, cy = xs.mean() + 0.5, ys.mean() + 0.5
    cov = np.cov(np.stack([xs, ys]).astype(float)) + np.eye(2) / 12.0
    evals, evecs = np.linalg.eigh(cov)
    v0, v1 = evecs[:, 0], evecs[:, 1]
    if abs(v0[1]) >= abs(v1[1]):
        up, var_up, var_side = v0, evals[0], evals[1]
    else:
        up, var_up, var_side = v1, evals[1], evals[0]
    if up[1] > 0:
        up = -up
    theta = math.atan2(up[0], -up[1])
    # a uniformly filled ellipse has variance a^2/4 along a semi-axis a
    sx, sy = 2 * math.sqrt(max(var_side, 1e-6)), 2 * math.sqrt(max(var_up, 1e-6))
    # grow until the ellipse covers (nearly) every plate pixel: no bald spots
    dx, dy = xs + 0.5 - cx, ys + 0.5 - cy
    c, s = math.cos(theta), math.sin(theta)
    u = (dx * c + dy * s) / sx  # along side axis... see note below
    v = (-dx * s + dy * c) / sy
    r = np.sqrt(u * u + v * v)
    grow = float(np.clip(np.percentile(r, 97), 1.0, 1.6))
    # A near-circular blob carries no orientation, so neither its tilt nor
    # which axis is "across" means anything: the eigen-decomposition picks one
    # at random and swaps it between frames, popping the photo 30% wider for a
    # frame. Fade both toward the round answer as the blob rounds off, and a
    # swap stops being visible because there is nothing left to swap.
    ratio = max(sx, sy) / max(min(sx, sy), 1e-6)
    certainty = float(np.clip((ratio - 1.25) / 0.35, 0.0, 1.0))
    round_ = math.sqrt(sx * sy)
    sx = sx * certainty + round_ * (1 - certainty)
    sy = sy * certainty + round_ * (1 - certainty)
    theta *= certainty
    return Fit(cx, cy, sx * grow, sy * grow, theta, int(n))


def hold_fit(mask: np.ndarray, ref: Fit, prev: Fit) -> Fit:
    """Keep the reference size and tilt; move the centre as little as possible
    from `prev` so the ellipse still covers every visible plate pixel."""
    ys, xs = np.nonzero(mask)
    c, s = math.cos(ref.theta), math.sin(ref.theta)
    px, py = xs + 0.5, ys + 0.5
    u, v = (px * c + py * s) / ref.sx, (-px * s + py * c) / ref.sy
    cu, cv = (prev.cx * c + prev.cy * s) / ref.sx, (-prev.cx * s + prev.cy * c) / ref.sy
    d = np.hypot(u - cu, v - cv)
    for _ in range(300):
        k = int(np.argmax(d))
        if d[k] <= 1.0:
            break
        step = (d[k] - 1.0) * 0.6
        cu += (u[k] - cu) / d[k] * step
        cv += (v[k] - cv) / d[k] * step
        d = np.hypot(u - cu, v - cv)
    grow = max(1.0, float(d.max()))
    X, Y = cu * ref.sx, cv * ref.sy
    return Fit(X * c - Y * s, X * s + Y * c, ref.sx * grow, ref.sy * grow, ref.theta, int(len(xs)), "hold")


def ellipse_mask(fit: Fit, shape: tuple[int, int]) -> np.ndarray:
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    dx, dy = xx + 0.5 - fit.cx, yy + 0.5 - fit.cy
    c, s = math.cos(fit.theta), math.sin(fit.theta)
    u, v = (dx * c + dy * s) / fit.sx, (-dx * s + dy * c) / fit.sy
    return u * u + v * v <= 1.0


def hairlike(frame: np.ndarray) -> np.ndarray:
    rgb = frame[:, :, :3].astype(int)
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    return (frame[:, :, 3] > 128) & (lum < 120)


def shifted(mask: np.ndarray, dx: float, dy: float) -> np.ndarray:
    out = np.zeros_like(mask)
    ix, iy = int(round(dx)), int(round(dy))
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    xs, ys = xs + ix, ys + iy
    ok = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    out[ys[ok], xs[ok]] = True
    return out


def choose(frames: list[np.ndarray], masks: list[np.ndarray], raw: list[Fit | None],
           visible: float = 0.85, hair: float = 0.6) -> list[Fit | None]:
    """Per frame: the plate is (nearly) whole -> moments. Otherwise ask what
    covers the missing part of a held ellipse: hair means the head turned and
    the face really is foreshortened (moments); hands, tears, anything else is
    in front of a face that did not move (hold)."""
    if not any(raw):
        return [None] * len(raw)
    ref_i = max((i for i, f in enumerate(raw) if f), key=lambda i: raw[i].area)
    ref, ref_mask = raw[ref_i], masks[ref_i]
    # pass 1: for every frame with part of the plate missing, what covers it?
    fracs: list[float | None] = []
    prev = ref
    for frame, mask, fit in zip(frames, masks, raw):
        if fit is None or fit.area >= ref.area * visible:
            fracs.append(None)
            prev = fit or prev
            continue
        held = hold_fit(mask, ref, prev)
        expected = shifted(ref_mask, held.cx - ref.cx, held.cy - ref.cy)
        missing = expected & ~mask & (frame[:, :, 3] > 128)
        fracs.append(float(hairlike(frame)[missing].mean()) if missing.any() else 0.0)
        prev = held
    # pass 2: a single frame never flips the verdict on its own
    def vote(i: int) -> float:
        near = [fracs[j] for j in range(max(0, i - 2), min(len(fracs), i + 3)) if fracs[j] is not None]
        return float(np.median(near))
    out: list[Fit | None] = []
    prev = ref
    for i, (mask, fit) in enumerate(zip(masks, raw)):
        if fit is None:
            out.append(None)
            continue
        if fracs[i] is not None:
            frac = vote(i)
            if frac >= hair:
                fit = Fit(**{**asdict(fit), "mode": f"moments({frac:.2f})"})
            else:
                fit = Fit(**{**asdict(hold_fit(mask, ref, prev)), "mode": f"hold({frac:.2f})"})
        out.append(fit)
        prev = fit
    return out


def running_median(values: list[float], window: int) -> list[float]:
    half = window // 2
    return [float(np.median(values[max(0, i - half):min(len(values), i + half + 1)]))
            for i in range(len(values))]


def despike(values: list[float], window: int, floor: float) -> list[float]:
    """Replace a value by the local median only when it is an outlier against it.

    A blanket running median was the first thing here, and it was wrong: it
    also clips the extremes of motion that is fast but real. A jump moves the
    head 4-6 px per frame, and taking the median of every window flattens the
    top and bottom of the arc, so the face lags the head once per bounce. The
    median of a window that is climbing steadily IS the middle value, so
    comparing against it leaves honest motion alone and still catches the
    one- and two-frame spikes an ellipse fit throws when its axes swap.
    """
    if window <= 1:
        return list(values)
    half = window // 2
    out = list(values)
    for i in range(len(values)):
        lo, hi = max(0, i - half), min(len(values), i + half + 1)
        near = values[lo:hi]
        med = float(np.median(near))
        mad = float(np.median([abs(v - med) for v in near]))
        if abs(values[i] - med) > max(2.5 * mad, floor):
            out[i] = med
    return out


def smooth(fits: list[Fit | None], window: int) -> list[Fit]:
    """Fill holes from neighbours, then take the spikes out of every parameter."""
    idx = [i for i, f in enumerate(fits) if f is not None]
    if not idx:  # e.g. walk-back: the face never shows; matrices are placeholders
        return [Fit(0.0, 0.0, 1.0, 1.0, 0.0, 0, "hidden") for _ in fits]
    filled: list[Fit] = []
    for i, f in enumerate(fits):
        if f is None:
            j = min(idx, key=lambda k: abs(k - i))
            f = Fit(**{**asdict(fits[j]), "area": 0, "mode": "filled"})
        filled.append(f)
    if window <= 1:
        return filled
    # Where the face IS gets the careful filter: a jump moves the head several
    # pixels a frame and clipping the top of that arc leaves the photo behind
    # the head. What SHAPE it is gets the blunt one: a head does not change
    # size or tilt quickly, so a running median costs nothing real there and
    # takes out every axis swap the ellipse fit produces.
    keys = ("cx", "cy", "sx", "sy", "theta")
    values = {k: [getattr(f, k) for f in filled] for k in keys}
    cleaned = {
        "cx": despike(values["cx"], window, 0.8),
        "cy": despike(values["cy"], window, 0.8),
        **{k: running_median(values[k], window) for k in ("sx", "sy", "theta")},
    }
    return [Fit(area=f.area, mode=f.mode, **{k: cleaned[k][i] for k in keys})
            for i, f in enumerate(filled)]


# ----------------------------------------------------------------------------
# 3. the matrix
# ----------------------------------------------------------------------------
def matrix(fit: Fit, photo: "PhotoOval") -> list[float]:
    """
    2x3 affine [a b c; d e f] mapping photo pixel (px,py) -> frame pixel:
        qx = a*px + b*py + c
        qy = d*px + e*py + f
    Photo oval centre -> ellipse centre; oval radii -> semi-axes; tilt -> theta.
    """
    kx, ky = fit.sx / photo.rx, fit.sy / photo.ry
    c, s = math.cos(fit.theta), math.sin(fit.theta)
    a, b = c * kx, -s * ky
    d, e = s * kx, c * ky
    tx = fit.cx - (a * photo.cx + b * photo.cy)
    ty = fit.cy - (d * photo.cx + e * photo.cy)
    return [a, b, tx, d, e, ty]


def invert(m: list[float]) -> tuple[float, ...]:
    a, b, c, d, e, f = m
    det = a * e - b * d
    ia, ib, id_, ie = e / det, -b / det, -d / det, a / det
    return (ia, ib, -(ia * c + ib * f), id_, ie, -(id_ * c + ie * f))


# ----------------------------------------------------------------------------
# 4. the photo and the composite
# ----------------------------------------------------------------------------
@dataclass
class PhotoOval:
    image: Image.Image  # RGBA, oval alpha, already shrunk near target size
    cx: float
    cy: float
    rx: float
    ry: float


def prepare_photo(path: str | None, target_px: int, zoom: float = 1.0) -> PhotoOval:
    """Square the photo, cut the FACE_GUIDE oval, shrink to ~2x the on-sheet size
    so the affine warp samples a sane number of source pixels."""
    work = max(target_px * 2, 48)
    if path is None:
        # Emitting assets needs the oval's geometry, never its pixels: the
        # matrices are written in the unit square of the squared photo, so
        # they come out the same whatever picture (or none) went in.
        im = Image.new("RGB", (work, work), (128, 128, 128))
    else:
        im = Image.open(path).convert("RGB")
        side = min(im.size)
        im = im.crop(((im.width - side) // 2, (im.height - side) // 2,
                      (im.width + side) // 2, (im.height + side) // 2))
        im = im.resize((work, work), Image.LANCZOS)
    cx, cy = FACE_GUIDE["centerX"] * work, FACE_GUIDE["centerY"] * work
    rx, ry = FACE_GUIDE["radiusX"] * work / zoom, FACE_GUIDE["radiusY"] * work / zoom
    alpha = Image.new("L", (work, work), 0)
    ImageDraw.Draw(alpha).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    return PhotoOval(rgba, cx, cy, rx, ry)


def composite(frame: np.ndarray, mask: np.ndarray, m: list[float], photo: PhotoOval, colors: int = 0) -> np.ndarray:
    h, w = mask.shape
    warped = photo.image.transform((w, h), Image.AFFINE, invert(m), resample=Image.BILINEAR)
    if colors:
        alpha = warped.getchannel("A")
        warped = warped.convert("RGB").quantize(colors, dither=Image.Dither.NONE).convert("RGBA")
        warped.putalpha(alpha)
    wa = np.array(warped)
    out = frame.copy()
    paint = mask & (wa[:, :, 3] > 64)
    out[paint, :3] = wa[paint, :3]
    return out


# ----------------------------------------------------------------------------
# outputs
# ----------------------------------------------------------------------------
def strip(frames: list[np.ndarray]) -> Image.Image:
    h, w = frames[0].shape[:2]
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(Image.fromarray(f), (i * w, 0))
    return out


def gif(frames: list[np.ndarray], path: str, fps: int, scale: int, bg=(34, 34, 34)) -> None:
    h, w = frames[0].shape[:2]
    ims = []
    for f in frames:
        im = Image.new("RGBA", (w, h), bg + (255,))
        im.alpha_composite(Image.fromarray(f))
        ims.append(im.resize((w * scale, h * scale), Image.NEAREST).convert("P", palette=Image.ADAPTIVE, colors=128))
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=int(1000 / fps), loop=0, disposal=2)


def debug_frame(frame: np.ndarray, mask: np.ndarray, fit: Fit, scale: int = 4) -> Image.Image:
    h, w = mask.shape
    im = Image.new("RGBA", (w, h), (34, 34, 34, 255))
    im.alpha_composite(Image.fromarray(frame))
    arr = np.array(im)
    arr[mask] = (arr[mask] * 0.4 + np.array([0, 255, 120, 255]) * 0.6).astype(np.uint8)
    big = Image.fromarray(arr).resize((w * scale, h * scale), Image.NEAREST)
    d = ImageDraw.Draw(big)
    c, s = math.cos(fit.theta), math.sin(fit.theta)
    pts = []
    for k in range(48):
        t = 2 * math.pi * k / 48
        ex, ey = fit.sx * math.cos(t), fit.sy * math.sin(t)
        pts.append(((fit.cx + c * ex - s * ey) * scale, (fit.cy + s * ex + c * ey) * scale))
    d.polygon(pts, outline=(255, 60, 60, 255))
    ux, uy = fit.cx + math.sin(fit.theta) * fit.sy, fit.cy - math.cos(fit.theta) * fit.sy
    d.line(((fit.cx * scale, fit.cy * scale), (ux * scale, uy * scale)), fill=(255, 220, 0, 255), width=1)
    return big


def emit_assets(directory: str, avatar: str, emote: str, man: dict,
                masks: list[np.ndarray], mats: list[list[float]],
                photo: PhotoOval) -> tuple[int, int]:
    """The two files a runtime needs: where the plate is, and where the face goes.

    The mask is one alpha strip laid out exactly like the spritesheet, so a
    canvas can read it with the same frame arithmetic. The JSON is the affine
    per frame, in the unit square of the squared photo so any resolution of
    the person's photo drops in, and `null` on a frame where the face is not
    visible at all -- a runtime that sees null skips the warp instead of
    painting a face nobody can see.
    """
    out = os.path.join(directory, avatar)
    os.makedirs(out, exist_ok=True)
    # The mask is written as an ALPHA channel, not as grey levels: a browser
    # can then apply it with one `destination-in` draw instead of walking half
    # a million pixels in JavaScript, and never has to read the canvas back.
    alpha = np.concatenate([m.astype(np.uint8) * 255 for m in masks], axis=1)
    grey_alpha = np.dstack([np.full_like(alpha, 255), alpha])
    Image.fromarray(grey_alpha, "LA").save(os.path.join(out, f"{emote}.png"), optimize=True)
    # `mats` maps PHOTO PIXELS to frame pixels, for the working size this run
    # happened to use. Scaling the two columns by that size rewrites it in the
    # unit square of the squared photo, which is what makes one file serve a
    # 512px intake capture and a 4000px upload alike -- and what the runtime's
    # `canvasTransform` expects.
    side = photo.image.width
    painted = 0
    frames: list[list[float] | None] = []
    for mask, (a, b, c, d, e, f) in zip(masks, mats):
        if mask.any():
            painted += 1
            frames.append([round(v, 4) for v in
                           (a * side, b * side, c, d * side, e * side, f)])
        else:
            frames.append(None)
    body = {
        "w": man["frameWidth"], "h": man["frameHeight"], "n": len(masks), "fps": man["fps"],
        "guide": FACE_GUIDE, "f": frames,
    }
    with open(os.path.join(out, f"{emote}.json"), "w") as f:
        json.dump(body, f, separators=(",", ":"))
    return painted, len(masks)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=os.getcwd())
    ap.add_argument("--avatar", default="avatar1")
    ap.add_argument("--emote", default="defeat")
    ap.add_argument("--photo", help="required to render the review artefacts; the assets do not need one")
    ap.add_argument("--out", help="directory for the review artefacts (strip, gif, debug sheets)")
    ap.add_argument("--assets", help="directory for the shipped assets: <dir>/<avatar>/<emote>.{png,json}")
    ap.add_argument("--tol", type=int, default=14, help="max channel distance from the plate tone")
    ap.add_argument("--head-zone", type=float, default=0.55, help="fraction of the frame height the plate may live in")
    ap.add_argument("--min-area", type=int, default=3)
    ap.add_argument("--smooth", type=int, default=5, help="running-median window over frames (1 = off)")
    ap.add_argument("--scale", type=int, default=4, help="preview upscale")
    ap.add_argument("--zoom", type=float, default=1.15, help="crop tighter than FACE_GUIDE (1 = the guide oval)")
    ap.add_argument("--min-scale", type=float, default=0.6, help="semi-axes never shrink below this x the reference frame")
    ap.add_argument("--colors", type=int, default=12, help="quantise the pasted face to N colours (0 = off)")
    args = ap.parse_args()

    if args.out and not args.photo:
        raise SystemExit("--out renders a composited preview, so it needs --photo")
    if not (args.out or args.assets):
        raise SystemExit("nothing to write: pass --assets, --out, or both")
    man = clip_spec(args.root, args.avatar, args.emote)
    frames = frames_of(man["src"], man["frameWidth"])
    masks = track(frames, args.tol, args.head_zone, args.min_area)
    raw = [fit_ellipse(m) for m in masks]
    fits = smooth(choose(frames, masks, raw), args.smooth)

    ref = max((f for f in raw if f), key=lambda f: f.area) if any(raw) else Fit(0.0, 0.0, 1.0, 1.0, 0.0, 0)
    for f in fits:  # an occluded plate must not collapse the face into a dot
        f.sx, f.sy = max(f.sx, ref.sx * args.min_scale), max(f.sy, ref.sy * args.min_scale)
    photo = prepare_photo(args.photo, max(int(2 * max(ref.sx, ref.sy)), 8), args.zoom)
    mats = [matrix(f, photo) for f in fits]
    done = [composite(fr, mk, m, photo, args.colors) for fr, mk, m in zip(frames, masks, mats)]

    if args.assets:
        painted, total = emit_assets(args.assets, args.avatar, args.emote, man, masks, mats, photo)
        print(f"{args.avatar}/{args.emote}: {painted}/{total} frames carry a face -> "
              f"{args.assets}/{args.avatar}/{args.emote}.{{png,json}}")
        if not args.out:
            return

    os.makedirs(args.out, exist_ok=True)
    tag = f"{args.avatar}-{args.emote}-{os.path.splitext(os.path.basename(args.photo))[0]}"
    strip(done).save(os.path.join(args.out, f"{tag}.webp"), lossless=True, method=6)
    gif(done, os.path.join(args.out, f"{tag}.gif"), man["fps"], args.scale)
    gif(frames, os.path.join(args.out, f"{args.avatar}-{args.emote}-original.gif"), man["fps"], args.scale)
    dbg = [debug_frame(fr, mk, f) for fr, mk, f in zip(frames, masks, fits)]
    contact = Image.new("RGBA", (dbg[0].width * 12, dbg[0].height * math.ceil(len(dbg) / 12)), (34, 34, 34, 255))
    for i, d in enumerate(dbg):
        contact.paste(d, ((i % 12) * d.width, (i // 12) * d.height))
    contact.save(os.path.join(args.out, f"{tag}.debug.png"))
    side = Image.new("RGBA", (dbg[0].width * 12, dbg[0].height * 2), (34, 34, 34, 255))
    for k, i in enumerate(range(0, len(frames), max(1, len(frames) // 12))[:12]):
        for row, src in enumerate((frames, done)):
            im = Image.new("RGBA", (man["frameWidth"], man["frameHeight"]), (34, 34, 34, 255))
            im.alpha_composite(Image.fromarray(src[i]))
            side.paste(im.resize((dbg[0].width, dbg[0].height), Image.NEAREST), (k * dbg[0].width, row * dbg[0].height))
    side.save(os.path.join(args.out, f"{tag}.before-after.png"))

    # the plate masks as one alpha strip: a runtime needs only this + the JSON + a photo
    Image.fromarray(np.concatenate([m.astype(np.uint8) * 255 for m in masks], axis=1), "L") \
        .save(os.path.join(args.out, f"{args.avatar}-{args.emote}.mask.png"))
    with open(os.path.join(args.out, f"{args.avatar}-{args.emote}.transforms.json"), "w") as f:
        json.dump({
            "avatar": args.avatar, "emote": args.emote,
            "frameWidth": man["frameWidth"], "frameHeight": man["frameHeight"], "fps": man["fps"],
            "plate": PLATE.tolist(), "tol": args.tol,
            "photoOval": {"side": photo.image.width, "cx": photo.cx, "cy": photo.cy, "rx": photo.rx, "ry": photo.ry},
            "faceGuide": FACE_GUIDE,
            # `matrix` maps photo-work-space pixels (photoOval.side wide); `unit` maps the
            # unit square of the squared photo, so any resolution drops in: q = unit * (u, v, 1)
            "frames": [{**asdict(f), "visible": r is not None, "matrix": m,
                        "unit": [m[0] * photo.image.width, m[1] * photo.image.width, m[2],
                                 m[3] * photo.image.width, m[4] * photo.image.width, m[5]]}
                       for f, r, m in zip(fits, raw, mats)],
        }, f, indent=1)

    areas = [f.area for f in fits]
    modes = {m: sum(1 for f in fits if f.mode.startswith(m)) for m in ("moments", "hold", "filled", "hidden")}
    print(f"{tag}: {len(frames)} frames, plate px min/median/max = {min(areas)}/{int(np.median(areas))}/{max(areas)}, "
          f"modes = {modes}; wrote {args.out}/{tag}.*")


if __name__ == "__main__":
    main()
