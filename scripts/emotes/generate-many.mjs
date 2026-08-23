// Generate several emotes for one avatar with a concurrency cap.
//
//   pnpm emotes:generate-many --avatar avatar3 --emotions celebrate,wave,cry \
//        [--concurrency 4] [--attempts 1] [--tag v2] [--model ...]
//
// Spawns `generate.mjs` per emote, at most `concurrency` at a time (Kling rate
// limits past ~16 parallel jobs across the team), and writes one summary to
// .emotes-work/<avatar>/generate-many[-tag].json as it goes, so a caller that
// cannot wait on the process can poll the file: it ends with `"done": true`.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, WORK_DIR } from "./lib.mjs";
import { EMOTES } from "./prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  avatar: "avatar1",
  emotions: Object.keys(EMOTES)
    .filter((e) => !EMOTES[e].mirrorOf)
    .join(","),
  concurrency: "4",
  attempts: "1",
  tag: "",
  model: "klingai/kling-v2.6-i2v",
});
const { avatar, tag, model } = args;
const emotions = args.emotions
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const derived = emotions.filter((e) => EMOTES[e]?.mirrorOf);
if (derived.length)
  console.error(
    `skipping derived emotes (mirror their source at pack time): ${derived.join(", ")}`
  );
const wanted = emotions.filter((e) => !EMOTES[e]?.mirrorOf);
const unknown = emotions.filter((e) => !EMOTES[e]);
if (unknown.length) throw new Error(`unknown emotions: ${unknown.join(", ")}`);
const concurrency = Math.max(1, Number(args.concurrency));

const dir = join(WORK_DIR, avatar);
mkdirSync(dir, { recursive: true });
const summaryPath = join(dir, `generate-many${tag ? `-${tag}` : ""}.json`);
const summary = {
  avatar,
  tag,
  model,
  concurrency,
  started: new Date().toISOString(),
  done: false,
  results: {},
};
const save = () =>
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
save();

const script = fileURLToPath(new URL("./generate.mjs", import.meta.url));
function one(emotion) {
  return new Promise((resolve) => {
    const flags = [
      "--avatar",
      avatar,
      "--emotion",
      emotion,
      "--attempts",
      args.attempts,
      "--model",
      model,
    ];
    if (tag) flags.push("--tag", tag);
    const child = spawn(process.execPath, [script, ...flags], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.slice(out.indexOf("{")));
        summary.results[emotion] = {
          attempts: parsed.attempts,
          defaultTrim: parsed.defaultTrim,
          defaultStart: parsed.defaultStart,
          loop: parsed.loop,
        };
      } catch {
        summary.results[emotion] = {
          attempts: [
            {
              index: 1,
              error:
                (err || out).trim().split("\n").pop()?.slice(0, 300) ||
                "no output",
            },
          ],
        };
      }
      save();
      resolve();
    });
  });
}

const queue = [...wanted];
const workers = Array.from(
  { length: Math.min(concurrency, queue.length) },
  async () => {
    while (queue.length) await one(queue.shift());
  }
);
await Promise.all(workers);
summary.done = true;
summary.finished = new Date().toISOString();
save();
console.log(JSON.stringify(summary, null, 2));
const ok = Object.values(summary.results).filter((r) =>
  r.attempts.some((a) => a.clip)
).length;
if (!ok) process.exit(1);
