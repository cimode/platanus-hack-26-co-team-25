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

**⚠ Path:** the repo now lives at **`~/code/hackaton-platanus`** — older docs, memories and
transcripts name two earlier locations; mentally rewrite them.

**⚠ It is now the real Next.js app.** A teammate's merge (`bdc9500`) brought in `src/`, drizzle,
playwright, biome and the project harness. Three consequences that will bite:
- **The matching engine moved to `src/lib/domain/matching/`** (semantically identical — biome
  reformatting only, e.g. `0.40` → `0.4`). All `timeline/` imports were repointed at it; before
  that fix `timeline/` could not run at all. Its tests are **vitest** now.
- **`timeline/` is excluded from the root typecheck and lint** — deliberately: it is a nested
  package with its own `package.json`, its own `node_modules`, and zod ^3 against the root's ^4.
  **Nothing in CI will catch a broken import inside it.** Run its own suite.
- **`origin` has TWO push URLs** — `platanus-hack/...` and `cimode/...` — so one `git push` fans out
  to the org repo and the personal mirror. That mirror is the deploy path (see `README.md`).

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
| `HANDOFF.md` §4 | The timeline engine: pipeline, guards, decisions + evidence | current |
| `TIMELINE.md` | *never written* — §4 now covers it; see §5 | — |

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

### `timeline/` — the score→event layer ✅ committed, live path ~33s
Three implementations were built and compared (`timeline/COMPARISON.md`). **LOCKED: ship approach
B** (grammar hybrid); A = hard fallback, C's validator = output gate. **§4 documents how it works
and every decision behind it** — read that before changing anything here.

| file | holds |
|---|---|
| `timeline/index.ts` | default export = approach B |
| `timeline/approach-b/` | the shipped generator; `verify.ts` code-checks the LLM's bonus-arc claim |
| `timeline/shared.ts` | types, seeded PRNG (mulberry32), banned-word scanner, hazard shape, validators |
| `timeline/lib/narrator.ts` | the ONE LLM client (Vercel AI SDK v5 via `createGateway`) + all narration |
| `timeline/.env` | **gitignored**, holds `AI_GATEWAY_API_KEY`. Paid credits ARE active |

Friendship timelines **structurally lack** duration/dissolution fields (discriminated union)
because no friendship-survival evidence exists (`PILLARS.md` §6.1) — the type system, not a runtime
check, is what prevents a duration claim.

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

## 4. The timeline engine — how it works and why

Everything in this section is measured or implemented, not planned. Approach B (`timeline/index.ts`
→ `timeline/approach-b/`) is the shipped generator; A is the hard fallback and C's validator is the
output gate.

### 4.1 The pipeline

A `PairScore` goes in, a validated `Timeline` comes out, in eight stages
(`timeline/approach-b/index.ts`, numbered in the source):

| # | stage | decided by |
|---|---|---|
| 1 | timing skeleton — year slots for the lens | code, seeded |
| 2 | **mandatory friction arc** — always present, cites the scored friction term | code |
| 3 | warm driver arcs — pattern × domain × outcome, conditioned on the score | code |
| 4 | gated extras — kid arcs behind consent + `wantsKids`, etc. | code |
| 5 | **LLM-nominated bonus arc** — model proposes from a fixed grammar, code verifies the claim | LLM, then code |
| 6 | event budget by priority — trim to the lens's min/max | code |
| 7 | chronological realization with threaded world state | code, seeded |
| 8 | **narration** — prose for the finished beat list | LLM (or mock) |

**Only stages 5 and 8 touch a model, and both are code-guarded.** Stage 5's `triggerClaim` is
verified against the actual `PairScore` (`approach-b/verify.ts`) and unjustified arcs are rejected.
Stage 8 writes prose into a structure it cannot change. This is the whole architectural bet: the
model never decides what happens, only how it reads.

Consequence worth internalising: **structure is deterministic and free; only prose costs a round
trip.** Same seed → identical beats, every time, offline, in microseconds.

### 4.2 Narration — one parallel call per beat

`narrate()` → `narrateParallelLive()` in `timeline/lib/narrator.ts`. One `generateObject` call per
beat, up to 6 in flight.

Every prompt carries person facts, the safety rules, the **whole timeline outline**, an
**ESTABLISHED STATE inventory**, and that beat's own state line. Seeing the whole story is what
keeps independent writers coherent — a writer of beat 7 knows what beats 1–6 established even
though it never sees their sentences.

