/**
 * merge.mjs — turn the generated parts into the committed question bank.
 *
 * The bank is 100 blocks per pillar, written once by a fan-out of authoring
 * agents into `quiz/bank/.parts/`. This script is the gate between what they
 * wrote and what ships: it is deterministic, it explains every rejection, and
 * it never edits a block — a block either satisfies the instrument or it is
 * listed for a top-up round.
 *
 *   node scripts/quiz-bank/merge.mjs            # report only
 *   node scripts/quiz-bank/merge.mjs --write    # also write quiz/bank/<pillar>.json
 *
 * Rejections, in the order they are checked:
 *   structure   four options a..d, one per pillar, exactly one reversed, and
 *               the reversed one on the block's focus pillar
 *   length      scenario <= 2 sentences and 220 characters, options <= 8 words
 *   voice       an option that is not first-person singular present
 *   duplicate   a scenario that retells one already accepted, anywhere in the
 *               bank (the same `tooSimilar` the live pipeline used)
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARTS = join(ROOT, "quiz", "bank", ".parts");
const OUT = join(ROOT, "quiz", "bank");
const PILLARS = ["regulation", "politeness", "reliability", "agency"];
const KEYS = ["a", "b", "c", "d"];
const PER_PILLAR = Number(process.env.BANK_PER_PILLAR ?? 100);

/* ---------------------------------------------------------------- similarity
   Ported from the former src/lib/domain/quiz/similarity.ts (deleted with the
   live authoring pipeline) so this script stays plain node with no build step.
   It is now the only copy: nothing at runtime compares two scenarios. */
const STOPWORDS = new Set(
  "a al algo ante aqui asi cada como con cuando de del donde e el ella ellos en entre era es esa ese eso esta estan este esto hay la las le les lo los mas me mi mis muy ni no o otra otro para pero por que se si sin sobre solo su sus te ti toda todas todo todos tu tus un una unas uno unos y ya".split(
    " "
  )
);
const contentWords = (t) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
function trigrams(words) {
  const j = words.join(" ");
  const g = new Set();
  for (let i = 0; i + 3 <= j.length; i++) g.add(j.slice(i, i + 3));
  return g;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let s = 0;
  for (const g of a) if (b.has(g)) s++;
  return s / (a.size + b.size - s);
}
function sharedPhrases(a, b) {
  const p = new Set();
  for (let i = 0; i + 2 <= a.length; i++) p.add(a.slice(i, i + 2).join(" "));
  const hit = new Set();
  for (let i = 0; i + 2 <= b.length; i++) {
    const x = b.slice(i, i + 2).join(" ");
    if (p.has(x)) hit.add(x);
  }
  return hit.size;
}
/**
 * The bank's duplicate rule is LOOSER than the one the live pipeline used, on
 * purpose. That one compared a participant's fifteen blocks against each
 * other, where three shared content words really is a retelling. Here four
 * hundred blocks are compared against each other and any two scenarios set in
 * a Bogotá apartment share "vecino", "casa" and "puerta" without sharing a
 * joke: at three words the gate threw away 129 perfectly distinct blocks.
 *
 * What matters at bank scale is that no two blocks a participant could BOTH be
 * dealt read as the same joke, so the rule keeps the two strong signals (a
 * repeated phrase, near-verbatim text) and asks more of the weak one.
 * `BANK_SHARED_WORDS` and `BANK_JACCARD` make it tunable from the command line.
 */
const SHARED_WORDS = Number(process.env.BANK_SHARED_WORDS ?? 5);
const JACCARD = Number(process.env.BANK_JACCARD ?? 0.45);

function tooSimilar(x, y) {
  const a = contentWords(x),
    b = contentWords(y);
  if (!a.length || !b.length) return false;
  const setB = new Set(b);
  if (new Set(a.filter((w) => setB.has(w))).size >= SHARED_WORDS) return true;
  if (sharedPhrases(a, b) >= 2) return true;
  return jaccard(trigrams(a), trigrams(b)) >= JACCARD;
}

/* ------------------------------------------------------------------ checking */
const sentences = (t) =>
  t
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;

/** First person singular present, the way every option in the form is written. */
function voiceProblem(text) {
  const first = contentWords(text)[0] ?? "";
  if (/^(me|mi|nos)$/.test(first)) return null; // "Me río y sigo"
  if (/(ar|er|ir)$/.test(first) && first.length > 3) {
    return `option starts with an infinitive ("${first}")`;
  }
  if (/^(tu|usted|ustedes|vos)\b/i.test(text.trim()))
    return "option is second person";
  return null;
}

