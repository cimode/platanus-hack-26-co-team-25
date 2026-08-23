/**
 * authoring.ts — the block-authoring contract: the prompt and its schema.
 *
 * **This file is the authoritative statement of the block rules.** They used to
 * live in `.claude/skills/quest-skill/SKILL.md`, which the offline workflow told
 * a subagent to go and read. A function cannot read a skill file, so the rules
 * are inlined here — and two copies of a rule drift within a day, so this copy
 * wins and the skill file points at it.
 *
 * Normative sources, quoted rather than cited because the model cannot open them:
 *   PILLARS.md  §5 A5 every block loads all four pillars · §8 rule 1 mixed keying
 *   AUDIT.md    F1 reversed keying is irreversible · A7/A8 safety
 *
 * There are deliberately NO example scenarios, example options or example
 * twists anywhere in the live prompt. Measured: every concrete example became
 * the scenario the model wrote, for every participant in the room — the parrot
 * that learned the alarm tone, the neighbour at the party, the option "Entro en
 * pánico" — so the rules below are stated abstractly and the per-position
 * twist kind in the assignment table is what makes each block specific.
 *
 * Contract: pure TypeScript. Builds strings; performs no I/O and calls no model.
 */

import { z } from "zod";

import type { Assignment } from "./assignments.ts";

/**
 * What the model must return for one block.
 *
 * `position` comes back so a mis-ordered response is detectable; `batch` and
 * `focusPillar` are *not* asked for — they are ours, and re-deriving them from
 * the assignment removes a whole class of drift between plan and output.
 */
/**
 * SHAPE ONLY. This schema is what `generateObject` validates the model's
 * output against, and a schema miss fails the WHOLE call as "no object" --
 * three of those and the batch is lost. The length rules (two short
 * sentences, 220 characters, twelve words) therefore live in
 * `authoredBlockProblem` below, where breaking one costs that position a
 * repair, not the batch. The caps here only stop a paragraph: a Spanish
 * two-sentence scenario lands between 150 and 300 characters, and in
 * production the 220 cap used to fail one call in three.
 */
export const authoredBlockSchema = z.object({
  // No ranges, no lengths, no counts: the enums guide the model (they reach
  // it as the JSON schema), but every size rule is checked per block by
  // `normalizeAuthoredBlock` and `authoredBlockProblem` below, where a miss
  // costs one position a repair. A size rule here costs the whole call.
  position: z.int(),
  scenario: z.string(),
  options: z.array(
    z.object({
      key: z.enum(["a", "b", "c", "d"]),
      text: z.string(),
      pillar: z.enum(["regulation", "politeness", "reliability", "agency"]),
      keyed: z.enum(["positive", "reversed"]),
    })
  ),
});

