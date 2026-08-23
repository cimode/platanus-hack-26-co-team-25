// Shared pieces of the emote pipeline: paths, the generation canvas geometry,
// and thin wrappers over ffmpeg / ImageMagick. Both CLIs (generate, pack) and
// the `create_emote` workflow build on this file; nothing here talks to an LLM.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const WORK_DIR = join(ROOT, ".emotes-work");
export const ASSET_DIR = join(ROOT, "public", "sprites", "emotes");
export const ASSET_URL = "/sprites/emotes";
export const MANIFEST_JSON = join(ASSET_DIR, "manifest.json");
export const MANIFEST_TS = join(
  ROOT,
  "src",
  "lib",
  "domain",
  "emotes",
  "emotes.manifest.ts"
);

/**
 * The generation canvas. The avatar plate is resized to BODY_H px tall and
 * centred on a flat green 9:16 canvas; the model animates on that, and the
 * green is what lets ffmpeg cut the character back out.
 *
 * Kling returns 720x1280 whatever the input size, so every clip is scaled back
 * to this canvas before cropping -- the crop below is in canvas coordinates.
 */
export const CANVAS = { w: 576, h: 1024, bodyH: 640, green: "#00FF00" };
/** Keeps headroom for hops and raised arms, and a little floor for shadows. */
export const CROP = { w: 400, h: 800, x: 88, y: 96 };
export const FPS = 12;
/** Nearest-neighbour downscale factor: 400/6 -> 67 px wide frames. */
export const PIXEL_SCALE = 6;

const bodyTop = (CANVAS.h - CANVAS.bodyH) / 2 - CROP.y;
const bodyBottom = (CANVAS.h + CANVAS.bodyH) / 2 - CROP.y;
/** Fraction of a frame's height the standing body occupies (0.8). */
export const BODY_FRACTION = (bodyBottom - bodyTop) / CROP.h;
/** Where the feet sit, as a fraction of the frame's height from the top (0.92). */
export const FEET_FRACTION = bodyBottom / CROP.h;

