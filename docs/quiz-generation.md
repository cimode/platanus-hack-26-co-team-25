# Generating the quiz on demand

Plan for moving block authoring out of `.claude/workflows/create_quest.js` and
into the deployed app, triggered when a participant starts the intake form.

> ## ⚠ Status: **largely superseded, 2026-08-22**
>
> The user confirmed `docs/domain.md` **D1/D2** (fixed instrument as a domain
> constant) and added **D14** (option cards are text, not images). That kills
> this document's central design. Read `docs/domain.md` first — it wins.
>
> **Dead here:** §4 `quiz_specs`/`quiz_blocks` tables and the unique-index lock ·
> §5 the `after()` trigger on form start · §6 the seed-and-promote flow ·
> §12's image-generation paragraph. There is no request-time generation and no
> database-backed quiz; `src/lib/domain/quiz/instrument.ts` builds the 15
> committed blocks at import and a pinned hash freezes them.
>
> **Still good:** §1 the prompt-drift trap (the rules must be inlined, and
> `prompts.ts` should own them) · §2's SDK reasoning, now settled as AI SDK v6
> through AI Gateway · §3 the pipeline shape, especially **one judge over all
> 15** rather than per batch — the fix for the `b2-d`/`b10-b` duplicate ·
> §7 the latency and cost analysis · §8 security · §9 testing, including the
> `LlmPort` `system`/`hashPrompt` gap · §10 retiring the workflow in favour of a
> CLI driver.
>
> What survives is an **offline authoring CLI** that produces a *new versioned
> instrument* for a human to review and commit — never a request-time path.
> Images are out entirely, so the pipeline is text-only, which is why §7's
> numbers now describe the whole job rather than a fraction of it.

---

## A. Reading a batch by hand — and what "bizarre" means here

