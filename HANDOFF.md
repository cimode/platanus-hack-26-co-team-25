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

**⚠ The repo MOVED** on 2026-08-22 from `~/hackaton/platanus-hack-26-co-team-25` to
`~/dev/hackaton-platanus`. Older docs, memories and transcripts reference the old path — mentally
rewrite it. Git remote is unchanged (`platanus-hack/platanus-hack-26-co-team-25`).

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

### `matching/` — the scoring engine ✅ committed
Pure TypeScript, **zero dependencies**, deterministic (no `Math.random`, no `Date`).

```bash
node --experimental-strip-types matching/demo.ts        # 8-person synthetic room
node --experimental-strip-types matching/engine.test.ts # 13/13 property tests
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

### `timeline/` — the score→event layer ⚠ works, but see §4
Three competing implementations were built and compared (`timeline/COMPARISON.md`).
**LOCKED DECISION: ship approach B** (grammar hybrid). A = hard fallback, C's validator = output gate.

```bash
node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts  # 26/26
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

## 4. ⚠ KNOWN REGRESSION — the live narration path is currently SLOW

**State: the code is correct and tested, but the default live path is slower than what it
replaced.** Do not ship a live demo flow on it without reading this.

### Measured, on one pair (sofia×diego, romantic, seed 11)

| Narration mode | Model | Wall time | Note |
|---|---|---|---|
| per-beat sequential (~12 calls) | glm-4.7-flash | **6.6s** | fast, clunky prose |
| per-beat sequential | kimi-k2.5 | 116s | **best prose by a clear margin** |
| per-beat sequential | deepseek-v4-pro | 115s | close second, more generic |
| **batch (1 call, current default)** | kimi → fell through | **207s → 257s** | ✗ worse |
| single tiny call (control) | kimi-k2.5 | **2.4s** | the model is not the problem |

### What happened, honestly

1. Per-beat sequential was slow (~10s × 12 calls). The user proposed **parallel**; I argued for
   **batch** (one call writing all sentences) for coherence + cost. That was the wrong call.
2. Batch made it *worse*: generating ~11 sentences in one structured response is slow for these
   models, and it blew past the per-call timeout.
3. A flat **60s `abortSignal`** (added earlier to prevent hangs) then cut the batch off mid-flight
   → silently fell down the model chain → the 207s run's mediocre prose was **glm's, not kimi's**.
4. Fixed the timeout to scale with beat count (`timeline/lib/narrator.ts`, `__timeoutMs`,
   ~12s/beat, floor 90s, cap 240s). Re-measured: **257s** — kimi still timed out at 132s and fell
   to deepseek. Batch is simply the wrong shape for these models.

### The recommended fix (not yet implemented)

**Parallelize the per-beat calls** — the user's original instinct was right. Beats are pre-sampled
with full state, so the calls are independent:

- `narrate()` in `timeline/lib/narrator.ts` currently calls `narrateBatchLive()`. Replace with a
  `Promise.all` over the existing per-beat prompt builder (the mock path already maps per beat).
- Expected: ~10–15s total on kimi instead of 116s sequential or 257s batched.
- **Carry the pet guard over.** Parallel per-beat writers cannot see each other, which is how
  invented state creeps in (live narration conjured an unestablished dog across models; approach A
  even contradicted itself — "a dog-free vacation … postcards to their pup back home"). The guard
  in the batch path (`PET_WORD_RE` + established-state inventory, replaces the offending sentence
  with its mock fallback and counts it in `meta.petGuardReplacements`) **works — it fired once in
  the last run.** Port it to the parallel path.
- Keep `generateWithFallback` (capped backoff, 2 retries × 5s/10s, then next model).

### Model config (`timeline/lib/narrator.ts`)
`MODEL_PRIMARY = 'moonshotai/kimi-k2.5'`, fallbacks `['deepseek/deepseek-v4-pro',
'zai/glm-4.7-flash']`, then deterministic mock. Override per-run with `TIMELINE_MODEL=<id>`.
Cost is ~half a cent per timeline; **cost never discriminated between options — latency and prose
quality did.**

> Free-tier note (historical): before credits, only `zai/glm-4.7-flash` was reachable; everything
> else returned `GatewayInternalServerError: Free tier users do not have access`. Credits are
> active now, all models reachable.

---

## 5. Open work, in priority order

1. **Parallelize narration** (§4) — turns a 2–4 min operation into ~15s.
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
cd ~/dev/hackaton-platanus
node --version                    # v22.18.0
cd timeline && pnpm install       # only needed for the LLM client

# tests
node --experimental-strip-types matching/engine.test.ts
node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts

# live narration (needs timeline/.env)
TIMELINE_MODEL=moonshotai/kimi-k2.5 node --experimental-strip-types timeline/live-probe.ts
```

Memory: this project's history is in engram under project `hackaton` — search topic keys
`hackaton/platanus-26/*` (`context`, `research-compatibility`, `pillars`, `audit`,
`matching-engine`, `timeline-f2`, `timeline-live`, `quest-skill`).
