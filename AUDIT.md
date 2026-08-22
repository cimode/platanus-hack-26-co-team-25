# AUDIT — Transversal adversarial review of the working documents

> Independent audit of `CONTEXT.md`, `RESEARCH-COMPATIBILITY.md`, and `PILLARS.md` (all
> produced by the prior agent, including its 10-agent adversarial workflow). Run as a
> 7-agent audit: four hostile auditors (citations vs primary sources · internal
> consistency & arithmetic · psychometric soundness · feasibility) → a defense pass that
> tried to kill every fatal/serious finding as a false positive → synthesis.
> **31 findings survived (2 fatal · 17 serious · 12 minor); 22 claims were attacked and held.**
> Last updated: 2026-08-22.

---

## 0. Verdict

The prior work is genuinely rigorous where it is structural and mathematical — every
weight vector normalizes exactly, both formal withdrawals are correct in substance, the
literature core is verbatim-accurate, and "we simulate, we do not predict" survived every
attack. But it **systematically overclaims at exactly the pitch-facing surface**, and its
deepest failure is an **inversion of effort against the demo**: the measurement apparatus
is specified to the decimal while the things that actually appear on stage — the
score→event interface, photo capture, the baby-face pipeline, band cutoffs, degraded-mode
ranking — were left undesigned.

---

## 1. FATAL — fix before anything else

### F1 · All-positive keying makes the instrument blind to trait levels *(irreversible once the form ships)*

With every block loading the same four traits and every option positively keyed — the only
pattern the docs document — the forced-choice likelihood is **exactly invariant to a common
shift in trait levels**: probabilities depend only on utility *differences*, so all 60
options contribute **zero information to the level direction**. The model's dominant terms
are soft-min **LEVELS** (Regulation+Politeness+Reliability = .45 of romantic `w_sim`), and
three of four latents share a Stability factor by the doc's own admission — so the flagship
measurement would silently run on prior noise. Simulation: all-positive keying recovers
sum-of-traits correlation with truth ≈ **.19** (~85% of between-person level variance
destroyed); **one reversed-keyed option per block restores it to .93–.95**.

> **FIX (today, before item authoring):** hard requirement in `PILLARS.md` §8 — at least
> one reversed-keyed statement per block, rotated across traits. And correct §7.2: linking
> legitimizes between-person **contrasts**; reversed keying is what legitimizes the level
> terms.

### F2 · The score→event interface does not exist *(design first tomorrow)*

How pillar bands become timeline events and hazard covariate values is specified
**nowhere**. Worse: the hazard model's stated covariates (age at union formation,
education) are **not collected by the intake** — every "age" hit in `PILLARS.md` is the
substring of "Agency". Three documents specify the measurement apparatus exhaustively and
leave the on-stage deliverable — demo beat 1 — to improvisation the day before the demo.

> **FIX (first thing tomorrow, before any instrument work):** a fixed event-type library
> keyed to pillar bands (rootedness gap → relocation; Regulation soft-min → conflict-recovery
> arcs; children gate → kid-event year sampled from a survival-conditioned window); a
> hand-tuned Weibull draw using **only covariates the intake collects**; the LLM restricted
> to narrating a pre-sampled event list. Either add a declared age band to the intake or
> delete age/education from the hazard story.

---

## 2. SERIOUS — the pitch-facing overclaims

