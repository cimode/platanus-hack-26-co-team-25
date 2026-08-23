// Generate candidate clips for one avatar x one emote through Vercel AI Gateway.
//
//   pnpm emotes:generate --avatar avatar1 --emotion celebrate [--attempts 2]
//        [--model klingai/kling-v2.6-i2v] [--duration 5] [--no-last-frame]
//        [--ground none|shadow] [--tag shadow]   (tag keeps attempts apart)
//
// Needs AI_GATEWAY_API_KEY (already in .env; `pnpm emotes:generate` loads it).
// Writes .emotes-work/<avatar>/<emotion>/attempt-N.mp4 plus a contact sheet of
// the raw frames per attempt, and prints one JSON summary to stdout so the
// `create_emote` workflow (or a human) can judge before packing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gateway } from "@ai-sdk/gateway";
import { experimental_generateVideo as generateVideo } from "ai";
import {
  buildInput,
  contact,
  extractRaw,
  parseArgs,
  WORK_DIR,
} from "./lib.mjs";
import { EMOTES, promptFor } from "./prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  avatar: "avatar1",
  emotion: "celebrate",
  attempts: "1",
  model: "klingai/kling-v2.6-i2v",
  duration: "5",
  noLastFrame: false,
  ground: "none",
  tag: "",
});
const { avatar, emotion, model, ground, tag } = args;
const name = (index) => `attempt-${tag ? `${tag}-` : ""}${index}`;
const attempts = Number(args.attempts);
const duration = Number(args.duration);
// The plate as last frame is the default; locomotion emotes opt out in prompts.mjs.
const withLastFrame = args.noLastFrame
  ? false
  : EMOTES[emotion]?.lastFrame !== false;
if (!EMOTES[emotion]) throw new Error(`unknown emotion ${emotion}`);
if (EMOTES[emotion].mirrorOf)
  throw new Error(
    `${emotion} is derived: pack the ${EMOTES[emotion].mirrorOf} clip with --mirror instead`
  );
if (!process.env.AI_GATEWAY_API_KEY)
  throw new Error(
    "AI_GATEWAY_API_KEY is not set (run via `pnpm emotes:generate`)"
  );

const dir = join(WORK_DIR, avatar, emotion);
mkdirSync(dir, { recursive: true });
const input = buildInput(avatar, join(dir, "input.png"));
const image = readFileSync(input);
const prompt = promptFor(avatar, emotion, { ground });

// Kling only honours the last frame in pro mode; std silently can't. Other
// gateway models ignore the option. Pass --no-last-frame for models that reject it.
const providerOptions =
  withLastFrame && model.startsWith("klingai/")
    ? { klingai: { mode: "pro" } }
    : {};
const frameImages = [{ image, frameType: "first_frame" }];
if (withLastFrame) frameImages.push({ image, frameType: "last_frame" });

async function attempt(index) {
  const t0 = Date.now();
  const clip = join(dir, `${name(index)}.mp4`);
  try {
    const result = await generateVideo({
      model: gateway.videoModel(model),
      prompt: { image, text: prompt },
      frameImages,
      aspectRatio: "9:16",
      duration,
      generateAudio: false,
      providerOptions,
      poll: { intervalMs: 4000, timeoutMs: 900_000 },
    });
    writeFileSync(clip, result.video.uint8Array);
    const rawDir = join(dir, name(index), "raw");
    const frames = extractRaw(clip, rawDir);
    const sheet = contact(frames, join(dir, name(index), "contact-raw.png"));
    return {
      index,
      clip,
      contact: sheet,
      rawFrames: frames.length,
      genSeconds: Math.round((Date.now() - t0) / 1000),
      warnings: result.warnings.map((w) => w.message ?? w.type),
    };
  } catch (error) {
    return {
      index,
      error: String(error?.message ?? error)
        .split("\n")[0]
        .slice(0, 300),
      genSeconds: Math.round((Date.now() - t0) / 1000),
    };
  }
}

const results = await Promise.all(
  Array.from({ length: attempts }, (_, i) => attempt(i + 1))
);
const summary = {
  avatar,
  emotion,
  model,
  lastFrame: withLastFrame,
  duration,
  ground,
  tag,
  defaultTrim: EMOTES[emotion].trim,
  defaultStart: EMOTES[emotion].start ?? 0,
  loop: EMOTES[emotion].loop === true,
  prompt,
  attempts: results,
};
writeFileSync(
  join(dir, `generate${tag ? `-${tag}` : ""}.json`),
  `${JSON.stringify(summary, null, 2)}\n`
);
console.log(JSON.stringify(summary, null, 2));
if (results.every((r) => r.error)) process.exit(1);
