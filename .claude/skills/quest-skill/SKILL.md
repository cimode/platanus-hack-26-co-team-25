---
name: quest-skill
description: "Trigger: quiz question, forced-choice block, quest question, question authoring, image prompts for options. Author one funny 4-option forced-choice block loading all four pillars, plus per-option image prompts."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Author ONE quiz block for the compatibility instrument: a short, BIZARRO-but-everyday
"what would you do?" scenario with exactly 4 options — one option per pillar
(Regulation, Politeness, Reliability, Agency) — plus one image prompt per option.
Input: `focusPillar` (which pillar is reversed-keyed + scenario flavor), `index`,
`domain`, `language` (default `es`, neutral Spanish), `imagesPerQuestion` (default 4),
`styleToken`.

## Hard Rules

- Every block loads ALL FOUR pillars, one option each. A block whose options all
  measure one pillar is invalid (`PILLARS.md` §5, A5).
- Exactly ONE option is reversed-keyed — the low pole of `focusPillar` — and it must
  stay likable and funny, never villainous (`AUDIT.md` F1: without reversed keying the
  form carries zero information about trait levels).
- Desirability matching: if any option reads as "the good answer" in 3 seconds, the
  block fails. Comedy is the equalizer — every option must be something a likable
  person plausibly does.
- Non-work scenarios ONLY: food, travel, pets, friends, family, parties, neighbors,
  small everyday chaos. Never deadlines, jobs, hackathons ("stayed calm" ≡ "wasn't
  urgent" collapses Regulation×Reliability — `PILLARS.md` fatal #2).
- Safety (A7/A8): no substances, politics, religion, sex, mental health, money shame.
  Nothing a person wouldn't want screenshotted.
- Scenario ≤ 2 short sentences. Options ≤ 8 words (they render on image cards).

## Tone contract

Identical to the live prompt in `src/lib/domain/quiz/authoring.ts` (rules 10–15).
That file wins on any disagreement; this section exists so offline authoring and
the fallback set read like the generated ones.

- **Bizarro pero cotidiano.** The scenario is an ordinary situation pushed one
  notch into the absurd: an object that should not be there, a creature behaving
  impossibly, a coincidence nobody planned, an escalation that got away. The
  situation stays recognisable — the reader has almost lived it.
- **The bar:** the reader laughs or says *wtf*, and repeats it to whoever is next
  to them. A scenario nobody would repeat has failed, however correct it is.
- **Anchored, not random.** If the twist could be swapped for any other twist
  without changing the scenario, it is noise, not comedy. Name one concrete
  thing the reader can picture — "pasa algo raro" is not a twist.
- **Vary the kind of twist** across blocks (object / creature / coincidence /
  escalation / mistaken identity …). Five variations of one joke count as one.
- **Absurd premise, sane people.** The scenario carries the comedy; the four
  options stay deadpan and plausible. Four punchlines and the reader picks the
  funniest instead of the truest, which measures nothing.
- **Register:** neutral Latin-American Spanish (Bogotá), scenario narrated in
  **tuteo** ("Llegas a …"), options in the first person singular ("Entro en
  pánico"). No peninsular Spanish, no "usted", no "vos", no "vosotros".
- Bizarre is never gross, cruel or unsafe: the non-work rule and the A7/A8 list
  above still bind, and no injury, death or humiliation.
- Image prompts: one per option, `styleToken` + scene depicting the option + the
  option text VERBATIM as large centered bold caption, high contrast, no other text.
  If `imagesPerQuestion` = 5, add a scenario cover card with the question text.

## Pillar → option cheat sheet

| Pillar | Positive pole shows | Reversed pole shows |
|---|---|---|
| Regulation | shrugs it off, recovers fast | spirals, catastrophizes (funny) |
| Politeness | objects to the act, not the person | roasts the person, keeps score |
| Reliability | follows through, shows up anyway | improvises an exit, reschedules forever |
| Agency | takes the wheel, decides | goes along with anything |

## Output Contract

Return ONLY JSON matching `assets/block-schema.json`. One worked gold-standard
example: `assets/example-block.json`. Set `keyed:"reversed"` on exactly one option
(the `focusPillar` one); `pillar` values are `regulation|politeness|reliability|agency`,
each appearing exactly once.

## References

- `assets/block-schema.json` — output JSON Schema (validate against it)
- `assets/example-block.json` — gold-standard example block
- `../../../PILLARS.md` §2, §7.2, §8 — the four latents, keying mandate, build rules