| # | Finding | Location | Fix |
|---|---|---|---|
| S1 | **τ is mislabeled.** "Total *latent* contribution" = .35/.34/.17, but the four latents sum to **.27/.34/.11** — the stated values only reconcile by counting Distance & Re-initiation, which §2 explicitly classifies as *not a latent*. The "83% opportunity / 17% inferred traits" pitch line is wrong by the doc's own tables (11% inferred). A judge summing four cells catches it in 30 seconds. | PILLARS §3 vs §2 | Restate τ = .27/.34/.11, anchored 73/66/89%; fix the 83/17 sentence; re-render ablations. The corrected numbers **strengthen** the descope case. |
| S2 | **The Festinger statistic is fabricated.** "65% of friendships within five doors, N=240" appears nowhere in the primary text — it traces to blog-class sources, the exact class A1 forbids. Real numbers: next-door choices **41.2%** vs **10.3%** at four doors (monotone decay), functional-distance effects, **270 households**. Floors had five apartments, so "within five doors" doesn't even map onto the design. | RESEARCH §1.6 (self-described "most important paragraph"), §7; PILLARS §3 | Replace with the primary statistics. The proximity thesis survives fully intact on the real numbers. |
| S3 | **Withdrawn claims survive unmarked in four sections** — including §7, the pitch-ready rubric summary, which still sells "adaptive information-maximizing item selection" and complementarity scoring, against PILLARS' own warning that adaptivity is "the overclaim a technical judge catches". | RESEARCH §1.5, §2, §4.2, §7 | Propagate withdrawal markers; scrub §7 to shipped claims. Pitch source of truth = PILLARS §7 + corrected τ. |
| S4 | **CONTEXT.md §7.1 "RESOLVED" describes the pre-review instrument** (Big Five + attachment + circumplex) — stale vs the four shipped latents, in the doc that calls itself the single source of truth. | CONTEXT §7.1 | Rewrite to name the four latents + six free pillars. |
| S5 | **"Every latent pair directly compared 15 times" overstates by 20–100%.** Pairs *co-occur* 15 times; most-only elicitation observes 3 of 6 orderings per block, most+least 5 of 6 (~12–13 expected direct comparisons). | PILLARS §7.2 | Restate as co-occurrence + expected comparisons. The linking argument survives in that form. |
| S6 | **A4's bold rule ("no \|a−b\| on a latent, anywhere") is violated by the doc itself** — the friendship Agency band-gap penalty is a discretized difference term on a measured latent. | PILLARS §1/§5 vs §2/§4/§7.1 | Add the explicit carve-out (banded penalties computed as P(gap ≥ k) from posteriors) and simulate it at SE ≈ .45 — or zero the term. |
| S7 | **Romantic Eligibility carries `w_sim` .20 under a construct defined nowhere** ("graded remainder" of a pillar defined as absolute binaries), and the friendship table silently omits the row. | PILLARS §3 vs §2 | Define it (plausibly children-desire agreement + age/education covariates) with its anchor, or reallocate. |
| S8 | **"Thurstonian IRT" is stated unhedged** in CONTEXT §7.1 and RESEARCH §6.1's nominated pitch sentence, while §6.4 of the same file concedes what actually ships. | CONTEXT §7.1; RESEARCH §6.1 vs §6.4 | Honest label: "Bayesian MAP scoring of a Thurstonian choice model with fixed, authored item parameters — the model is Thurstonian; the parameters are not calibrated." |
| S9 | **The "2–3 bands at SE ≈ .45" claim has no derivation anywhere in the corpus** — no loading assumption, no keying design, no information calculation. (It *is* achievable — see Confirmed — but only under stated assumptions.) | PILLARS §0, §1 | State the assumptions (λ, mixed keying, most+least) and publish the degraded band count per cut condition. |
| S10 | **"In 71 of 100 runs still together at year 5" is a numeric outcome claim from invented parameters** — no β magnitudes, no h₀ scale, no r→hazard conversion exists. | RESEARCH §5.1 vs §4.3's own honesty rule | Label the curve *illustrative dynamics*; never voice a survival fraction over a real pair. |
| S11 | **Children timing was cut from intake but §5.2 still conditions on it**; RESEARCH §3 still calls timing "the direct input". | RESEARCH §3, §5.2 vs PILLARS §5, §8 | Desire-only gate + declared age band, or drop timed child events. |
| S12 | **No effort estimate exists anywhere** for a spec this elaborate with the demo ~24h away; the costliest components (desirability validation loop, posterior SEs, per-lens ablations) serve the *instrument*, not the demo. | all of PILLARS | Pre-agree the cut list: blocks 15→8–10 if authoring drags; validation → one LLM-judge pass + 10-min human read; posteriors → point estimates with fixed cutoffs; τ ablation → one Q&A slide. |
| S13 | **"Nothing else is on today's critical path" is contradicted by its own next paragraph** — the form ships today and contains the 15 blocks, so block authoring (with F1's keying mandate) is today's second deliverable. | PILLARS §8 | State the two-stage release explicitly, or staff block authoring now. |
| S14 | **Band cutoffs are specified nowhere and no norming story survives N≈20** — within-room percentile banding flips memberships as responses arrive. | PILLARS §0, §7.1; RESEARCH §6.3–6.4 | Fixed a-priori cutoffs on the latent scale, frozen before the first response; never re-band after display. |
| S15 | **A10 (degraded modes) is used to cut candidates and then never discharged for any admitted pillar.** | PILLARS §1/§5 vs §2 | One decision (~1h): missing latents impute to prior mean; weights never renormalize; below-floor profiles excluded from the reveal, not ranked. |
| S16 | **The photo — without which beat 1 cannot run — appears nowhere in the intake flow spec**, and the "7–10 min" headline exceeds its own parts (6.5–9.5). | PILLARS §8; CONTEXT §3 | Photo + per-lens consent to the front of the flow with their own minute; set an explicit completions trigger for the cut order; show respondents their own result immediately. |
| S17 | **The AI baby face — a must-have and the comedic peak — has zero engineering spec**, and consent coverage for it is unwired to the render path. | CONTEXT §3, §5; PILLARS §2 | Tonight: pick the API, measure one real generation, pre-generate the hero pair, and enforce: face-merge renders only for mutually opted-in pairs; on stage, a pre-consented hero pair. |

## 3. MINOR (selected)

- **Montoya's table cell uses the pooled r=.47 where the moderator breakdown belongs**: no-interaction **r=.59**, short-interaction **r=.21**, existing **r=.08 n.s.** The correct numbers are *better* for our use case.
- **The own-neuroticism r=−.26 is misattributed to Malouff** (partner-effects-only meta-analysis); it belongs to **Heller, Watson & Ilies (2004)**.
- **Luo & Klohnen's assortment range is understated**: profile rs **.48–.72** on values/politics/religiosity, not ".20–.50".
- The §6.2 example block loads a "security" dimension that §1.4's two-dimensional attachment model doesn't contain — rewrite the example with the four shipped latents, including one reversed-keyed option, so item authoring copies the right pattern.
- Faking resistance is overstated: a fixed form repeating one quadruple 15 times becomes readable; randomize option order, vary scenario surface (the reversed-keyed items also break the mapping).
- Do not cite "6 fatal and 21 serious verdicts resolved" or the 10-agent workflow on stage — it is unauditable process authority with no trace in the repo. (The same applies to this audit.)
- Scope two sentences: "both surviving **Agency** geometries are penalties"; "maximum four dyadic terms **per lens**".
- Dominance-complementarity deletion should name the evidence deliberately left unexploited (Dryer & Horowitz 1997; Markey & Markey 2007) — penalty-only is kept on error-budget grounds, not because no positive evidence exists.

---

## 4. Confirmed under attack — safe to build and pitch on

- **Joel 2017** (4–18% / 7–27% / ~0%) and **Joel 2020 PNAS** (43 datasets, 11,196 couples, 45%/18%, both top-5 lists, dyadic-adds-nothing) — **verbatim-correct against the papers**.
- **Malouff partner effects**, **Montoya core**, **Luo & Klohnen structure**, **Impett love-languages debunk** — all verbatim-accurate.
- **Festinger's directional thesis** — proximity dominance with sharp distance decay and functional-distance effects — fully supported by the primary text. Only the two quoted statistics were wrong.
- **The A1 de-correction (halving corrected ρ)** reproduces actually-published observed values.
- **All six weight vectors sum to exactly 1.00** (recomputed independently by three auditors); the τ apportionment procedure genuinely reproduces the romance column cell by cell — the tables were built by the stated procedure, not decorated after the fact.
- **Both withdrawals are correct in substance**: the complementarity form is monotone in Δ (the critique is mathematically right), and dropping adaptivity is the right feasibility call at the true ~2 bits/pick channel capacity.
- **"This model never rewards a difference anywhere"** survived adversarial checking of every surviving term form.
- **The soft-min rationale** (the weaker partner constrains the dyad) held against three auditors.
- **The precision target is achievable, not fantasy**: with mixed keying + most+least + λ≈.7, simulation delivers per-trait RMSE .36–.39 from exactly 15 blocks. It fails only as *documented* (assumptions unstated, keying unspecified).
- **The §8 cut order and the two-beat demo design** are genuinely good demo engineering; CONTEXT §5's must-have list is tight and fully demo-aligned. The scope inflation happened in PILLARS' elaboration, not in CONTEXT.
- **"We simulate, we do not predict"** — nothing in four adversarial audits weakened it.

---

## 5. Priority order

1. **Today, before the form ships:** F1 keying mandate (irreversible after).
2. **Today, with the form:** S13 (block authoring is today's work), S16 (photo + consent placement), S17 (baby-face API test tonight).
3. **Tomorrow morning, before instrument work:** F2 score→event interface; S14 band cutoffs; S15 degraded modes.
4. **Before any pitch copy:** S1 τ restatement, S2 Festinger numbers, S3 withdrawal propagation, S4 CONTEXT staleness, S8 honest estimator label.
5. **Whenever:** the minors.
