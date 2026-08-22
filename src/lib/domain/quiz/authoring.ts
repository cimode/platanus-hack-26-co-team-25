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

export const authoredBatchSchema = z.object({
  blocks: z.array(authoredBlockSchema).length(5),
});

export type AuthoredBatch = z.infer<typeof authoredBatchSchema>;

/** The rules, as the model receives them. Edit here, nowhere else. */
const RULES = `You author blocks for a forced-choice compatibility instrument.
A block is a short, funny, everyday "what would you do?" scenario with exactly
four options.

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
   block's focusPillar. It must stay likable and funny, never villainous.
   Without it the form carries zero information about trait levels.
3. Desirability matching: if any option reads as "the obviously good answer"
   within three seconds, the block fails. Comedy is the equalizer — every
   option must be something a likable person plausibly does.
4. NON-WORK scenarios only. Never deadlines, jobs, offices, hackathons.
   Under deadline pressure "stayed calm" and "wasn't urgent" become the same
   observation, which collapses two pillars into one.
5. Safety: no substances, politics, religion, sex, mental health, or money
   shame. Nothing a person would not want screenshotted.
6. Scenario: at most two short sentences, under 220 characters.
   Options: at most 8 words each — they render as small cards.
7. Vary the structure across the five blocks. Not five versions of one joke,
   and no two blocks sharing a premise.
8. VOICE — every option, in every block, is written in the FIRST PERSON
   SINGULAR, present tense: "Entro en pánico", "Me río y sigo", "Prometo
   llegar". Never second person ("te ríes", "aguantas"), never infinitives.
   The participant is describing themselves, and a form that switches person
   between blocks reads as two different questionnaires.
9. Do not put the reversed-keyed option in slot (a) every time. Move it around
   the four slots across the five blocks.`;

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
colloquial, warm, never formal. Use "tú"-free first-person phrasing (rule 8).
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
        `(its LOW pole is the reversed option), domain=${a.domain}`
    )
    .join("\n");

  const avoidClause = avoid.length
    ? `\n\nThis participant has already been shown the scenarios below. Do not ` +
      `reuse their premises, their punchlines or their objects:\n` +
      avoid.map((s) => `- ${s}`).join("\n")
    : "";

  const register = language === "es" ? `\n\n${SPANISH_REGISTER}` : "";

  return `${RULES}

Write the ${assignments.length} blocks below in ${language}.${register}

The domain is only the setting — it does not change the rules.

${table}${avoidClause}

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
- an option reads as the obviously flattering "good answer" within 3 seconds
- the reversed-keyed option is villainous rather than likable-funny
- the scenario is work, deadline or job flavoured
- it touches substances, politics, religion, sex, mental health or money shame
- the humor is flat or mean-spirited
- any option runs past ~8 words
- it repeats another block's premise, punchline or object

List concrete problems for every failure. Judge all blocks together — repetition
across blocks is the failure you are best placed to catch.

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
