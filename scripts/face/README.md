# face-on-avatar (proof of concept, 2026-08-23)

Sticks a participant's photo onto the blank face plate of an emote spritesheet,
frame by frame, with one 2x3 affine matrix per frame. Needs `python3` with
`numpy` + `Pillow` (already on the dev machine).

```bash
# one emote: composited strip + GIF + mask strip + matrices JSON
python3 scripts/face/fit.py --avatar avatar1 --emote defeat \
  --photo public/match/parent-a.jpg --out scripts/face/out

# every emote of every avatar (52 clips, ~4 min)
for a in avatar1 avatar2 avatar3 avatar4; do
  for e in defeat cry celebrate fight love wave angry walk \
           walk-left walk-right sad-walk-left sad-walk-right walk-back; do
    python3 scripts/face/fit.py --avatar $a --emote $e \
      --photo public/match/parent-a.jpg --out scripts/face/out
  done
done

# runtime demo: composites in the browser from sheet + mask + JSON, no Python
python3 -m http.server 8765          # from the repo root
open http://127.0.0.1:8765/scripts/face/demo.html
```

## How it works

The face plate is a flat `rgb(209,180,146)` on every avatar and survives the
pack step's 40-colour quantisation within ~14 units. Per frame: segment the
plate, take its second-order moments for centre / semi-axes / tilt, map the
photo's `FACE_GUIDE` oval onto that ellipse, and paint the warped photo **only
where the plate was** -- so hair, hands and tears drawn over the face stay on
top of it.

Four things that a first pass gets wrong, and what the code does instead
(each was found by a judge agent reading the rendered sheets, then measured):

- **A frame is not enough context.** A narrow profile crescent (a real face)
  and a highlight thread knitted into a sweater are both small and neither
  fills its bounding box, so any per-frame compactness rule either strobes the
  profile walks or paints the photo on a shoulder. `track()` works over the
  whole clip: find the best frame, then walk outwards from it, each frame
  taking the component nearest to where the face was last seen.
- **Thickness, not size, tells a face from a thread.** A face keeps a third to
  four fifths of itself under a one-pixel erosion; a 1-2 px thread keeps
  nothing. That single number is what makes the three `walk-back` clips come
  out untouched with no per-clip flag.
- **A merge must not grow the head.** Fragments join the plate by pixel
  proximity (a fist splits the face in two), but only while the mask stays
  within 1.35x the reference face box -- a sleeve thread starts a pixel from
  the jaw and runs twenty pixels down the arm.
- **Do not latch the neck trim.** Cutting at the first narrow row takes the
  chin with it whenever two fists leave a 3 px bridge across the face; only
  rows below the *last* wide row are neck.

When part of the plate is missing, what covers it decides: dark hair means the
head turned (keep the foreshortened fit), anything else is an occluder in
front of a face that did not move (hold the reference size). A 5-frame median
over that verdict keeps one bad frame from flipping it.

The temporal filter is split by what the parameter means, and getting this
wrong is what a judge agent caught last:

- **Where the face is** (`cx`, `cy`) is filtered for spikes only -- a value is
  replaced by the local median just when it is an outlier against it. A jump
  moves the head 4-6 px per frame, and a blanket median clips the top and
  bottom of that arc, so the photo lags the head once per bounce and leaves a
  crescent of bare beige under the chin.
- **What shape it is** (`sx`, `sy`, `theta`) takes a plain running median. A
  head does not change size or tilt quickly, and a median leaves a ramp
  untouched anyway, so this costs nothing real and removes every axis swap.

The other half of that story is in `fit_ellipse`: a near-circular blob carries
no orientation, so the eigen-decomposition picks one at random and swaps it
between frames. Both the tilt and the two semi-axes fade toward the round
answer as the blob rounds off, which makes a swap invisible instead of a 30%
scale pop.

## Output per clip

| file | what |
| --- | --- |
| `<avatar>-<emote>-<photo>.webp` | the composited sheet, lossless, same layout as the original |
| `<avatar>-<emote>-<photo>.gif` | scaled preview at the clip's fps |
| `<avatar>-<emote>.mask.png` | the plate masks as one alpha strip |
| `<avatar>-<emote>.transforms.json` | per frame: cx, cy, sx, sy, theta, mode, and the 2x3 matrix (`matrix` in photo pixels, `unit` for the unit square, so any photo resolution drops in) |
| `*.debug.png` / `*.before-after.png` | every frame with mask + ellipse; original vs composited |

A runtime needs only the mask strip, the JSON and a photo: the browser
compositor in `demo.html` does 54 frames in ~6-50 ms, and the result feeds the
existing CSS `steps()` player unchanged.