/** Sentences, counted the way a reader counts them: by full stops. */
function sentenceCount(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Scenario: at most two short sentences and 220 characters (the bubble on a
 * 390px phone). Option: the prompt asks for 4–7 words and the judge frowns
 * past 8, but the HARD cap is looser. The options render as full-width rows
 * since 2026-08-23 (style "B · Diálogo"), where a ten-word line simply wraps;
 * what the cap guards against is a paragraph, not a joke that ran one word
 * long. Rejecting at nine cost real forms: the model lands 9–10 words often
 * enough that whole batches failed after repair and the final pass, and with
 * the pool of whole forms one lost batch is a lost form.
 */
const MAX_SENTENCES = 2;
const MAX_SCENARIO_CHARS = 220;
const MAX_OPTION_WORDS = 12;

export type AuthoredBlock = z.infer<typeof authoredBlockSchema>;

const OPTION_KEYS = ["a", "b", "c", "d"] as const;

/**
 * The block as the loop will use it, or the reason it cannot be.
 *
 * Order is not a mistake: options come back as `a, b, d, c` often enough
 * that rejecting the block for it lost real batches, so they are sorted.
 * What remains is checked one block at a time — exactly the four keys, no
 * empty text, a scenario at all — so a miss is that position's repair.
 */
export function normalizeAuthoredBlock(
  raw: AuthoredBlock
): { block: AuthoredBlock } | { problem: string } {
  const where = `position ${raw.position}`;
  const options = raw.options
    .map((option) => ({ ...option, text: option.text.trim() }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const keys = options.map((option) => option.key);
  if (keys.join(",") !== OPTION_KEYS.join(",")) {
    return {
      problem: `${where}: the options must be exactly a, b, c and d, got ${keys.join(", ") || "none"}`,
    };
  }
  const empty = options.find((option) => option.text.length === 0);
  if (empty) {
    return { problem: `${where}: option "${empty.key}" has no text` };
  }
  const scenario = raw.scenario.trim();
  if (scenario.length < 10) {
    return { problem: `${where}: the scenario is missing` };
  }
  return { block: { position: raw.position, scenario, options } };
}

/** The length complaint about a scenario, worded for the repair prompt. */
function scenarioProblem(block: AuthoredBlock): string | null {
  const sentences = sentenceCount(block.scenario);
  if (sentences > MAX_SENTENCES) {
    return (
      `position ${block.position}: the scenario has ${sentences} ` +
      `sentences; the limit is ${MAX_SENTENCES} short sentences`
    );
  }
  const chars = block.scenario.trim().length;
  if (chars > MAX_SCENARIO_CHARS) {
    return (
      `position ${block.position}: the scenario has ${chars} ` +
      `characters; the limit is ${MAX_SCENARIO_CHARS}`
    );
  }
  return null;
}

/** The length complaint about one option, worded for the repair prompt. */
function optionProblem(
  block: AuthoredBlock,
  option: AuthoredBlock["options"][number]
): string | null {
  const words = wordCount(option.text);
  if (words <= MAX_OPTION_WORDS) return null;
  return (
    `position ${block.position}: option "${option.key}" has ` +
    `${words} words; the limit is ${MAX_OPTION_WORDS} words`
  );
}

/**
 * The first length rule this block breaks, or null.
 *
 * The per-block form of `authoredBatchSchema`'s refinement, for the author
 * loop: an eleven-word option must cost that position a repair, not the whole
 * batch a failure — which is what enforcing the same rule at the batch
 * boundary (inside `generateObject`) did.
 */
export function authoredBlockProblem(block: AuthoredBlock): string | null {
  const scenario = scenarioProblem(block);
  if (scenario) return scenario;
  for (const option of block.options) {
    const problem = optionProblem(block, option);
    if (problem) return problem;
  }
  return null;
}

/**
 * What one author call returns: some blocks. The first call asks for five; a
 * repair asks only for the positions still missing, so the count is the
 * call's, not the batch's -- and it is not enforced here: a sixth block or a
 * missing one costs the affected positions another call, never the response.
 */
export const authoredBlocksSchema = z.object({
  blocks: z.array(authoredBlockSchema),
});

export type AuthoredBlocks = z.infer<typeof authoredBlocksSchema>;

/** A whole batch's shape — five blocks — with no length rules applied. */
export const authoredBatchShapeSchema = z.object({
  blocks: z.array(authoredBlockSchema).length(5),
});

/**
 * The batch, plus the two length limits the character caps above cannot express.
 *
 * They live here rather than in the prompt alone because a tone instruction is
 * a request and a schema is a refusal. Pushing the register into the absurd
 * makes the model want a third sentence to land the twist and a tenth word to
 * land the punchline; this is what stops it, and the repair pass is what
 * recovers from it. Messages name the position and the limit, because the model
 * is answering about five blocks at once and "too long" is not actionable.
 */
export const authoredBatchSchema = authoredBatchShapeSchema.superRefine(
  (batch, ctx) => {
    batch.blocks.forEach((block, index) => {
      const scenario = scenarioProblem(block);
      if (scenario) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks", index, "scenario"],
          message: scenario,
        });
      }

      block.options.forEach((option, optionIndex) => {
        const problem = optionProblem(block, option);
        if (problem) {
          ctx.addIssue({
            code: "custom",
            path: ["blocks", index, "options", optionIndex, "text"],
            message: problem,
          });
        }
      });
    });
  }
);

export type AuthoredBatch = z.infer<typeof authoredBatchSchema>;

