# The question bank

Where a participant's twelve questions come from, and why nothing writes one
while they wait.

> ## Status, 2026-08-23
>
> **Nothing generates at request time.** No route, no Server Action and no
> background task calls a model to produce a question. The four hundred blocks
> in `quiz/bank/` were authored offline, judged, validated and committed;
> `formFor(participantId)` deals twelve of them; `assignQuizForm` writes those
> twelve rows in one INSERT at registration. Rendering a block costs zero model
> calls and one indexed read.
>
> This replaced the per-participant live pipeline (`docs/domain.md` D20 →
> **D21**): a per-room pool of pre-authored forms, claim-guarded background
> generation in `after()`, and a "Escribiendo tus preguntas…" wait screen when
> a participant outran the writer. All of it is deleted —
> `ensure-quiz-batch.ts`, `generate-quiz-batch.ts`, `authoring.ts`,
> `assignments.ts`, `similarity.ts`, `quiz_pool_sets`, `quiz_generation_claims`,
> `GenerationWait`, `AutoRefresh`, `HOOKAI_QUIZ_POOL_*`, `pnpm quiz:smoke`.
>
> The reason is one sentence from the product owner: **leaving a participant
> waiting while a serverless function runs is bad UX — people think something
> is broken.** Completion rate is the demo (`CONTEXT.md` §4), and a 40–70 s
> screen that apologises for itself is where completion goes to die. Everything
> below is what the same money bought instead, spent once, offline.

---

## 1. What is committed

```
quiz/bank/regulation.json    100 blocks
quiz/bank/politeness.json    100 blocks
quiz/bank/reliability.json   100 blocks
quiz/bank/agency.json        100 blocks
```

Each file is `{ "pillar", "language": "es", "blocks": [ … ] }`, and each block:

```json
{
  "id": "reg-001",
  "focusPillar": "regulation",
  "domain": "street-food",
  "scenario": "…",
  "options": [
    { "key": "a", "text": "…", "pillar": "regulation", "keyed": "reversed" },
    { "key": "b", "text": "…", "pillar": "politeness",  "keyed": "positive" },
    { "key": "c", "text": "…", "pillar": "reliability", "keyed": "positive" },
    { "key": "d", "text": "…", "pillar": "agency",      "keyed": "positive" }
  ]
}
```

`id` is the block's name in the file (`reg-001`, `age-072`). It is the only
handle a human has on a scenario that reads badly in the room, and it is what a
validation failure quotes — "block 1" would point at four hundred candidates.

A block carries no `position` and no `batch`: those are properties of a *form*,
not of a question. A bank block is nobody's question 7 until it is dealt.

**Nothing may hard-code the count.** A hundred per pillar is what ships today;
the bank is meant to grow, and `formFor` only ever needs three of any pillar
(`MIN_BLOCKS_PER_PILLAR`). Read `BANK_BY_PILLAR[pillar].length` if you need a
number.

## 2. How a participant gets twelve of them

`src/lib/domain/quiz/bank.ts`:

| Export | What it is |
| --- | --- |
| `BankBlock` | a block as it sits in the file — `id`, `focusPillar`, `domain`, `scenario`, `options` |
| `BANK` | all four files, flattened, **validated at import** |
| `BANK_BY_PILLAR` | the same blocks indexed by focus pillar |
| `formFor(participantId)` | the participant's twelve `Block`s, positions 1..12 |

`formFor` is a pure function of the id, seeded through `mulberry32(seedFrom(…))`
from `rng.ts` — no clock, no `Math.random`, no counter. It:

1. draws the twelve **focus pillars**, three of each, in an order shuffled per
   participant, so the same pillar is never in the same position for everyone;
2. shuffles each pillar's pool once, up front, and takes from it;
3. prefers a block whose everyday `domain` this form has not used yet — three
   street-food scenarios in one form read as a bug — and drops the preference
   rather than the block when a pillar runs out of fresh settings. A repeated
   setting is a blemish; a short form is a broken measurement.

The same `participantId` always yields the same twelve blocks in the same order.
That is load-bearing, not tidiness: a resumed session, a reload and a
re-assignment that upserts the same rows must all agree, or somebody answers
position 7 and comes back to a different question 7 while the answer row claims
otherwise.

Why store rows at all, if the form is recomputable? Because the rows are the
*record*, not the source. `response-repository` copies the scenario and the
chosen option texts onto the answer from the row at `(participant_id, position)`
(`docs/domain.md` D15), and `score-participant` reads the item parameters of the
blocks a person was actually shown. Editing a bank block after an evening would
otherwise silently rewrite questions that were already answered.

## 3. Why the measurement survives people answering different items

The estimator uses **authored**, not calibrated, item parameters (`AUDIT.md`
S8): a block's likelihood contribution depends on which pillar an option carries
and how it is keyed, never on what the scenario says. Identical structure is
identical measurement. That is exactly why every bank block goes through
`validateBlock()` — the same function that guards anything stored — at import
time, and why a malformed bank is a **boot failure** rather than a quietly wrong
ranking.

## 4. Authoring the bank offline

The bank was written by a fan-out of authoring agents into `quiz/bank/.parts/`
(one JSON file per agent, `<pillar>-<n>.json`, plus a `w2-` second wave for the
pillars that came up short). Those parts are raw output: unvalidated, deduped
against nothing, and frequently wrong. The gate between them and what ships is
one deterministic script:

