// Make every one-shot emote the same length on every avatar.
//
//   pnpm emotes:normalize [--dry-run]
//
// The judge trims each clip where ITS gesture ends, so the same emote came out
// 3.0–4.5 s long depending on the avatar. Two people reacting to one event
// should finish together, so the canonical length of a one-shot is the longest
// any avatar needed, and the shorter ones are re-packed from their own clip
// with that trim: the extra frames are the idle pose, which costs nothing and
// keeps every avatar on the same beat. Locomotion (loop) sheets are left alone.
// Run after `create_emotes`; `emotes.test.ts` fails until this has been run.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, readManifest, WORK_DIR } from "./lib.mjs";
import { EMOTES } from "./prompts.mjs";

const args = parseArgs(process.argv.slice(2), { dryRun: false });
const manifest = readManifest();
const avatars = Object.keys(manifest);
const oneShots = Object.keys(EMOTES).filter((e) => !EMOTES[e].loop);

const latestClip = (avatar, emote) => {
  const dir = join(WORK_DIR, avatar, emote);
  const clips = readdirSync(dir)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return clips[0] ? join(dir, clips[0].f) : null;
};

let repacked = 0;
let planned = 0;
for (const emote of oneShots) {
  const have = avatars.filter((a) => manifest[a]?.[emote]);
  if (!have.length) continue;
  const seconds = (a) => manifest[a][emote].frames / manifest[a][emote].fps;
  const canonical = Math.max(...have.map(seconds));
  for (const avatar of have) {
    if (seconds(avatar) >= canonical) continue;
    const clip = latestClip(avatar, emote);
    if (!clip) {
      console.error(
        `${avatar}/${emote}: ${seconds(avatar)} s but no clip on disk to re-pack from`
      );
      continue;
    }
    console.log(
      `${avatar}/${emote}: ${seconds(avatar)} s -> ${canonical} s${args.dryRun ? " (dry run)" : ""}`
    );
    planned++;
    if (args.dryRun) continue;
    execFileSync(
      "pnpm",
      [
        "emotes:pack",
        "--avatar",
        avatar,
        "--emotion",
        emote,
        "--clip",
        clip,
        "--trim",
        String(canonical),
        "--floor",
        "strip",
      ],
      { stdio: "ignore" }
    );
    repacked++;
  }
}
console.log(
  args.dryRun
    ? `${planned} sheet(s) would be re-packed`
    : repacked
      ? `re-packed ${repacked} sheet(s)`
      : "already uniform"
);