/** The rules, as the model receives them. Edit here, nowhere else. */
const RULES = `You author blocks for a forced-choice compatibility instrument.
A block is a short, BIZARRO-but-everyday "what would you do?" scenario with
exactly four options. The bar is not "amusing". A participant reads the
scenario, laughs or says "wtf", and reads it out loud to whoever is next to
them. Anything they would forget while choosing has already failed.

THE FOUR PILLARS, and what each pole looks like:
| pillar      | positive pole                   | reversed (low) pole                  |
|-------------|---------------------------------|--------------------------------------|
| regulation  | shrugs it off, recovers fast    | spirals, catastrophises (funny)      |
| politeness  | objects to the act, not person  | roasts the person, keeps score       |
| reliability | follows through, shows up       | improvises an exit, reschedules      |
| agency      | takes the wheel, decides        | goes along with anything             |

HARD RULES — a block breaking any of these is discarded:
1. Every block loads ALL FOUR pillars, exactly one option each. Options a,b,c,d
   appear once each. A block whose options measure one pillar is invalid.
2. Exactly ONE option is reversed-keyed, and it must be the low pole of that
   block's focusPillar. That is the focusPillar's ONLY option — never add a
   second, positive option for the focusPillar; the other three options
   belong to the other three pillars, one each, all positive-keyed. Four
   options, four different pillars, one of them reversed. The reversed one
   must stay likable and funny, never villainous. Without it the form
   carries zero information about trait levels.
3. Desirability matching: if any option reads as "the obviously good answer"
   within three seconds, the block fails. Comedy is the equalizer — every
   option must be something a likable person plausibly does.
4. NON-WORK scenarios only. Never deadlines, jobs, offices, hackathons.
   Under deadline pressure "stayed calm" and "wasn't urgent" become the same
   observation, which collapses two pillars into one.
5. Safety: no substances, politics, religion, sex, mental health, or money
   shame. Nothing a person would not want screenshotted.
6. Scenario: at most two short sentences, under 220 characters.
   Options: 4 to 7 words each, at most 8 words — they render as small cards,
   and a ninth word discards the whole block. Count the words of every
   option before returning and shorten any that reaches 8.
7. Vary the structure across the blocks. Not several versions of one joke,
   and no two blocks sharing a premise, a cast, a prop or a punchline.
8. VOICE — every option, in every block, is written in the FIRST PERSON
   SINGULAR, present tense: the participant stating what they do, as a verb
   they conjugate for themselves. Never second person, never infinitives,
   never a description of the participant from outside. A form that switches
   person between blocks reads as two different questionnaires.
9. Do not put the reversed-keyed option in slot (a) every time. Move it around
   the four slots across the blocks.

TONE — the register, and the reason anyone finishes the form:
10. BIZARRO PERO COTIDIANO. Every scenario is an ordinary situation pushed one
    notch into the absurdo. The situation stays recognisable — the reader has
    almost lived it. Random nonsense is not bizarre, it is noise: if the twist
    could be swapped for any other twist without changing the scenario, it is
    not anchored and the block fails.
11. The twist is CONCRETE and NAMED — one specific thing, with its own noun,
    that the reader can picture at once. A vague "something strange happens"
    is not a twist; the strange thing itself, named, is.
12. Each position below is assigned a KIND of twist. Write that kind and no
    other for that position — the kinds are different across the blocks on
    purpose, and a batch whose blocks all turn on the same kind of twist
    counts as one block and is rejected.
13. The scenario carries the comedy; the OPTIONS stay deadpan and plausible.
    Four punchlines in a row means the reader picks the funniest one instead of
    the truest one, and the block measures nothing (see rule 3). Absurd
    premise, sane people.
14. The reversed-keyed option is the low pole told with affection — the friend
    everyone forgives. Funny, never villainous, never pathetic (rule 2).
15. Bizarre is not gross, cruel or unsafe. Rules 4 and 5 still bind: no work,
    no substances, politics, religion, sex, mental health or money shame. No
    injury, no death, no humiliation of a real-seeming person.
16. Every scenario is NEW. Nothing you have written before, nothing a
    participant could have read elsewhere in this room, and nothing under the
    headings below. Invent the specific people, places and objects for each
    block from its domain and its twist kind.`;

/**
 * Regional register, kept separate from the rules because it is the one thing
 * that changes if the room moves.
 *
 * Measured, not guessed: without this clause the model held first-person
 * Colombian Spanish for one batch and then drifted into peninsular forms —
 * "piso", "la peli", "el súper", "caradura" — in the next. A participant meets
 * both batches, twenty seconds apart.
 */
const SPANISH_REGISTER = `Neutral Latin American Spanish as spoken in Bogotá:
colloquial, warm, never formal.
TUTEO: the SCENARIO is narrated to the reader with "tú" — second person
singular, present tense, the reader as the protagonist. Never "usted", never
"vos", never "vosotros". The OPTIONS are the reader answering, so they stay in
the first person singular (rule 8), conjugated for "yo".
Do NOT use peninsular Spanish. Wrong → right: piso → apartamento · coche →
carro · móvil → celular · la peli → la película · el súper → el supermercado ·
ordenador → computador · vale/guay → listo/bacano · caradura → descarado ·
vosotros → never. Avoid slang so local it needs explaining.`;

export interface AuthorPromptInput {
  assignments: Assignment[];
  /** Neutral Spanish by default — the room is in Bogotá. */
  language: string;
  /** Scenarios this participant, or their room, has already read. */
  avoid: string[];
  /**
   * Blocks of the same batch already accepted, when the call is for the
   * positions still missing. Listed under their own heading so the model
   * knows they are its own neighbours rather than old material.
   */
  siblings?: string[];
  /** The judge's or validator's complaints about the previous attempt. */
  notes?: string[];
}