```
node scripts/quiz-bank/merge.mjs            # report only
node scripts/quiz-bank/merge.mjs --write    # also write quiz/bank/<pillar>.json
node scripts/quiz-bank/merge.mjs --verbose  # the first 25 rejections, in full
```

It never edits a block. A block either satisfies the instrument or it is listed
for a top-up round, and the report says how many were lost to each reason.

### What the validator rejects, in the order it checks

| Check | Rejects |
| --- | --- |
| **structure** | not exactly four options `a..d`; the four pillars not covered once each; not exactly one `reversed` option; the reversed option not on the block's `focusPillar`; an unknown `focusPillar` |
| **length** | a scenario over 220 characters or over two sentences; an option over eight words; an empty scenario or option |
| **voice** | an option that is not first person singular present — one starting with an infinitive (`Salir…`), or addressed to the reader (`Tú…`, `Usted…`) |
| **duplicate** | a scenario that retells one already accepted, *anywhere in the bank* |
| **quota** | a block whose pillar has already reached `BANK_PER_PILLAR` (100) |

The duplicate rule is deliberately **looser** than the one the live pipeline
used. That one compared a participant's own blocks against each other, where
three shared content words really is a retelling. Here four hundred blocks are
compared against each other, and any two scenarios set in a Bogotá apartment
share "vecino", "casa" and "puerta" without sharing a joke — at three words the
gate threw away 129 perfectly distinct blocks. What matters at bank scale is
that no two blocks a participant could **both** be dealt read as the same joke,
so the rule keeps the two strong signals (a repeated two-word phrase,
near-verbatim text) and asks more of the weak one. All three thresholds are
tunable from the command line: `BANK_SHARED_WORDS` (5), `BANK_JACCARD` (0.45),
`BANK_PER_PILLAR` (100).

### Topping the bank up

1. Author more blocks for the short pillar and drop them into
   `quiz/bank/.parts/` as `<pillar>-<n>.json` with a `{ "blocks": [...] }`
   root. The tone contract is `.claude/skills/quest-skill/SKILL.md`; the
   structural contract is the table above.
2. `node scripts/quiz-bank/merge.mjs` and read the per-pillar line. It is
   **idempotent over the whole parts directory** — it re-reads everything and
   re-derives the accepted set, so ids are stable only if the parts are.
3. `node scripts/quiz-bank/merge.mjs --write` when the counts look right, then
   `pnpm vitest run src/lib/domain/quiz` — `bank.test.ts` re-validates every
   block through the domain's own validator, which is the check that matters.
4. Raise `BANK_PER_PILLAR` if you want more than a hundred. Nothing in the app
   reads a count, so a bigger bank needs no code change.

**Read the new blocks by hand before committing them.** The bar, in the user's
words: *"add a touch of more bizarreness while keeping the end goal of getting
the behavioral data we need; the goal with the questions is that people read
them, laugh and say wtf."* Two failure modes, and they are opposite:

| Failure | Looks like | Why it fails |
| --- | --- | --- |
| **Plain** | an ordinary day with an ordinary complication | nobody repeats it to a friend, and a form nobody enjoys is a form nobody finishes |
| **Random** | surrealism with no everyday anchor | the reader has no situation to answer *about*, so the answer stops being behavioural |

And then read it as the instrument: the comedy lives in the **scenario**, the
four options stay deadpan and plausible. If one option is visibly the funniest,
people pick the funniest instead of the truest and the block measures nothing —
the same failure mode as one option being visibly the *nicest*.

## 5. What the app does at runtime

```
registration  ──▶ assignQuizForm(p)   formFor(p.id) → one saveBatch, twelve rows, source "bank"
/quiz         ──▶ quizProgress(p)     one SELECT; re-assigns and re-reads if a row is missing
answer        ──▶ answerBlock(p, n)   one upsert, texts resolved from the participant's own row
```

No `after()`, no claim, no pool, no `maxDuration` override on any of these
routes, and no wait screen — there is no state left in which a participant's
next block does not exist. `quizProgress` self-heals (a missing row, or a legacy
`source = 'fallback'` row nobody answered, is re-assigned from the bank) and
that costs no model call either.

`generated_blocks.source` still has three values: `bank` is the only one
anything writes; `generated` and `fallback` are read-only history, kept because
someone who answered such a row answered *that* question and the answer points
back at it.

`AI_GATEWAY_API_KEY` is **not** required for the quiz any more. It is still
needed for the timeline narrator and the offspring reveal.

## 6. Testing

| What | Where |
| --- | --- |
| every bank block passes `validateBlock`, each file is one pillar, ids unique | `src/lib/domain/quiz/bank.test.ts` |
| `formFor` is deterministic, twelve blocks, three per pillar, positions 1..12, pillar order varies by participant | `src/lib/domain/quiz/bank.test.ts` |
| `assignQuizForm` writes twelve `source: "bank"` rows in one call and is idempotent | `src/lib/use-cases/assign-quiz-form.test.ts` |
| the quiz on a phone, twelve taps, no beat and no wait screen | `e2e/quiz.spec.ts` |
| registration lands on the opening moment, never on a "writing" state | `e2e/intake.spec.ts` |

The e2e fixture seeds with `formFor` itself, so it cannot drift from the
product: if the deal changes, both change together.