export function run(cmd, args) {
  return execFileSync(cmd, args, {
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
}

export function avatarPlate(avatar) {
  return join(ROOT, "public", "sprites", `${avatar}.png`);
}

/** The model's input: the plate on green, as PNG8 so three copies fit the gateway's 300 KB cap. */
export function buildInput(avatar, out) {
  mkdirSync(resolve(out, ".."), { recursive: true });
  run("magick", [
    "-size",
    `${CANVAS.w}x${CANVAS.h}`,
    `xc:${CANVAS.green}`,
    "(",
    avatarPlate(avatar),
    "-resize",
    `x${CANVAS.bodyH}`,
    ")",
    "-gravity",
    "center",
    "-composite",
    "-depth",
    "8",
    "-dither",
    "None",
    "-colors",
    "64",
    "-define",
    "png:compression-level=9",
    `PNG8:${out}`,
  ]);
  return out;
}

function fresh(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

const trimArgs = (trim) => (trim ? ["-t", String(trim)] : []);
const startArgs = (start) => (start ? ["-ss", String(start)] : []);
const scale = `scale=${CANVAS.w}:${CANVAS.h}:flags=lanczos`;

/** Raw frames, scaled to the canvas -- what the model produced, for judging. */
export function extractRaw(clip, dir, { fps = FPS, trim, start } = {}) {
  fresh(dir);
  run("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    ...startArgs(start),
    "-i",
    clip,
    ...trimArgs(trim),
    "-vf",
    `fps=${fps},${scale}`,
    join(dir, "%03d.png"),
  ]);
  return pngs(dir);
}

/** Chroma-keyed, despilled, cropped frames with real alpha. */
export function extractKeyed(clip, dir, { fps = FPS, trim, start } = {}) {
  fresh(dir);
  run("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    ...startArgs(start),
    "-i",
    clip,
    ...trimArgs(trim),
    "-vf",
    [
      `fps=${fps}`,
      scale,
      "format=rgba",
      `chromakey=0x${CANVAS.green.slice(1)}:0.28:0.06`,
      "despill=type=green",
      `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y}`,
    ].join(","),
    join(dir, "%03d.png"),
  ]);
  return pngs(dir);
}

/**
 * Swap the plate's baked-in ground ellipse for a real shadow.
 *
 * The avatar plates carry a beige ellipse under the feet. Image-to-video
 * copies it from the first frame and, correctly, leaves it on the floor while
 * the body hops -- but beige on the venue's wood reads as a tile, not a
 * shadow. Within the floor band the ellipse is the only thing in that palette
 * (shoes are near-white, jeans near-black), so it is keyed out by colour and a
 * soft dark ellipse is composited UNDER the body on the floor line, centred on
 * the legs. Constant size on purpose: a shadow that pulses with the arms looks
 * like a bug.
 */
export const FLOOR = {
  /** Rows from here down are the floor band (crop coordinates). */
  band: 676,
  /** Where the shadow's centre line sits: a hair below the feet. */
  y: 744,
  rx: 95,
  ry: 18,
  fill: "rgba(30,20,10,0.38)",
  /** The plate's ground-ellipse palette, sampled off the keyed frames. */
  palette: [
    "#A69385",
    "#978472",
    "#8E7B6A",
    "#66594D",
    "#A08A75",
    "#8F7863",
    "#988778",
    "#88796B",
    "#6A5E52",
    "#A68F85",
    "#897767",
    "#9A8776",
  ],
  fuzz: "10%",
  /** Below this alpha a band pixel is keying haze from the ellipse rim, not body. */
  alphaFloor: "55%",
};

/**
 * `strip` only removes the ellipse (the plates lost theirs in PR #48 and the
 * room's `.sprite` utility supplies a CSS drop-shadow for idle and reaction
 * alike); `shadow` also composites a contact shadow on the floor line.
 */
export function replaceFloor(
  frames,
  dir,
  floor = FLOOR,
  { shadow = true } = {}
) {
  fresh(dir);
  const bandH = CROP.h - floor.band;
  const out = [];
  for (const f of frames) {
    const name = f.split("/").pop();
    const stripped = join(dir, name);
    // 1. key the ellipse palette out of the floor band only
    run("magick", [
      f,
      "(",
      "+clone",
      "-crop",
      `${CROP.w}x${bandH}+0+${floor.band}`,
      "+repage",
      "-channel",
      "A",
      "-threshold",
      floor.alphaFloor,
      "+channel",
      "-fuzz",
      floor.fuzz,
      ...floor.palette.flatMap((c) => ["-transparent", c]),
      ")",
      "-geometry",
      `+0+${floor.band}`,
      "-compose",
      "Copy",
      "-composite",
      stripped,
    ]);
    if (!shadow) {
      out.push(stripped);
      continue;
    }
    // 2. centre of the legs (lower half of the body), so the shadow follows sideways steps
    const [x, w] = run("magick", [
      stripped,
      "-crop",
      `${CROP.w}x300+0+450`,
      "+repage",
      "-alpha",
      "extract",
      "-threshold",
      "50%",
      "-trim",
      "-format",
      "%X %w",
      "info:-",
    ])
      .trim()
      .split(" ")
      .map(Number);
    const cx =
      Number.isFinite(x) && Number.isFinite(w) ? x + w / 2 : CROP.w / 2;
    // 3. the shadow, under the body
    run("magick", [
      stripped,
      "(",
      "-size",
      `${CROP.w}x${CROP.h}`,
      "xc:none",
      "-fill",
      floor.fill,
      "-draw",
      `ellipse ${cx.toFixed(0)},${floor.y} ${floor.rx},${floor.ry} 0,360`,
      "-blur",
      "0x3",
      ")",
      "-compose",
      "DstOver",
      "-composite",
      stripped,
    ]);
    out.push(stripped);
  }
  return out;
}

/** Flip every frame horizontally: a right-facing walk becomes the left-facing sheet. */
export function mirrorFrames(frames, dir) {
  fresh(dir);
  for (const f of frames)
    run("magick", [f, "-flop", join(dir, f.split("/").pop())]);
  return pngs(dir);
}

/** Nearest-neighbour downscale + a small palette: fake pixels become real ones. */
export function pixelize(frames, dir, px = PIXEL_SCALE) {
  fresh(dir);
  for (const f of frames) {
    run("magick", [
      f,
      "-filter",
      "point",
      "-resize",
      `${100 / px}%`,
      "-dither",
      "None",
      "-colors",
      "40",
      join(dir, f.split("/").pop()),
    ]);
  }
  return pngs(dir);
}

/** One horizontal strip, transparent. `.webp` is lossless (same pixels, ~40% smaller than PNG). */
export function sheet(frames, out) {
  const args = [...frames, "-background", "none", "+append"];
  if (out.endsWith(".webp"))
    args.push("-define", "webp:lossless=true", "-define", "webp:method=6");
  run("magick", [...args, out]);
  return out;
}

/** Grid of every `step`-th frame, 12 per row, for a human or a judge agent to read. */
export function contact(
  frames,
  out,
  { step = 2, cellH = 120, bg = "#222222", point = false } = {}
) {
  const picked = frames.filter((_, i) => i % step === 0);
  const rows = [];
  for (let i = 0; i < picked.length; i += 12) {
    const row = `${out}.row${rows.length}.png`;
    run("magick", [
      ...picked.slice(i, i + 12),
      ...(point ? ["-filter", "point"] : []),
      "-resize",
      `x${cellH}`,
      "-bordercolor",
      bg,
      "-border",
      "2",
      "+append",
      row,
    ]);
    rows.push(row);
  }
  run("magick", [
    ...rows,
    "-background",
    bg,
    "-gravity",
    "west",
    "-append",
    out,
  ]);
  for (const r of rows) rmSync(r);
  return out;
}

export function dimensions(png) {
  const [w, h] = run("magick", ["identify", "-format", "%w %h", png])
    .trim()
    .split(" ")
    .map(Number);
  return { w, h };
}

export function pngs(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
}

/* ---------------------------------------------------------------------------
   Manifest: JSON next to the assets is the source of truth; the TS module the
   domain imports is generated from it so the room never reads a file at runtime.
   --------------------------------------------------------------------------- */

export function readManifest() {
  if (!existsSync(MANIFEST_JSON)) return {};
  return JSON.parse(readFileSync(MANIFEST_JSON, "utf8"));
}

export function writeManifest(manifest) {
  mkdirSync(ASSET_DIR, { recursive: true });
  const sorted = Object.fromEntries(
    Object.keys(manifest)
      .sort()
      .map((a) => [
        a,
        Object.fromEntries(
          Object.keys(manifest[a])
            .sort()
            .map((e) => [e, manifest[a][e]])
        ),
      ])
  );
  writeFileSync(MANIFEST_JSON, `${JSON.stringify(sorted, null, 2)}\n`);
  const header =
    "// GENERATED by scripts/emotes/pack.mjs from public/sprites/emotes/manifest.json.\n" +
    "// Do not edit by hand: run `pnpm emotes:pack` and commit both files together.\n" +
    'import type { EmoteSheet } from "./emotes";\n\n' +
    "export const EMOTE_MANIFEST: Readonly<\n" +
    "  Record<string, Readonly<Record<string, EmoteSheet>>>\n" +
    "> = ";
  writeFileSync(MANIFEST_TS, `${header}${JSON.stringify(sorted, null, 2)};\n`);
  // Biome owns formatting in this repo; hand it the file so `pnpm check` stays green.
  run("pnpm", ["exec", "biome", "format", "--write", MANIFEST_TS]);
  return sorted;
}

export function parseArgs(argv, defaults) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, inline] = a.slice(2).split("=");
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--"))
      out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}
