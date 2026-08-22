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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
