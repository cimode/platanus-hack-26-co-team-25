# Project Skills & Workflows

## Skills

- **quest-skill** (`.claude/skills/quest-skill/SKILL.md`) — Author one funny 4-option
  forced-choice quiz block loading all four pillars (Regulation, Politeness,
  Reliability, Agency), with exactly one reversed-keyed option on the focus pillar,
  plus per-option image prompts (centered bold caption cards). Trigger: quiz question,
  forced-choice block, question authoring, image prompts for options.

## Workflows

- **create_quest** (`.claude/workflows/create_quest.js`) — Generates the full 15-block
  quiz in 3 delivered batches (5 questions + 20 image prompts each) via quest-skill:
  author → desirability judge → repair → persist to `quiz/batch-N.json`, batch by
  batch so results land progressively. Args: `{ language?: 'es', imagesPerQuestion?: 4,
  outDir?: string }`. The reversed-keyed slot rotates across pillars (4/4/4/3 over 15
  blocks); every pillar appears in every block by design — see `PILLARS.md` §7.2/§8.
