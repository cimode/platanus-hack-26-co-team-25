# Project Skills & Workflows

## Skills

- **quest-skill** (`.claude/skills/quest-skill/SKILL.md`) — Author one funny 4-option
  forced-choice quiz block loading all four pillars (Regulation, Politeness,
  Reliability, Agency), with exactly one reversed-keyed option on the focus pillar,
  plus per-option image prompts (centered bold caption cards). Trigger: quiz question,
  forced-choice block, question authoring, image prompts for options.
- **neon-object-storage** (`.claude/skills/neon-object-storage/SKILL.md`) — Neon Object
  Storage, vendored verbatim from `neondatabase/agent-skills`: `neon.ts` buckets,
  `neon deploy` / `neon env pull`, the `AWS_*` env, path-style S3 access. Trigger:
  object storage, bucket, photo upload, S3, presigned URL, `AWS_ENDPOINT_URL_S3`.

## Workflows

- **create_emotes** (`.claude/workflows/create_emotes.js`) — The whole catalogue at
  once: for every avatar in parallel, `pnpm emotes:generate-many` (concurrency-capped
  batch through the AI Gateway, polled from a summary file) → a judge agent reads every
  contact sheet and picks clip, start and trim → one regeneration round for what failed
  → `pnpm emotes:pack --floor strip` per winner. Args: `{ avatars?, emotions?, skip?:
  { avatar2: ["celebrate"] }, concurrency?: 4, tag?: "v2" }`. 12 emotes × 4 avatars ≈
  48 clips; budget an hour and the gateway credit for it. Ends with
  `pnpm emotes:normalize`, which pads every one-shot to one length per emote across
  avatars (`emotes.test.ts` enforces it).
- **create_emote** (`.claude/workflows/create_emote.js`) — Generates one reaction
  (celebrate / wave / cry / walk / angry / fight / defeat / love) for every avatar: image-to-video attempts through
  the AI Gateway → a judge agent reads the contact sheets → chroma key, pixelize,
  spritesheet → `public/sprites/emotes/<avatar>/<emote>.webp` (lossless) + manifest. Args:
  `{ emotion, avatars?, attempts?: 2, model? }`. Needs `AI_GATEWAY_API_KEY` in
  `.env`. The deterministic halves are plain scripts: `pnpm emotes:generate` and
  `pnpm emotes:pack` (`scripts/emotes/`). Runtime library:
  `src/components/emotes/` (`AvatarSprite`, `useEmotePlayer`, `useParticipantEmotes`,
  `reactToEvent`; README there) over the domain catalogue `src/lib/domain/emotes/`;
  playable reference at `/design/emotes`.

- **create_quest** (`.claude/workflows/create_quest.js`) — ⚠️ **Not what the app serves.**
  It authors blocks in 3 delivered batches (5 questions + 20 image prompts each) via
  quest-skill — author → desirability judge → repair → persist to `quiz/batch-N.json`.
  Since `docs/domain.md` **D21** the deployed form is the committed bank: 400 blocks in
  `quiz/bank/*.json`, merged and validated offline by `node scripts/quiz-bank/merge.mjs`
  (`docs/quiz-generation.md`), from which `formFor(participantId)` deals each participant
  twelve. Nothing generates at request time. Use this workflow to DRAFT candidates — write
  them into `quiz/bank/.parts/` and run the merge — not to produce a form. Args: `{
  language?: 'es', imagesPerQuestion?: 4, outDir?: string }`. Every pillar appears in every
  block by design, with exactly one reversed-keyed option on the focus pillar — see
  `PILLARS.md` §7.2/§8.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
