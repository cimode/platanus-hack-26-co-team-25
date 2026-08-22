# HANDOFF — read this first

> Written 2026-08-22 for whoever (human or agent) picks this up next.
> Everything below is verified state, not intention. Where something is broken or
> unproven, it says so.

---

## 0. Sixty-second orientation

**Product:** a simulation engine for human relationships. A room of ~20 real attendees fill an
intake; a user picks a lens (romantic / business / friendship); a deterministic engine ranks the
room; a chosen pair gets a simulated life timeline + an AI baby face. Social thesis: the
connections are already in the room and never happen.

**Event:** Platanus Hack 26, Bogotá. 36h. Team of 3. Track: Simulations.
Rubric: técnico 25% · ambición 20% · ejecución 20% · impacto 20% · originalidad 15%.

**⚠ The repo MOVED TWICE.** It is now at **`~/code/hackaton-platanus`** (was
`~/hackaton/platanus-hack-26-co-team-25`, then `~/dev/hackaton-platanus`). Older docs, memories and
transcripts reference the old paths — mentally rewrite them. Git remote is unchanged
(`platanus-hack/platanus-hack-26-co-team-25`).

**⚠ The repo is now the real Next.js app.** A teammate's merge (`bdc9500`, 2026-08-22) brought in
`src/`, drizzle, playwright, biome, and the project harness. Two consequences:
- **`matching/` moved to `src/lib/domain/matching/`.** The engine there is semantically identical to
  the original (only biome reformatting, e.g. `0.40` → `0.4`). All `timeline/` imports were
  repointed at it; before that fix `timeline/` could not run at all.
