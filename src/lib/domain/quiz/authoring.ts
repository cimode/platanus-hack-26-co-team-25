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
export const authoredBlockSchema = z.object({
  position: z.int().min(1).max(15),
  scenario: z.string().min(10).max(220),
  options: z
    .array(
      z.object({
        key: z.enum(["a", "b", "c", "d"]),
        text: z.string().min(2).max(60),
        pillar: z.enum(["regulation", "politeness", "reliability", "agency"]),
        keyed: z.enum(["positive", "reversed"]),
      })
    )
    .length(4),
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

/** Scenario: at most two short sentences. Option: at most eight words. */
const MAX_SENTENCES = 2;
const MAX_OPTION_WORDS = 8;

export type AuthoredBlock = z.infer<typeof authoredBlockSchema>;

/** The length complaint about a scenario, worded for the repair prompt. */
function scenarioProblem(block: AuthoredBlock): string | null {
  const sentences = sentenceCount(block.scenario);
  if (sentences <= MAX_SENTENCES) return null;
  return (
    `position ${block.position}: the scenario has ${sentences} ` +
    `sentences; the limit is ${MAX_SENTENCES} short sentences`
  );
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
 * batch a fallback — which is what enforcing the same rule at the batch
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
 * The batch's shape alone — what the model is asked to produce. The length
 * limits are applied per block by the author loop via `authoredBlockProblem`.
 */
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
7. Vary the structure across the five blocks. Not five versions of one joke,
   and no two blocks sharing a premise.
8. VOICE — every option, in every block, is written in the FIRST PERSON
   SINGULAR, present tense: "Entro en pánico", "Me río y sigo", "Prometo
   llegar". Never second person ("te ríes", "aguantas"), never infinitives.
   The participant is describing themselves, and a form that switches person
   between blocks reads as two different questionnaires.
9. Do not put the reversed-keyed option in slot (a) every time. Move it around
   the four slots across the five blocks.

TONE — the register, and the reason anyone finishes the form:
10. BIZARRO PERO COTIDIANO. Every scenario is an ordinary situation pushed one
    notch into the absurdo: an object that should not be there, a creature
    behaving impossibly, a coincidence nobody planned, or an escalation that
    got away from everyone. The situation stays recognisable — the reader has
    almost lived it. Random nonsense is not bizarre, it is noise: if the twist
    could be swapped for any other twist without changing the scenario, it is
    not anchored and the block fails.
11. The twist is CONCRETE and NAMED — one thing the reader can picture. "pasa
    algo raro" is not a twist; "el loro del vecino aprendió tu tono de alarma"
    is.
12. Every one of the five blocks uses a DIFFERENT KIND of twist (object /
    creature / coincidence / escalation / mistaken identity ...). Five
    variations of one joke count as one block, and the batch is rejected.
13. The scenario carries the comedy; the OPTIONS stay deadpan and plausible.
    Four punchlines in a row means the reader picks the funniest one instead of
    the truest one, and the block measures nothing (see rule 3). Absurd
    premise, sane people.
14. The reversed-keyed option is the low pole told with affection — the friend
    everyone forgives. Funny, never villainous, never pathetic (rule 2).
15. Bizarre is not gross, cruel or unsafe. Rules 4 and 5 still bind: no work,
    no substances, politics, religion, sex, mental health or money shame. No
    injury, no death, no humiliation of a real-seeming person.`;

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
TUTEO: the SCENARIO is narrated to the reader with "tú" ("Llegas a la fiesta y
tu vecino ..."). Never "usted", never "vos", never "vosotros". The OPTIONS are
the reader answering, so they stay in the first person singular (rule 8) —
"Entro en pánico", never "Entras en pánico".
Do NOT use peninsular Spanish. Wrong → right: piso → apartamento · coche →
carro · móvil → celular · la peli → la película · el súper → el supermercado ·
ordenador → computador · vale/guay → listo/bacano · caradura → descarado ·
vosotros → never. Avoid slang so local it needs explaining.`;

export interface AuthorPromptInput {
  assignments: Assignment[];
  /** Neutral Spanish by default — the room is in Bogotá. */
  language: string;
  /** Scenarios already written for this participant, to avoid repeating them. */
  avoid: string[];
}

/**
 * The author prompt for one batch of five blocks.
 *
 * Five per call rather than one: the model sees its own five and so does not
 * repeat itself within a batch, which one-block-per-call cannot prevent. Blocks
 * already written for this participant arrive in `avoid` — that is what stops
 * batch 3 reusing batch 1's joke, the failure the offline workflow actually hit.
 */
export function authorPrompt(input: AuthorPromptInput): string {
  const { assignments, language, avoid } = input;

  const table = assignments
    .map(
      (a) =>
        `- position ${a.position}: focusPillar=${a.focusPillar} ` +
        `(its one option is the reversed one; the other three pillars get one ` +
        `positive option each), domain=${a.domain}`
    )
    .join("\n");

  const avoidClause = avoid.length
    ? `\n\nThis participant has already been shown the scenarios below. Do not ` +
      `reuse their premises, their punchlines, their objects or their twists — ` +
      `a new block must surprise someone who has read all of these:\n` +
      avoid.map((s) => `- ${s}`).join("\n")
    : "";

  const register = language === "es" ? `\n\n${SPANISH_REGISTER}` : "";

  return `${RULES}

Write the ${assignments.length} blocks below in ${language}.${register}

The domain is only the setting — it does not change the rules.

${table}${avoidClause}

Before returning, re-check rules 1, 2 and 6 on every block.
Return one object per position, with the position echoed back.`;
}

/**
 * The judge prompt: one pass over everything written for this participant.
 *
 * Deliberately sees every block at once rather than one batch at a time. The
 * offline pipeline judged per batch and shipped two blocks with the same joke,
 * because no judge ever saw both.
 */
export function judgePrompt(
  blocks: { position: number; scenario: string; options: { text: string }[] }[]
): string {
  const rendered = blocks
    .map(
      (b) =>
        `position ${b.position}: ${b.scenario}\n` +
        b.options.map((o) => `   · ${o.text}`).join("\n")
    )
    .join("\n\n");

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

List concrete problems for every failure — they are handed to the author
verbatim, so "make it funnier" is useless and "the twist is just a late bus,
name a stranger thing that happens on that bus" is not. Judge all blocks
together — repetition across blocks is the failure you are best placed to
catch.

BLOCKS:
${rendered}`;
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
