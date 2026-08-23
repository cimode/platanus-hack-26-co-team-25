// Turn one chosen clip into a room asset.
//
//   pnpm emotes:pack --avatar avatar1 --emotion celebrate \
//        --clip .emotes-work/avatar1/celebrate/attempt-1.mp4 [--start 1.5] [--trim 4] [--model ...] [--preview] [--floor keep|strip|shadow] [--mirror]
//
// Writes public/sprites/emotes/<avatar>/<emotion>.webp (one lossless horizontal strip of
// pixelized, transparent frames), updates public/sprites/emotes/manifest.json
// and regenerates src/lib/domain/room/emotes.manifest.ts from it. Prints the
// manifest entry. No network: everything here is ffmpeg + ImageMagick.
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ASSET_DIR,
  ASSET_URL,
  BODY_FRACTION,
  contact,
  dimensions,
  extractKeyed,
  FEET_FRACTION,
  FPS,
  mirrorFrames,
  PIXEL_SCALE,
  parseArgs,
  pixelize,
  readManifest,
  replaceFloor,
  sheet,
  WORK_DIR,
  writeManifest,
} from "./lib.mjs";
import { EMOTES } from "./prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  avatar: "avatar1",
  emotion: "celebrate",
  clip: "",
  trim: "",
  start: "",
  fps: String(FPS),
  px: String(PIXEL_SCALE),
  model: "klingai/kling-v2.6-i2v",
  preview: false,
  floor: "keep",
  mirror: false,
});
const { avatar, emotion, clip, model, preview, floor } = args;
// A derived emote (walk-left = walk-right mirrored) takes start/trim/loop from its source.
const spec = EMOTES[emotion]?.mirrorOf
  ? { ...EMOTES[EMOTES[emotion].mirrorOf], ...EMOTES[emotion] }
  : EMOTES[emotion];
const mirror = args.mirror === true || !!EMOTES[emotion]?.mirrorOf;
if (!["keep", "strip", "shadow"].includes(floor))
  throw new Error("--floor must be keep, strip or shadow");
if (!clip) throw new Error("--clip is required");
if (!EMOTES[emotion]) throw new Error(`unknown emotion ${emotion}`);
const fps = Number(args.fps);
const px = Number(args.px);
const trim = args.trim === "" ? spec.trim : Number(args.trim);
const start = args.start === "" ? (spec.start ?? 0) : Number(args.start);

const work = join(WORK_DIR, avatar, emotion, "pack");
const keyed = extractKeyed(clip, join(work, "keyed"), { fps, trim, start });
// --floor strip removes the plate's old beige ground ellipse; --floor shadow also
// paints a contact shadow. keep leaves the frames as the model made them.
const grounded =
  floor === "keep"
    ? keyed
    : replaceFloor(keyed, join(work, "floor"), undefined, {
        shadow: floor === "shadow",
      });
const oriented = mirror
  ? mirrorFrames(grounded, join(work, "mirror"))
  : grounded;
const frames = pixelize(oriented, join(work, "px"), px);
contact(frames, join(work, "contact-px.png"), { bg: "#444444", point: true });

// --preview keeps a trial out of public/ and the manifest: the sheet lands next
// to the work files so it can be looked at (or dropped into the POC page).
const outDir = preview ? join(work, "..", "preview") : join(ASSET_DIR, avatar);
mkdirSync(outDir, { recursive: true });
const out = sheet(frames, join(outDir, `${emotion}.webp`));
const { w, h } = dimensions(frames[0]);

const entry = {
  src: `${ASSET_URL}/${avatar}/${emotion}.webp`,
  frames: frames.length,
  frameWidth: w,
  frameHeight: h,
  fps,
  bodyFraction: Number(BODY_FRACTION.toFixed(3)),
  feetFraction: Number(FEET_FRACTION.toFixed(3)),
  model,
  floor,
  loop: spec.loop === true,
  ...(mirror ? { mirrorOf: EMOTES[emotion]?.mirrorOf ?? null } : {}),
  bytes: statSync(out).size,
};
if (preview) {
  console.log(
    JSON.stringify(
      { avatar, emotion, ...entry, src: out, start, trim, preview: true },
      null,
      2
    )
  );
} else {
  const manifest = readManifest();
  manifest[avatar] = { ...(manifest[avatar] ?? {}), [emotion]: entry };
  writeManifest(manifest);
  console.log(
    JSON.stringify({ avatar, emotion, ...entry, start, trim }, null, 2)
  );
}