Failure is **per beat**: two attempts down the model chain, then that beat alone takes its
deterministic mock sentence and is counted in `meta.mockFallbacks`. Neighbours stay live. Only if
*every* beat fails does the run report `narration: 'mock'`.

**Progressive rendering** — `TimelineOpts.onStructure` / `onSentence`. Token streaming is the wrong
tool here: the skeleton is free, so the UI draws all N events (years, kinds, domains) instantly and
fills each sentence in as its own call lands, in whatever order they land. Both hooks are
observation-only — a test asserts hooked and unhooked runs produce identical timelines — and a
throwing callback cannot break generation.

### 4.3 The guards

| guard | catches | on hit |
|---|---|---|
| `validateSentenceText` | empty, over 400 chars, banned words, survival claims | retry once, then mock that beat |
| pet guard | a pet-word when the inventory has no pet | replace with that beat's mock |
| `unknownNames` | any capitalized token the story never established | replace with that beat's mock |
| `verifyTriggerClaim` | a bonus arc citing a score component that isn't real | reject the arc |

Both invented-state guards replace with the beat's **deterministic mock** and count into
`meta.petGuardReplacements`. `unknownNames` deliberately errs toward false positives — a dull
sentence is cheaper than fabricating a name for a real attendee's simulated child. It exists
because a live run produced *"...leaves **Luis** in the car seat..."* for a beat whose established
state said only "their first kid".

### 4.4 Decisions, and the evidence behind them

Each of these overturned an earlier assumption. Re-litigate only with new measurements.

**Model chain: `deepseek-v4-pro` → `glm-4.7-flash` → mock.** kimi-k2.5 is discarded on both axes.

Latency, on a real beat prompt, solo and sequential (so neither concurrency nor the gateway is a
variable):

| model | one beat | reasoning tokens for ONE sentence |
|---|---|---|
| kimi-k2.5 | **52.8s** | **3,481** |
| deepseek-v4-pro | 8.6s | 1,524 |
| glm-4.7-flash | 0.5s | none |

kimi deliberates for thousands of tokens over a single sentence and **it cannot be switched off** —
`reasoningEffort:'low'` was tried under the `moonshotai`, `gateway` and `openai` provider-option
namespaces, plus an explicit "answer immediately, do not deliberate" instruction. All four still
burned 3.3k–4.7k tokens. A richer prompt makes it worse, which is why the old thin per-beat prompt
looked tolerable while the batch and coherent-parallel prompts did not.

Quality, blind: same pair, seeds 11 and 22, identical seeded beats, labels shuffled and the key
sealed until after a written ranking. **deepseek won both seeds; kimi placed last on both** — the
opposite of the earlier lock's "best prose by a clear margin". Objective checks were clean for every
model and seed (0 validator errors, 0 banned words, 0 survival claims, 0 vocabulary leaks), so the
separation is purely prose. kimi produced *"Diary: no rock climbing gear packed, only independence
on hand"*, a caps artifact, and an invented car model; glm repeated "slower town by the coast"
verbatim five times.

*Caveat, because it matters:* both kimi runs were **mixed** (`kimi+glm`) — it times out and fails
over — so some bad sentences may be glm's. The fair claim is *kimi delivers worse timelines in
practice*, not *kimi writes worse prose*. A clean kimi-only run was attempted at concurrency 2:
**300s for one timeline, still mixed.** A model that cannot finish has no prose quality to defend.

**Call shape: one call per beat, not one call per timeline.** Two earlier attempts reasoned about
call shape and both missed the cause, which was the reasoning burn above.

| configuration | narration | end-to-end |
|---|---|---|
| batch, kimi (the original default) | — | 207–257s |
| parallel, kimi, 4 in flight | 140–185s | 200–236s |
| parallel, deepseek, unbounded (11) | 40.8s | 66.8s |
| **parallel, deepseek, 6 in flight** | **31.3s** | **32.8s** ← shipped |

**Concurrency 6, not unbounded.** Past ~6 the per-call latency degrades faster than the extra
parallelism buys back, and a stalled call costs a full ceiling before it can change model.

**`nominate()` uses the fast model** (`NOMINATE_CHAIN`). Its output is three picks from fixed enums
plus a code-verified claim string, so the prose ranking never applied to it — and it runs *before*
narration, where it was silently eating 60s per model.

**Per-call ceilings sized to measured latency** — `BEAT_TIMEOUT_MS` 45s, `NOMINATE_TIMEOUT_MS` 25s —
instead of one flat 60s number.