- **`timeline/` is excluded from the root typecheck and lint** (deliberately — it is a nested package
  with its own `package.json`, its own `node_modules`, and zod ^3 against the root's ^4). Nothing in
  CI will catch a broken import inside it. Run its own suite.

**Read in this order:** `CONTEXT.md` (product + demo) → `PILLARS.md` (the model) →
`AUDIT.md` (what's wrong with the above) → this file (where the code actually is).

---

## 1. Document map and precedence

| File | Holds | Trust |
|---|---|---|
| `CONTEXT.md` | Event, rubric, product loop, demo design, scope | current |
| `RESEARCH-COMPATIBILITY.md` | Evidence base, effect sizes, rejected frameworks | current; 2 claims marked WITHDRAWN inline |
| `PILLARS.md` | The instrument: 11 admission criteria, 10 pillars, weight vectors | **supersedes RESEARCH on conflict** |
| `AUDIT.md` | 7-agent adversarial audit: 2 fatal, 17 serious, 12 minor findings | **the corrections are already applied to the three docs above** |
| `TIMELINE.md` | *does not exist yet* — see §5 open work | — |

Precedence rule: `PILLARS.md` > `RESEARCH-COMPATIBILITY.md`. `AUDIT.md` corrects both.

---

## 2. What is DONE and verified

### `src/lib/domain/matching/` — the scoring engine ✅ committed
Pure TypeScript, **zero dependencies**, deterministic (no `Math.random`, no `Date`).

```bash
node --experimental-strip-types src/lib/domain/matching/demo.ts   # 8-person synthetic room
# engine.test.ts was converted to VITEST in the merge — it no longer runs under
# `node --experimental-strip-types`. Use the project's vitest runner.
```

Implements `PILLARS.md` §3 exactly — all 54 weight cells verified digit-by-digit. Two weight
vectors per lens (`w_rank` = rank the room, `w_sim` = drives the timeline), soft-min level terms
with per-lens γ, three-state gates `{0, 1, suppress}`, frozen band cutoffs `.40/.60`, penalty-only
Agency, degraded modes (missing latent → prior 0.5/se 0.6, weights never renormalize).

Output per pair: `{ eligible, rank, sim, band, drivers, friction, flags }`. **`drivers` /
`friction` / `flags` are the interface the timeline layer consumes.**

> Gotcha found the hard way: consent enforcement must extend to the **output/print layer**, not
> just scoring. The demo originally printed "excluded pedro — no romantic consent", which is
> itself a consent leak. Suppressed people must be indistinguishable from absent.

### `timeline/` — the score→event layer ✅ live path fixed, see §4
Three competing implementations were built and compared (`timeline/COMPARISON.md`).
**LOCKED DECISION: ship approach B** (grammar hybrid). A = hard fallback, C's validator = output gate.

```bash
node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts  # 39/39
node --experimental-strip-types timeline/compare.ts        # regenerates COMPARISON.md (mock)
node --experimental-strip-types timeline/live-probe.ts     # all 3 approaches, LIVE
```

- `timeline/index.ts` — default export = approach B.
- `timeline/shared.ts` — types, seeded PRNG (mulberry32), banned-word scanner, hazard shape,
  validators. Friendship timelines **structurally lack** duration/dissolution fields
  (discriminated union) because no friendship-survival evidence exists (`PILLARS.md` §6.1).
- `timeline/lib/narrator.ts` — the LLM client (Vercel AI SDK v5 via `createGateway`).
- `timeline/.env` — **gitignored**, holds `AI_GATEWAY_API_KEY`. Paid credits ARE active.

### Skills & workflows ✅ committed
- `.claude/skills/quest-skill/` — authors one funny 4-option forced-choice block (all four
  pillars, one reversed-keyed option) + per-option image prompts. **Never run yet.**
- `.claude/workflows/create_quest.js` — 15 questions in 3 batches of 5 (+20 image prompts each).
  **Never run yet.** Run: `Workflow({ scriptPath: '.claude/workflows/create_quest.js' })`.

---

## 3. ⚠ THE CRITICAL PATH ITEM — do not skip

**`AUDIT.md` F1: mixed keying is mandatory.** Every quiz block must contain **at least one
reversed-keyed option**, rotated across pillars.

Why it matters: with every block loading the same four traits and all options positively keyed,
the forced-choice likelihood is *invariant to a common shift in trait levels* — all 60 options
carry **zero information about trait levels**, which is exactly the direction the model's dominant
soft-min terms consume. Simulated recovery: **~.19 correlation all-positive vs .93–.95 with one
reversed-keyed option per block.**

This is baked into `quest-skill` already. **It becomes irreversible the moment the intake form
ships with authored blocks.** Verify before anyone hits send.

Also form-blocking (`PILLARS.md` §8): **team membership and track must be intake form fields** —
Structural Proximity carries the largest ranking weight in two of three lenses (.30 friendship,
.24 business) and cannot be computed without them.

---

## 4. ✅ RESOLVED — the live narration path is now ~33s

**State: fixed and measured 2026-08-22.** One pair, 11 beats, sofia×diego romantic seed 11,
end-to-end through approach B:

| configuration | narration | end-to-end |
|---|---|---|
| batch, kimi primary (the old default) | — | **207–257s** |
| parallel, kimi primary, 4 in flight | 140–185s | 200–236s |
| parallel, deepseek primary, unbounded (11) | 40.8s | 66.8s |
| **parallel, deepseek primary, 6 in flight** | **31.3s** | **32.8s** ← shipped |

### The actual root cause — it was never the call shape

Both earlier theories (sequential is slow → batch it; batch is slow → parallelise it) missed it.
On a **real beat prompt, solo and sequential**, so neither concurrency nor the gateway is a
variable:

| model | one beat | reasoning tokens for ONE sentence |
|---|---|---|
| `moonshotai/kimi-k2.5` | **52.8s** | **3,481** |
| `deepseek/deepseek-v4-pro` | 8.6s | 1,524 |
| `zai/glm-4.7-flash` | 0.5s | none |

kimi spends thousands of reasoning tokens deliberating over a single sentence, and **it cannot be
switched off** — `reasoningEffort:'low'` was tried under the `moonshotai`, `gateway`, and `openai`
provider-option namespaces, and an explicit "answer immediately, do not deliberate" line was added
to the prompt. All four still burned 3.3k–4.7k reasoning tokens (49–88s per beat). A richer prompt
makes it worse, which is exactly why the old thin per-beat prompt looked tolerable while both the
batch prompt and the coherent parallel prompt did not.

**kimi is off the demo path entirely**, not left as a fallback where one stall would cost a full
ceiling.

### The prose did not suffer — kimi lost the quality eval too

The old lock recorded kimi's prose as "best by a clear margin". That was re-tested and **it is
false**. Method: same pair, seeds 11 and 22, three models. Beats are seeded-deterministic, so all
three narrate **identical structure** and only prose varies. Outputs were shuffled into anonymous
labels per seed and the key sealed until after a written ranking.

| | seed 11 | seed 22 |
|---|---|---|
| best | **deepseek** | **deepseek** |
| middle | glm | glm |
| worst | **kimi** | **kimi** |

deepseek won both. Objective checks were clean for every model and seed — 0 validator errors,
0 banned words, 0 survival claims, 0 internal-vocabulary leaks — so the separation is purely prose.
Invented-state guard hits: glm 2 and 2, deepseek 1 and 0, kimi 0 and 0.

Representative failures in the kimi timelines: *"Diary: no rock climbing gear packed, only
independence on hand"* (incoherent), *"Diego brings GOOD sushi and gets kids on weekends"* (caps
artifact, and it implies a custody arrangement that never happened), *"the CR-V battery drill"*
(invented car model), *"Diego unmasks in the corner"*. glm's weakness is repetition — it repeated
"slower town by the coast" verbatim five times in one timeline.

**Caveat, stated because it matters:** both kimi runs were MIXED (`kimi+glm`) — it times out on
beats and fails over — so some of those bad sentences may be glm's. The fair claim is therefore
*kimi delivers worse timelines in practice*, not *kimi writes worse prose*. Getting a clean
kimi-only run was attempted at concurrency 2: **300s for ONE timeline, and still mixed.** A model
that cannot finish a timeline has no prose quality left to defend.

Reproduce: `TIMELINE_MODEL=<id>` per run, one process per model — `getClient()` memoizes the
resolved model, so a single process CANNOT honestly compare models. Check `meta.model` on the
result to confirm which model actually wrote it.

### What shipped (`timeline/lib/narrator.ts`)

- **`narrateParallelLive` is the default live path.** One call per beat, `TIMELINE_NARRATION=batch`
  still reaches the old one-call shape for comparison.
- **Bounded concurrency, default 6** (`TIMELINE_CONCURRENCY`, 0 = unbounded). Measured: past ~6 the
  per-call latency degrades faster than the parallelism buys back — unbounded was 40.8s vs 35.0s.
- **Per-beat failure isolation.** A beat that fails twice takes its deterministic mock *alone* and
  is counted in `meta.mockFallbacks`; neighbours stay live. Batch was all-or-nothing.
- **Model chain re-locked**: `deepseek-v4-pro → glm-4.7-flash → mock`.
- **`nominate()` routes to the fast model** (`NOMINATE_CHAIN`) — its output is three picks from
  fixed enums plus a code-verified claim string, so the prose ranking never applied to it. It runs
  *before* narration, and was silently eating 60s per model.
- **Per-call ceilings sized to measured latency**: `BEAT_TIMEOUT_MS` 45s, `NOMINATE_TIMEOUT_MS` 25s,
  replacing one flat 60s number.
- **`TIMELINE_TRACE=1`** → per-beat wall time, winning model, and every failover on stderr. This is
  what found all of the above; use it before theorising about latency again.

> **The prompt must spell out the response shape.** `Respond with a JSON object having exactly one
> key, "text"` is load-bearing: without it these models fail schema validation and burn the entire
> model chain per beat. The first parallel implementation omitted it and was *slower* than the batch
> it replaced. `nominate()` had the same defect and it predated this work.

### Progressive rendering (`TimelineOpts.onStructure` / `onSentence`)

Token streaming is the wrong tool here — the structure is deterministic and free, only the prose
costs a round trip. So the demo can draw the entire timeline skeleton (years, kinds, domains) the
instant it exists, then fill each sentence in as its own call returns, in whatever order they land.
Both hooks are observation-only (a test asserts hooked and unhooked runs produce identical
timelines) and a throwing callback cannot break generation.

### One more guard: invented names

The deepseek run wrote *"...leaves **Luis** in the car seat..."* for a beat whose established state
said only "their first kid". `unknownNames()` now rejects any capitalized token the story never
established (weekday/month allowlist, sentence-initial words skipped), replacing the sentence with
its deterministic mock. It deliberately errs toward false positives: a dull sentence is cheaper than
fabricating a name for a real attendee's simulated child.

### 4.1 Sample output — deepseek, 32.8s, the shipped path

```
Y1 [move]     Sofia stacks her sci-fi novels by the window while Diego mounts his pull-up bar;
              they eat sushi on the floor that first night, the city humming outside.
Y2 [move]     Diego spreads the transit map beside Sofia's climbing guidebook and shows how the
              crossfit gym is six blocks from the new sushi place; she nods, and they start packing.
Y3 [kid]      In their bigger-city apartment, Sofia and Diego turn the living room into a
              constellation of soft lamps and a crib, their startup and climbing plans now
              orbiting around first cries.
```

## 5. Open work, in priority order

1. ~~Parallelize narration~~ — **DONE** (§4): 236s → 32.8s, plus progressive-render hooks.
2. **`AUDIT.md` F2 is only half-closed.** The score→event layer exists in code, but the design doc
   `TIMELINE.md` was never written and the audit's F2 entry is still open. Write it from
   `COMPARISON.md` + `timeline/approach-b/`, then mark F2 resolved in `AUDIT.md`.
3. **Run `create_quest`** to author the 15 blocks — this is on the form's critical path (§3).
4. **The AI baby face has zero engineering spec** (`AUDIT.md` S17): no provider, model, latency,
   cost, or failure mode chosen; consent for offspring rendering is structurally separate from
   lens consent and must gate the render path. Pre-generate the hero pair as a cached fallback.
5. **Two published artifacts are STALE** — they still contain the withdrawn complementarity
   formula and the fabricated Festinger statistic:
   - Research readout: https://claude.ai/code/artifact/63adce38-7ba8-4de8-b051-dccbed25f3d0
   - Project briefing: https://claude.ai/code/artifact/70cab80e-b471-47f9-89dc-746fadfcf12b
   Republish from the corrected docs, or don't show them.
6. **Submission metadata is still `<FILL THIS>`** — `platanus-hack-project.jsonc` needs name,
   Spanish one-liner, Spanish description, deploy URL; `project-description.md` is untouched;
   logo must be 1000×1000 ≤500kb. Deploy requires mirroring to a personal repo (see `README.md`).

---

## 6. Nuances a new agent will otherwise re-learn painfully

- **Node 22 runs `.ts` directly** via `node --experimental-strip-types`, but only with *erasable*
  syntax — no enums, no namespaces, no decorators. `matching/` stays dependency-free on purpose;
  only `timeline/` has a `package.json` (pnpm, `ai`, `zod`).
- **`compare.ts` regenerates `COMPARISON.md` wholesale.** A mock re-run once clobbered the
  human-written verdict section. Re-add it by hand or make the harness preserve it.
- **Long background runs are usually rate limits + patient backoff, not hangs.** Before killing a
  workflow, check `journal.jsonl` (started-vs-result lines reveal silent retries) and the newest
  `agent-*.jsonl` mtime.
- **Latency questions get a TRACE, not a theory.** Two prior attempts at this (batch it;
  parallelise it) both reasoned about call shape and both missed the cause, which was a model
  burning 3.5k reasoning tokens per sentence. `TIMELINE_TRACE=1` plus one solo sequential call per
  model settles in two minutes what a day of re-architecting will not.
- **A structured-output prompt must state the response shape in words.** The schema alone is not
  enough for these models: without `Respond with a JSON object having exactly one key, "text"` they
  fail validation and burn the whole model chain per call.
- **Probe with ONE pair, never a full matrix.** A 4-sample × 3-approach × 3-seed live run is ~60
  generations and takes an hour.
- **Never print `timeline/.env`.**
- **Internal score vocabulary must never reach user-facing prose** ("the commonGround gap between
  Sofia and Diego" is an engineer talking). `TERM_PHRASES` in `narrator.ts` maps term names to
  human noun phrases at the narration boundary.
- **Banned-word scanners must scan the prompt too** — the safety instructions themselves once
  contained words from the banned list. Categories are *described*, never enumerated.
- **The strategic posture, which survived four adversarial audits:** *we simulate, we do not
  predict.* Joel/Eastwick/Finkel 2017 found pre-meeting self-report predicts ~0% of compatibility
  variance. Never claim a match percentage. Never voice a numeric survival fraction over a real
  pair. The refusals (facial attractiveness from photos, Joel 2020's top-tier predictors) are
  deliberate and are the strongest material in the pitch.

---

## 7. Environment

```bash
cd ~/code/hackaton-platanus
node --version                    # v24.13.1 (was v22.18.0 when this doc was first written)
cd timeline && pnpm install       # timeline's OWN deps; run from repo root afterwards

# tests (run from the repo root)
node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts  # 39/39
# matching's tests are vitest now — use the project runner, not --experimental-strip-types

# live narration (needs timeline/.env)
node --experimental-strip-types timeline/live-probe.ts

# knobs, all optional — defaults are the measured-best configuration
TIMELINE_TRACE=1        # per-beat wall time, winning model, every failover -> stderr
TIMELINE_CONCURRENCY=6  # beats in flight (0 = unbounded; 6 measured best)
TIMELINE_MODEL=<id>     # pin one model; overrides the chain entirely
TIMELINE_NARRATION=batch # the old one-call shape, for comparison only
```

Memory: this project's history is in engram under project `hackaton` — search topic keys
`hackaton/platanus-26/*` (`context`, `research-compatibility`, `pillars`, `audit`,
`matching-engine`, `timeline-f2`, `timeline-live`, `quest-skill`).