*Live section, added 2026-08-22 (#43). Everything below §0 is the superseded
plan; this part describes what is deployed.*

```
pnpm run quiz:smoke                 # participant "smoke-participant-1", batch 1
pnpm run quiz:smoke -- alice 2      # any participant id, any batch 1..3
```

It authors one real batch through AI Gateway and prints the five blocks with, for
each option, its pillar and its keying (`◀` marks the single reversed-keyed
option — the focus pillar's low pole). It needs `AI_GATEWAY_API_KEY` in `.env`
and is run **by hand, never in CI**: it spends tokens and its output is a
judgement call, not an assertion. The unit tests cover everything that can be
asserted.

### What you are looking for

The user's brief, verbatim: *"add a touch of more bizarreness while keeping the
end goal of getting the behavioral data we need; the goal with the questions is
that people read them, laugh and say wtf."* So read each block twice.

**First as a participant.** The scenario is an everyday situation pushed one
notch into the absurd — an object that should not be there, a creature behaving
impossibly, a coincidence nobody planned, an escalation that got away. It should
land in two short sentences and make you want to read it out loud. Two failures
to watch for, and they are opposite:

| Failure | Looks like | Why it is a failure |
| --- | --- | --- |
| **Plain** | an ordinary day with an ordinary complication | nobody repeats it to a friend, and a form nobody enjoys is a form nobody finishes |
| **Random** | surrealism with no everyday anchor | the reader has no situation to answer *about*, so the answer stops being behavioural |

The test for "random": could the twist be swapped for any other twist without
changing the scenario? Then it is decoration, not comedy.

**Then as the instrument.** The comedy lives in the *scenario*; the four options
stay deadpan and plausible. If one option is visibly the funniest, people pick
the funniest instead of the truest and the block measures nothing — the same
failure mode as one option being visibly the *nicest*. Check the printout for
four distinct pillars, exactly one `◀`, and options of eight words or fewer.

### Where the rules live

`src/lib/domain/quiz/authoring.ts` is the single source: `RULES` (structure 1–9,
tone 10–15), `SPANISH_REGISTER` (Bogotá neutral, tuteo in the scenario,
first person in the options), `judgePrompt` (the criteria that reject a block,
including *plain or predictable* and *random rather than anchored*), and
`authoredBatchSchema` — which enforces the two-sentence and eight-word limits as
a schema, because a tone instruction is a request and a schema is a refusal.
`.claude/skills/quest-skill/SKILL.md` restates the tone contract for offline
authoring and defers to this file on any disagreement.

The pipeline is author → judge → repair → fallback (`generate-quiz-batch.ts`).
A block the judge rejects is re-authored with the judge's own words quoted back
at it; a block that is still structurally invalid after that is served from the
committed `INSTRUMENT` (still `v1` — regenerating it bumps the structural
version and is a separate decision).

---

## 0. The one thing that must be decided first

"On demand, when the user starts the form" has two readings, and they are not
the same product.

| Reading | What it means | Verdict |
| --- | --- | --- |
| **A. Per participant** | Every person gets 15 freshly authored blocks | ❌ do not build |
| **B. Per form version** | The first person to hit a cold form triggers one generation; everyone else reads it | ✅ this plan |

Reading A destroys the instrument. `PILLARS.md` §7.2 rests the entire precision
claim on a **fixed balanced form**: fifteen authored blocks administered as
fifteen blocks, every latent loading in 15 of 15, every latent *pair*
co-occurring in all 15. That argument is what licenses comparing two people —
and it evaporates the moment two people answer different items. §8 rule 2 makes
it worse: band cutoffs are fixed a-priori on the latent scale and frozen before
the first response. Cutoffs derived for one form cannot band a different one.
Per-participant generation would also put unreviewed text in front of ~100
people with no A7/A8 safety pass, and would need 60 fresh images per person.

Reading B keeps every guarantee and still satisfies the ask literally: the
trigger *is* a user starting the form. It is just deduplicated, so N
participants cause at most one generation.

**Everything below assumes B.** If you want A anyway, the switch is one line
(derive the spec key from the session id instead of the form version) — but the
ranking claim has to come out of the pitch at the same time.

---

## 1. What actually moves

The workflow is not portable code. `agent()` is a Claude Code harness
primitive; there is no filesystem, no `Date.now()`, no imports. So this is a
**reimplementation against `LlmPort`**, not a file move. Four things carry over:

| In the workflow | Where it lands | Note |
| --- | --- | --- |
| `PILLARS` / `DOMAINS` / `ASSIGNMENTS` | `src/lib/domain/quiz/form.ts` | pure data, the fixed balanced design |
| `structuralProblems()` | `src/lib/domain/quiz/validate.ts` | pure, becomes the first unit-tested thing |
| `BLOCK`/`BATCH`/`VERDICTS` JSON Schemas | `src/lib/domain/quiz/block.ts` | rewritten as zod 4 — `LlmPort` takes `z.ZodType<T>` |
| `authorPrompt` / judge / repair prompts | `src/lib/domain/quiz/prompts.ts` | see the drift warning below |

### The prompt-drift trap

The workflow's prompts say *"read and follow `.claude/skills/quest-skill/SKILL.md`"*
and *"read `PILLARS.md` §2 and §8"*. A serverless function cannot read either.
Those rules have to be **inlined as string constants** in `prompts.ts`.

That creates two copies of the instrument's rules, and they will drift within a
day. Pick one owner now:

- **Recommended:** `prompts.ts` becomes authoritative. `quest-skill/SKILL.md`
  shrinks to a pointer at it, so an agent asked to author a block by hand reads
  the same text the function sends.
- Alternative: keep SKILL.md authoritative and inline it at build time. More
  machinery than a hackathon should carry.

Same call for the `PILLARS.md` §2/§8 excerpt: one constant, cited by section, in
`prompts.ts`.

---

## 2. Shape

Everything obeys `docs/architecture.md`. `biome.json` will enforce most of it.

```
src/lib/
├─ domain/quiz/
│  ├─ form.ts          PILLARS, DOMAINS, ASSIGNMENTS, specKey()
│  ├─ block.ts         zod: Block, Option, ImagePrompt + domain types
│  ├─ validate.ts      structuralProblems() — pure, unit-tested
│  └─ prompts.ts       author / judge / repair prompt builders (pure strings)
├─ ports/
│  ├─ llm.ts           exists
│  └─ quiz-spec-repository.ts   NEW
├─ use-cases/quiz/
│  ├─ ensure-quiz-spec.ts       the trigger — fast, always
│  └─ generate-quiz-spec.ts     the pipeline — slow, background
├─ adapters/
│  ├─ llm/anthropic.ts          NEW — the real LlmPort
│  └─ db/quiz-spec-repository.ts NEW — drizzle impl
│  └─ db/schema/quiz.ts         NEW — tables
└─ composition.ts               widen serverDeps() to include llm

src/app/
├─ intake/actions.ts   startIntakeAction — server action, the trigger
└─ api/quiz/generate/route.ts   secret-guarded, for warm-on-deploy + retries

scripts/quiz-generate.mjs        CLI driver — same use case, writes quiz/*.json
```

`composition.ts` already anticipates this in a comment: *"When
`adapters/llm/anthropic.ts` lands, widen this to `Deps`."* This is that.

### Which SDK

`biome.json` blocks `@anthropic-ai/**` inside the hexagon, which implies the
Anthropic SDK was the assumption. I would use **AI SDK v6 through Vercel AI
Gateway** instead:

- `generateObject({ schema })` is the exact signature `LlmPort.generate` already
  has — zod in, validated value out. With the raw SDK you hand-roll tool-use to
  get structured output.
- The gateway gives retries, fallbacks and per-call observability for free, and
  on Vercel it authenticates by OIDC, so **no API key in production env**.
- Model is a string (`"anthropic/claude-sonnet-5"`), so swapping is config.

Either way: **add `ai` and `@ai-sdk/**` to `biome.json`'s restricted-import
patterns.** Today a use case could import the AI SDK and lint would wave it
through — a real gap in the guardrail.

---

## 3. The pipeline

The workflow ran three batches **sequentially** so results landed progressively
in a terminal. A function has no terminal, and that sequencing is exactly what
caused the known bug: the per-batch judge could not see other batches, so
`b2-d` and `b10-b` shipped the same joke. Restructure:

```
              ┌ author batch 1 (blocks 1–5)  ┐
  claim lock ─┼ author batch 2 (blocks 6–10) ┼→ judge ALL 15 ─→ repair failures ─→ validate ─→ persist
              └ author batch 3 (blocks 11–15)┘   (1 call)        (parallel)        (pure)
```

- **Author, 3 calls in parallel.** Five blocks per call keeps the model aware of
  its own five, which is what stops intra-batch repetition. Each call gets the
  full 15-row assignment table so it knows what the other two are covering. The
  15 domains are already disjoint.
- **Judge, one call over all 15.** This is the fix. Same criteria as the
  workflow's judge — desirability, A7/A8 safety, non-work scenarios, ≤8-word
  options, likable-not-villainous reversed option — **plus cross-block premise
  and punchline duplication**, which was previously unobservable.
- **Repair in parallel**, one call per failed block, given its failure notes.
- **Validate** with `structuralProblems()` — pure, free, and the last line of
  defence for the properties that actually matter: all four pillars once each,
  exactly one reversed option, and it must be the focus pillar.
- **Persist** each validated block as it lands, not at the end. That is what
  makes a crashed run resumable.

Estimated wall clock ~65s; see §7.

**One structural rule the pipeline must not be allowed to relax:** if a block
fails `structuralProblems()` after repair, it is dropped and the spec is marked
`degraded`, never persisted as-is. A block with two reversed options or a missing
pillar is worse than a missing block — it silently corrupts scoring, and
`AUDIT.md` F1 is explicit that keying is irreversible once the form ships.

---

## 4. Persistence

Two tables in `src/lib/adapters/db/schema/quiz.ts`, re-exported from the barrel.
Following the `data-access` skill: uuid PKs (`uuidv7()` default), derived
`drizzle-zod` insert schemas, and **`db.batch()` never `db.transaction()`** —
the neon-http driver throws on the latter.

```
quiz_specs
  id            uuid pk default uuidv7()
  spec_key      text UNIQUE          ← the dedup key AND the lock
  status        enum(pending|ready|degraded|failed)
  language      text
  style_token   text
  model         text
  prompt_hash   text                 ← hashPrompt() over the author prompt
  claimed_at    timestamptz          ← stale-lock takeover reads this
  ready_at      timestamptz
  error         text

quiz_blocks
  id            uuid pk
  spec_id       uuid → quiz_specs.id
  ordinal       int                  ← 1..15
  focus_pillar  text
  domain        text
  payload       jsonb                ← the validated Block, zod-checked on read
  UNIQUE (spec_id, ordinal)          ← makes per-block persistence idempotent
```

`payload` as jsonb rather than fully normalised columns is deliberate: the shape
is already pinned by zod and by `structuralProblems()`, the scoring engine reads
whole blocks anyway, and normalising options into their own table buys nothing
before there is a scorer. Query-relevant fields are lifted out as columns.

### The lock is a unique index

No Redis, no advisory lock, one statement — which matters because neon-http
gives no interactive transactions:

```ts
const [claimed] = await db.insert(quizSpecs)
  .values({ specKey, status: "pending", claimedAt: sql`now()` })
  .onConflictDoNothing()
  .returning({ id: quizSpecs.id });
// claimed === undefined  →  someone else is generating. Read, don't generate.
```

Stale takeover, also one statement, for the run that died mid-flight:

```sql
UPDATE quiz_specs SET claimed_at = now()
 WHERE spec_key = $1 AND status = 'pending' AND claimed_at < now() - interval '5 minutes'
 RETURNING id
```

Combined with per-block `onConflictDoNothing`, a resumed run re-authors only the
ordinals that are missing.

### `spec_key` is server-derived, always

```
specKey = hash(ASSIGNMENTS, language, styleToken, promptVersion, model)
```

No user input touches it. This is the whole abuse story (§8): a public endpoint
that spends model tokens is only safe because the number of distinct keys is
fixed by the deploy, not by the caller.

### Responses pin their spec

`intake_responses.spec_id` is not optional. If a new spec goes ready mid-event,
answers must still be attributable to the blocks they were shown, or scoring
mixes two instruments. For the same reason the **session pins its spec at
start** and never swaps mid-form — a participant on block 9 does not get blocks
10–15 from a newer spec.

---

## 5. Serverless mechanics

### The trigger

A **server action**, not a page render. `ui-composition` §2 puts mutations in
actions, and "user starts the form" is an explicit event rather than a render —
so it is uncached, and `after()` is documented to work there with request APIs
available (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`).

```ts
// src/app/intake/actions.ts
export async function startIntakeAction() {
  const spec = await ensureQuizSpec(serverDeps());   // fast: read, or claim
  if (spec.status === "claimed") {
    after(() => generateQuizSpec(spec.id, serverDeps()));  // ~65s, off the response
  }
  return spec.blocks;   // ready spec, or the seed — never a spinner
}
```

`after` runs after the response is sent, inside the same invocation, bounded by
the route's `maxDuration`. It also runs **even when the response threw**, which
is why the lock needs the stale-takeover path rather than a `finally`.

`export const maxDuration = 120` goes on `src/app/intake/page.tsx` — the
`maxDuration` doc is explicit that server actions take the *page's* value. 120
is deliberately under every plan's ceiling; `docs/ci.md` flags that the Hobby
number has moved more than once and was never confirmed. Do not design against
a ceiling you have not measured.

### Why not a self-fetch to a generate route

Tempting, and it has two sharp edges. `after(() => fetch(...))` **awaits** the
returned promise, so the action's invocation stays alive for the whole
generation anyway — nothing is gained. And on preview deployments the
self-fetch gets 401'd by deployment protection unless it carries
`VERCEL_AUTOMATION_BYPASS_SECRET`. Doing the work directly in `after()` avoids
both.

`POST /api/quiz/generate` still exists, but for the *other* callers: warm-on-
deploy and manual re-generation. Guarded by a bearer secret, `maxDuration = 300`,
same use case underneath.

### Runtime

Node, the default. Not edge — the Vercel guidance in this repo's session context
is explicit that edge is inferior here, and Fluid Compute reuses instances so
the memoised `getDb()` handle survives across requests.

### The upgrade path

If generation needs real durability — retries, dead-letter, survives a redeploy
mid-run — that is **Vercel Queues**. It is the right answer and it is not worth
it in 36 hours: per-block persistence plus stale-lock takeover already makes a
crashed run self-heal on the next form start.

---

## 6. Seed the form, or the demo has a cold start

`quiz/batch-{1,2,3}.json` already hold 15 authored, judged, human-reviewed
blocks — **and 60 generated images**. Seed them as spec v1.

This is the difference between a demo that always works and one that gambles:

- Cold path with a seed: participant sees the reviewed form instantly;
  generation produces the *next* spec in the background and nobody waits.
- Cold path without a seed: participant waits ~65s, or the form has to stream
  blocks in as they land.

There is a second reason, and it is the honest limitation of this whole plan:
**a newly generated block has image prompts but no images.** Generating 60
images is a separate pipeline (out of scope, §10). So freshly generated blocks
render as text-only cards, which is visibly worse than the seeded ones.

That argues for one more piece of the design: **generated specs land as
`ready` but not `active`.** A human (or a `quiz:promote` script) flips the
active pointer once the images exist. On-demand generation then means "the
product keeps a fresh candidate form warm", not "participants get unreviewed
text". If you would rather ship generated blocks straight to users, drop the
promote step — it is one column — and accept text-only cards.

---

## 7. Cost and latency

Estimates, not measurements — no API credential is configured yet, so nothing
here has been timed. Per block: ~3k input (rules + assignment table +
avoid-list), ~600–700 output (scenario, 4 options, 4 image prompts, JSON
overhead).

| Stage | Calls | Output tokens | Wall clock |
| --- | --- | --- | --- |
| Author | 3 parallel, 5 blocks each | ~3.5k each | ~50s |
| Judge | 1 over all 15 | ~600 | ~10s |
| Repair | 0–3 parallel | ~700 each | ~12s |
| Persist + overhead | | | ~3s |
| **Total** | **5–8 calls** | | **~75s** (range 60–120s) |

It is **output-token-bound**, not call-bound — the three author calls run
concurrently, so adding a fourth stage costs less than making the image prompts
one sentence longer.

Roughly 60k input / 15k output per full form → **well under $1** on Sonnet
pricing, and the spec-key dedup means it happens about once per deploy that
changes the prompt. Cost is not a reason to avoid the on-demand trigger.
Measure both columns on the first real run and correct this table.

### Why this is ~40× faster than the workflow

A full `create_quest` run takes about an hour. Almost none of that is the model
writing blocks:

| | Workflow | Function |
| --- | --- | --- |
| Agent spawns | 9–12 (author/judge/repair/persist × 3 batches) | 0 |
| Per-spawn prefill | full system prompt + tool schemas, every time | none |
| File reads before writing anything | SKILL.md, block-schema.json, example-block.json, PILLARS.md — 4+ tool round trips per author, each resending the conversation | 0 — the rules are string constants |
| Batch scheduling | strictly sequential (`for` loop with awaits) | 3 authors in parallel |
| Persistence | a whole extra agent per batch, to write one file | one `db.batch()` |
| **Wall clock** | **~1h** | **~75s** |

The hour is agent scaffolding, not authoring. Two honest caveats:

- **The user never waits for any of it.** Generation runs in `after()` behind a
  seeded form (§6), so perceived latency is zero. The 75s only matters on a
  cold path with no seed, and for how fast the team can iterate.
- **Deliberation drops.** Those subagents read the full skill, the gold-standard
  example and PILLARS before writing; one API call with inlined rules has the
  same information but less thinking time. The judge→repair loop is what
  replaces it — keep it. If quality slips, turn on extended thinking for the
  author call: still ~10× faster than the workflow.

The iteration win is the real one. Tuning question quality goes from *run it,
wait an hour, read the output* to `npm run quiz:generate`, 75 seconds — roughly
forty attempts in the time one used to take.

## 8. Security and abuse

| Risk | Mitigation |
| --- | --- |
| Anyone can trigger paid generation | `spec_key` is server-derived; a second caller finds the row taken and reads instead of generating |
| Prompt injection via form input | No user input reaches the prompt. The only inputs are `ASSIGNMENTS`, language and style token, all compile-time constants |
| Runaway retries | Stale-lock window is 5 min; a spec that fails twice goes `failed` and stops being retried until the key changes |
| Unreviewed content shown to participants | The active-pointer promote step (§6) |
| Secret exposure | `AI_GATEWAY_API_KEY` in Vercel env only, `.env.example` documents it, OIDC in production means no key at all |
| `/api/quiz/generate` abuse | Bearer secret; consider BotID on the intake action if the QR link leaks |

An action is a public HTTP endpoint — `ui-composition` §2 quotes the Next docs
on this. Rate-limit `startIntakeAction` per IP even though the lock already
bounds the expensive path.

---

## 9. Testing

Everything here is already testable because `LlmPort` exists.

| Layer | Test |
| --- | --- |
| `structuralProblems()` | Vitest, pure. Table-driven: two reversed options, missing pillar, 9-word option, reversed option on the wrong pillar |
| `specKey()` | stable across runs; changes when assignments/prompt/model change |
| `generateQuizSpec()` | `createFixtureLlm()` with fixtures recorded from the first real run — the repeat-authoring, judge-fails-one, repair-succeeds path |
| Repair loop | `stubLlm()` returning a block that fails structurally twice → asserts the spec goes `degraded`, not silently persisted |
| Model down | `failingLlm()` → lock released or left to stale-takeover, seed still served |
| Lock | two concurrent `ensureQuizSpec()` calls, one claims |

Record fixtures into `src/lib/adapters/llm/fixtures/quiz-*.json` on the first
real run. `docs/testing.md` is right that a stale fixture suite is worse than
none — the `promptHash` warning is the guard, and `prompts.ts` changing is
exactly when to re-record.

### One gap to close in `LlmPort`

The port has no `system` or `maxOutputTokens`. Both are wanted here (the rules
belong in a system prompt; 5 blocks of JSON needs headroom). Widening it is
fine, but **`hashPrompt` currently hashes `prompt` only** — add `system` to the
hashed text at the same time, or a system-prompt change becomes an undetectable
fixture drift.

---

## 10. What retires, and what does not

`.claude/workflows/create_quest.js` **retires**, replaced by
`scripts/quiz-generate.mjs`: same use case, real `LlmPort`, writes `quiz/*.json`
and optionally the database. That is the offline authoring path, and it is the
thing `docs/testing.md` already asked for — *"the engine can run headless from a
CLI, which is how you iterate on prompts without clicking through the UI."*

One implementation, three drivers: server action, API route, CLI. No shared
logic between a workflow sandbox and the app, because there cannot be any —
workflow scripts cannot import from `src/`.

`quest-skill/SKILL.md` **stays**, reduced to a pointer at `prompts.ts` (§1).
Update the `AGENTS.md` Workflows section in the same PR.

---

## 11. Build order

| # | Task | Est. |
| --- | --- | --- |
| 1 | `domain/quiz/{form,block,validate}.ts` + unit tests | 45m |
| 2 | `domain/quiz/prompts.ts` — inline the skill + PILLARS rules | 45m |
| 3 | `adapters/llm/anthropic.ts` (AI SDK + gateway), widen `composition.ts`, add `ai`/`@ai-sdk` to biome restrictions | 45m |
| 4 | `schema/quiz.ts` + `db:push` to a dev branch | 30m |
| 5 | `ports/quiz-spec-repository.ts` + drizzle adapter (claim, takeover, per-block upsert, read active) | 1h |
| 6 | `use-cases/quiz/generate-quiz-spec.ts` — the pipeline | 1h |
| 7 | `use-cases/quiz/ensure-quiz-spec.ts` + `startIntakeAction` + `maxDuration` | 45m |
| 8 | `scripts/quiz-seed.mjs` — load `quiz/*.json` as spec v1, active | 30m |
| 9 | Record fixtures, write the use-case tests | 45m |
| 10 | `api/quiz/generate` route + warm-on-deploy ping | 30m |
| 11 | Retire the workflow, rewrite SKILL.md + AGENTS.md | 30m |

**~8 hours.** Steps 1–2 and 4–5 parallelise across two people. If time binds,
the cut order is 10 → 9 → 6, leaving a seeded form that never regenerates —
which is still shippable, because it is exactly what exists today.

---

## 12. Deliberately out of scope

- **Image generation for new blocks.** 60 images per spec, plus Vercel Blob
  storage and an `image_url` column. Real work, separate plan. Until it exists,
  §6's promote step is what keeps unillustrated blocks off the demo.

  Cheaper than expected to add later, though: **AI Gateway does both modalities
  on one credential** — `generateImage({ model: gateway.imageModel(...) })` from
  the `ai` package, or the OpenAI-compatible `/v1/images/generations`. Available
  image models include `openai/gpt-image-2`, `bfl/flux-2-pro`,
  `google/imagen-4.0-ultra-generate-001` and `xai/grok-imagine-image`. No second
  vendor, no second key, one billing and observability surface.

  **When it is built, stop baking the caption into the image.** Today's prompts
  end with *"caption reading '<option text>'"*, which has two costs that get
  worse on an on-demand pipeline: generated text is the least reliable thing
  these models do (Spanish accents especially), and a one-word copy edit forces
  a full re-render of the art. `docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md` §7.3
  already flags it as a known problem. Generate the scene *without* text and
  render the caption as DOM text over the image: no accent mangling, art
  survives copy edits, and the caption becomes selectable, accessible and
  translatable. It also shortens the image prompt.

  Budget images per *spec*, never per participant — 60 renders costs
  meaningfully more than the ~$1 of text, and the exact figure depends on the
  model, so check current per-image pricing before enabling it on demand.
- **Per-participant forms.** §0.
- **Adaptive item selection.** `PILLARS.md` §7.2 dropped it from the pitch;
  nothing here reopens it.
- **Vercel Queues.** §5.