> **A structured-output prompt must state its response shape in words.** Without `Respond with a
> JSON object having exactly one key, "text"`, these models fail schema validation and burn the
> entire model chain per call. The first parallel implementation omitted it and was *slower* than
> the batch it replaced; `nominate()` had the same defect and it predated that work.

### 4.5 Knobs

All optional — the defaults are the measured-best configuration.

| var | default | purpose |
|---|---|---|
| `TIMELINE_TRACE` | off | per-beat wall time, winning model, every failover → stderr |
| `TIMELINE_CONCURRENCY` | 6 | beats in flight (0 = unbounded) |
| `TIMELINE_MODEL` | — | pin one model; overrides the chain entirely |
| `TIMELINE_NARRATION` | `parallel` | `batch` reaches the old one-call shape, for comparison |

**Comparing models requires one process per model.** `getClient()` memoizes the resolved model, so a
single process cannot honestly A/B them — a first attempt at the eval silently ran all three as
deepseek. Always confirm with `meta.model` on the result.

### 4.6 Sample output — deepseek, 32.8s, the shipped path

```
Y1 [move]  Sofia stacks her sci-fi novels by the window while Diego mounts his pull-up bar;
           they eat sushi on the floor that first night, the city humming outside.
Y2 [move]  Diego spreads the transit map beside Sofia's climbing guidebook and shows how the
           crossfit gym is six blocks from the new sushi place; she nods, and they start packing.
Y3 [kid]   In their bigger-city apartment, Sofia and Diego turn the living room into a
           constellation of soft lamps and a crib, their startup and climbing plans now
           orbiting around first cries.
```

## 5. Open work, in priority order

1. **Close `AUDIT.md` F2.** The score→event layer exists in code and **§4 now documents it**
   (pipeline, guards, decisions, evidence). What remains is a judgement call: either mark F2
   resolved citing §4, or extract §4 into the standalone `TIMELINE.md` the audit asked for.
2. **Run `create_quest`** to author the 15 blocks — this is on the form's critical path (§3).
3. **The AI baby face has zero engineering spec** (`AUDIT.md` S17): no provider, model, latency,
   cost, or failure mode chosen; consent for offspring rendering is structurally separate from
   lens consent and must gate the render path. Pre-generate the hero pair as a cached fallback.
4. **Two published artifacts are STALE** — they still contain the withdrawn complementarity
   formula and the fabricated Festinger statistic:
   - Research readout: https://claude.ai/code/artifact/63adce38-7ba8-4de8-b051-dccbed25f3d0
   - Project briefing: https://claude.ai/code/artifact/70cab80e-b471-47f9-89dc-746fadfcf12b
   Republish from the corrected docs, or don't show them.
5. **Submission metadata is still `<FILL THIS>`** — `platanus-hack-project.jsonc` needs name,
   Spanish one-liner, Spanish description, deploy URL; `project-description.md` is untouched;
   logo must be 1000×1000 ≤500kb. The personal-repo mirror deploys are already wired (§0).

---

## 6. Nuances a new agent will otherwise re-learn painfully

- **Node runs `.ts` directly** via `node --experimental-strip-types`, but only with *erasable*
  syntax — no enums, no namespaces, no decorators. The matching engine stays dependency-free on
  purpose; only `timeline/` has a `package.json` (pnpm, `ai`, `zod`) and its own `node_modules`.
- **`compare.ts` regenerates `COMPARISON.md` wholesale.** A mock re-run once clobbered the
  human-written verdict section. Re-add it by hand or make the harness preserve it.
- **Long background runs are usually rate limits + patient backoff, not hangs.** Before killing a
  workflow, check `journal.jsonl` (started-vs-result lines reveal silent retries) and the newest
  `agent-*.jsonl` mtime.
- **Latency questions get a TRACE, not a theory.** Two prior attempts reasoned about call shape and
  both missed the cause (§4.4). `TIMELINE_TRACE=1` plus one solo sequential call per model settles
  in two minutes what a day of re-architecting will not.
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
node --version                    # v24.13.1
cd timeline && pnpm install       # timeline's OWN deps; run from repo root afterwards

# tests (run from the repo root)
node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts  # 39/39
# matching's tests are vitest now — use the project runner, not --experimental-strip-types

# live narration (needs timeline/.env) — env knobs are documented in §4.5
node --experimental-strip-types timeline/live-probe.ts
```

Memory: this project's history is in engram under project `hackaton` — search topic keys
`hackaton/platanus-26/*` (`context`, `research-compatibility`, `pillars`, `audit`,
`matching-engine`, `timeline-f2`, `timeline-live`, `quest-skill`).