function bulleted(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * The author prompt for one call: the whole batch, or the positions still
 * missing from it.
 *
 * Five per call rather than one: the model sees its own five and so does not
 * repeat itself within a batch, which one-block-per-call cannot prevent. Blocks
 * already written for this participant — and lately for anyone in the room —
 * arrive in `avoid`; that is what stops batch 3 reusing batch 1's joke, the
 * failure the offline workflow actually hit, and what stops two neighbours
 * reading the same one.
 */
export function authorPrompt(input: AuthorPromptInput): string {
  const { assignments, language, avoid } = input;
  const siblings = input.siblings ?? [];
  const notes = input.notes ?? [];

  const table = assignments
    .map(
      (a) =>
        `- position ${a.position}: focusPillar=${a.focusPillar} ` +
        `(its one option is the reversed one; the other three pillars get one ` +
        `positive option each), domain=${a.domain}, twist=${a.twistKind}`
    )
    .join("\n");

  const avoidClause = avoid.length
    ? `\n\nThis participant has already been shown the scenarios below. Do not ` +
      `reuse their premises, their punchlines, their objects or their twists — ` +
      `a new block must surprise someone who has read all of these:\n` +
      bulleted(avoid)
    : "";

  const siblingsClause = siblings.length
    ? `\n\nThese blocks of the SAME batch are already written and accepted. ` +
      `Yours sit beside them, so they must not share a premise, a cast, a ` +
      `prop or a punchline with any of them:\n${bulleted(siblings)}`
    : "";

  const notesClause = notes.length
    ? `\n\nNOTES on the previous attempt — each one names a position that was ` +
      `rejected and why. Fix exactly what is named, and keep the rest of the ` +
      `rules:\n${bulleted(notes)}`
    : "";

  const register = language === "es" ? `\n\n${SPANISH_REGISTER}` : "";

  return `${RULES}

Write the ${assignments.length} block${assignments.length === 1 ? "" : "s"} below in ${language}.${register}

The domain is only the setting and the twist is only the kind — neither
changes the rules.

${table}${avoidClause}${siblingsClause}${notesClause}

Before returning, re-check rules 1, 2 and 6 on every block.
Return one object per position listed above, with the position echoed back.`;
}

/**
 * The judge prompt: one pass over everything written in this call.
 *
 * Deliberately sees every block at once rather than one at a time, and sees
 * the scenarios the participant has already read: the offline pipeline judged
 * per batch and shipped two blocks with the same joke, because no judge ever
 * saw both.
 */
export function judgePrompt(
  blocks: { position: number; scenario: string; options: { text: string }[] }[],
  previousScenarios: readonly string[] = []
): string {
  const rendered = blocks
    .map(
      (b) =>
        `position ${b.position}: ${b.scenario}\n` +
        b.options.map((o) => `   · ${o.text}`).join("\n")
    )
    .join("\n\n");

  const shown = previousScenarios.length
    ? `\n\nALREADY SHOWN — fail any block that repeats these, in premise, ` +
      `cast, prop, twist or punchline:\n${bulleted(previousScenarios)}`
    : "";

  return `You are the desirability judge for forced-choice quiz blocks.

Fail a block if ANY of these is true:
- the scenario is plain or predictable — no twist a reader would repeat to a
  friend. An ordinary day with an ordinary complication is a failure here, even
  when everything else about the block is correct
- the twist is random rather than anchored in a recognisable everyday
  situation — surreal for its own sake, or a twist that could be swapped for
  any other twist without changing the scenario
- an option reads as the obviously flattering "good answer" within 3 seconds
- the reversed-keyed option is villainous rather than likable-funny
- the scenario is work, deadline or job flavoured
- it touches substances, politics, religion, sex, mental health or money shame
- the humor is flat or mean-spirited
- any option runs past ~8 words
- it repeats another block's premise, punchline, object or kind of twist
- it repeats anything under ALREADY SHOWN

List concrete problems for every failure — they are handed to the author
verbatim, so "make it funnier" is useless. Name what is missing (which rule,
which element of the scenario) and what would have to change, without writing
the replacement scenario yourself. Judge all blocks together — repetition
across blocks is the failure you are best placed to catch.

BLOCKS:
${rendered}${shown}`;
}

export const verdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      position: z.int().min(1).max(15),
      pass: z.boolean(),
      problems: z.array(z.string()),
    })
  ),
});

export type Verdicts = z.infer<typeof verdictsSchema>;