function problemWith(block) {
  const { focusPillar, scenario, options } = block;
  if (!PILLARS.includes(focusPillar))
    return `unknown focusPillar "${focusPillar}"`;
  if (typeof scenario !== "string" || scenario.trim().length < 10)
    return "no scenario";
  if (scenario.trim().length > 220)
    return `scenario is ${scenario.trim().length} characters`;
  if (sentences(scenario) > 2)
    return `scenario has ${sentences(scenario)} sentences`;
  if (!Array.isArray(options) || options.length !== 4)
    return `${options?.length ?? 0} options`;
  const sorted = [...options].sort((x, y) => x.key.localeCompare(y.key));
  if (sorted.map((o) => o.key).join("") !== KEYS.join(""))
    return `option keys ${sorted.map((o) => o.key).join(",")}`;
  const pillars = sorted.map((o) => o.pillar);
  if (new Set(pillars).size !== 4 || pillars.some((p) => !PILLARS.includes(p)))
    return `pillars ${pillars.join(",")}`;
  const reversed = sorted.filter((o) => o.keyed === "reversed");
  if (reversed.length !== 1) return `${reversed.length} reversed options`;
  if (reversed[0].pillar !== focusPillar)
    return `reversed option is on ${reversed[0].pillar}, not ${focusPillar}`;
  for (const o of sorted) {
    if (typeof o.text !== "string" || !o.text.trim())
      return `option ${o.key} has no text`;
    if (words(o.text) > 8) return `option ${o.key} has ${words(o.text)} words`;
    const v = voiceProblem(o.text);
    if (v) return v;
  }
  return null;
}

/* -------------------------------------------------------------------- merge */
const parts = readdirSync(PARTS)
  .filter((f) => f.endsWith(".json"))
  .sort();
const accepted = Object.fromEntries(PILLARS.map((p) => [p, []]));
const seen = [];
const rejects = [];
let read = 0;

for (const file of parts) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(PARTS, file), "utf8"));
  } catch (e) {
    rejects.push({ file, why: `unparseable: ${e.message}` });
    continue;
  }
  for (const raw of doc.blocks ?? []) {
    read++;
    const block = {
      focusPillar: raw.focusPillar,
      domain: String(raw.domain ?? "").trim(),
      scenario: String(raw.scenario ?? "").trim(),
      options: (raw.options ?? [])
        .map((o) => ({
          key: o.key,
          text: String(o.text ?? "").trim(),
          pillar: o.pillar,
          keyed: o.keyed,
        }))
        .sort((x, y) => String(x.key).localeCompare(String(y.key))),
    };
    const why = problemWith(block);
    if (why) {
      rejects.push({ file, scenario: block.scenario.slice(0, 60), why });
      continue;
    }
    const twin = seen.find((s) => tooSimilar(block.scenario, s));
    if (twin) {
      rejects.push({
        file,
        scenario: block.scenario.slice(0, 60),
        why: `repeats: "${twin.slice(0, 60)}"`,
      });
      continue;
    }
    if (accepted[block.focusPillar].length >= PER_PILLAR) {
      rejects.push({
        file,
        scenario: block.scenario.slice(0, 60),
        why: `${block.focusPillar} is already full`,
      });
      continue;
    }
    seen.push(block.scenario);
    accepted[block.focusPillar].push(block);
  }
}

/* ------------------------------------------------------------------- report */
console.log(`parts: ${parts.length} files, ${read} blocks read\n`);
for (const p of PILLARS) {
  const n = accepted[p].length;
  const domains = new Set(accepted[p].map((b) => b.domain)).size;
  console.log(
    `  ${p.padEnd(12)} ${String(n).padStart(3)}/${PER_PILLAR}  ${domains} domains  ${n < PER_PILLAR ? `SHORT BY ${PER_PILLAR - n}` : "ok"}`
  );
}
const byWhy = {};
for (const r of rejects) {
  const k = r.why.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, "N");
  byWhy[k] = (byWhy[k] ?? 0) + 1;
}
console.log(`\nrejected: ${rejects.length}`);
for (const [why, n] of Object.entries(byWhy).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(3)}  ${why}`);

if (process.argv.includes("--verbose")) {
  console.log("\nfirst 25 rejections:");
  for (const r of rejects.slice(0, 25))
    console.log(`  [${r.file}] ${r.why} — ${r.scenario ?? ""}`);
}

if (process.argv.includes("--write")) {
  mkdirSync(OUT, { recursive: true });
  for (const p of PILLARS) {
    const blocks = accepted[p].map((b, i) => ({
      id: `${p.slice(0, 3)}-${String(i + 1).padStart(3, "0")}`,
      ...b,
    }));
    writeFileSync(
      join(OUT, `${p}.json`),
      `${JSON.stringify({ pillar: p, language: "es", blocks }, null, 2)}\n`
    );
    console.log(`\nwrote quiz/bank/${p}.json (${blocks.length} blocks)`);
  }
}
