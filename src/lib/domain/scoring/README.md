# scoring — the participant's four posteriors

Bayesian MAP scoring of a Thurstonian choice model with **fixed, authored item
parameters** — `AUDIT.md` S8's honest label, and the one to use in any slide or
pitch sentence. The model is Thurstonian; the parameters are not calibrated.
Nothing here was fitted to data, because no pretest sample exists.

Pure TypeScript, zero dependencies, no I/O. Persistence is
`src/lib/use-cases/score-participant.ts` (`quiz_responses → latent_estimates →
ranked`, `docs/domain.md` §0) plus `LatentRepository`; this directory only turns
answers into numbers.

## The likelihood, in one paragraph

Each option `j` of a block carries a utility
`u_j = DISCRIMINATION · sign_j · θ_{pillar(j)} + intercept_j`, where `sign_j` is
`+1` for a positively keyed option and `−1` for the block's one reversed option,
and `intercept_j` is held at 0 (`items.ts` explains why that is a design rule
rather than a shrug). Choosing an option "most" is a Luce (softmax) draw over
the four utilities; choosing "least" is a softmax over the three that remain
after the "most" pick is removed. The four `θ`s — one per pillar — carry a
standard normal N(0,1) prior, so the log-posterior is strictly convex; Newton
with backtracking finds its single mode, the Laplace approximation at that mode
gives `seTheta`, and the reported pair is `mean = Φ(θ)`, `se = φ(θ)·seTheta`
floored at `SE_FLOOR`. Mixed keying is what makes trait *levels* recoverable at
all: on an all-positive form the same likelihood pins only contrasts, `Σθ ≈ 0`,
which `scoring.test.ts` AC-3 demonstrates rather than asserts (`AUDIT.md` F1).

## Where the parameters come from

Every participant answers **their own twelve blocks**, dealt from the committed
question bank by `formFor()` (`domain/quiz/bank.ts`), so `items` is never a
constant: it is `itemParametersOfBlocks(stored.map((s) => s.block))` over that
participant's `generated_blocks` rows. `itemParametersOf(INSTRUMENT)` and the
`ITEM_PARAMETERS` constant describe the committed `INSTRUMENT` form, which
nobody is served — a silent scoring error for every real respondent. That is why
`ITEM_PARAMETERS` is not re-exported from `index.ts`: reaching for it has to be
a deliberate import, not a barrel autocomplete.

What every form shares is structure — 12 positions, three focus blocks per
pillar, four pillars once per block, one reversed option on the focus pillar
(`PILLARS.md` §7.2). The likelihood reads `pillar` and `keyed` and never a word
of scenario text, which is what puts 200 different forms on one common metric.

## Three places this supersedes issue #7's text

| #7 said | What ships | Why |
| --- | --- | --- |
| `ScoringResult { estimates; responsesUsed; scorerVersion }` | `LatentEstimates { scorerVersion; estimates }` | `estimateLatents` either throws or consumes every response — it never silently drops one — so `responsesUsed` is `responses.length` and belongs to the use case that read them, not to the estimator. `scoreParticipant` reports it. |
| `estimates: Partial<Record<…>>`, `{}` for zero responses | `Record<Pillar, ScoredLatent>` — always four | Every block carries one option per pillar, so granularity is all-four-or-none; `Partial` could never be *per pillar* here. Participant-level granularity is preserved instead by `scoreParticipant`'s completion gate: an unfinished quiz writes **no rows at all**, and the absent row is what `engine.ts` reads as unmeasured (`AUDIT.md` S15). |
| `seTheta` fallback `0.45` | `1` (`estimate.ts`) | The prior is N(0,1), so `1` *is* the prior's SE on the θ scale — wider than 0.45, and wider than the prior on [0,1]. A pathological form whose Hessian will not invert then reports maximal uncertainty rather than fabricated precision. |

## Files

| File | Holds |
| --- | --- |
| `estimate.ts` | `estimateLatents`, `SCORER_VERSION` (`map-luce-v1`), the Newton solver, `THETA_LIMIT`, `SE_FLOOR` |
| `items.ts` | The authored parameters: `LAMBDA`, `DISCRIMINATION`, `INTERCEPT`, `itemParametersOfBlocks` |
| `simulate.ts` | `mulberry32`, `structuralBlocksFor`, `simulateRespondent` — how the property tests get 200 respondents with no data |
| `index.ts` | The public surface. `ITEM_PARAMETERS` is deliberately absent |
