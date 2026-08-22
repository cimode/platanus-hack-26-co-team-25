# RESEARCH — The Science of Human Compatibility

> Evidence base for the compatibility engine, the life simulation, and the adaptive quiz.
> Companion to `CONTEXT.md`. Last updated: 2026-08-22.
>
> **Two claims in this document have been withdrawn** by the adversarial review in
> `PILLARS.md` §7: the complementarity functional form in §4.1, and adaptive item
> selection in §6.3. Both are marked inline below. `PILLARS.md` supersedes this file
> wherever they disagree.

---

## 0. Read this first: the inconvenient finding

There is a large, well-replicated literature on this question, and it says something
uncomfortable for anyone building a compatibility algorithm.

**Joel, Eastwick & Finkel (2017), *Psychological Science*** — two speed-dating studies.
Participants completed 100+ self-report measures before meeting. Random forest models
decomposed romantic desire into three components:

| Variance component | What it means | Predicted from pre-date self-report |
|---|---|---|
| **Actor variance** | How much *you* tend to desire others | **4–18%** |
| **Partner variance** | How much others tend to desire *you* | **7–27%** |
| **Relationship variance** | *Compatibility* — your desire for this specific person, beyond the two above | **~0%** |

They could not predict relationship variance with any combination of traits and
preferences. Eastwick's summary: romantic desire behaves "more like an earthquake,
involving a dynamic and chaos-like process, than a chemical reaction involving the
right combination of traits and preferences."

**Joel et al. (2020), *PNAS*** — 43 longitudinal couples datasets, 29 labs, ~11,000
couples. Same conclusion from the other end of the funnel:

- **Relationship-specific** variables (perceived partner commitment, appreciation,
  sexual satisfaction, perceived partner satisfaction, conflict) explained **up to 45%**
  of relationship quality at baseline, ~18% at study end.
- **Individual-difference** variables (life satisfaction, negative affect, depression,
  attachment avoidance, attachment anxiety) came second.
- **Dyadic combinations added essentially nothing beyond main effects.** Knowing *both*
  people's traits barely beat knowing each person's traits separately.

**Finkel, Eastwick, Karney, Reis & Sprecher (2012), *PSPI*** — the definitive review of
matching algorithms. Found no compelling evidence that any commercial matching algorithm
produces better outcomes than chance.

### Why this is good news, not a blocker

Three reasons this makes our product *stronger*, and all three belong in the pitch:

1. **We are in the Simulations track, not the Prediction track.** The literature says
   you cannot *predict* whether two strangers will be happy. It does not say you cannot
   *model* what their dynamic would look like. A simulation that says "here is how these
   two personalities would collide, and here is where it would break" is honest. A
   product claiming "94% match" is not.

2. **The main effects are real and we can use them.** Joel 2020 says the signal lives in
   main effects — both partners' individual traits — not in exotic interactions. That is
   a *simpler* model to build and a better-supported one. Our scoring should be dominated
   by "how emotionally stable / secure / agreeable are these two people" plus hard value
   gates, with similarity terms as a smaller contribution. That is a design constraint
   handed to us by the data.

3. **Our actual use case is the one context where similarity *does* work.** See §1.
   Montoya's meta-analysis shows actual similarity predicts attraction strongly in
   no-interaction and short-interaction settings, and stops mattering in established
   relationships. We operate on strangers in a room. That is exactly the regime where
   the effect is largest.

> **Pitch defense.** Someone in a technical audience in 2026 may know the Joel studies.
> If we claim prediction, they win. If we say *"the science says compatibility is
> unpredictable before people meet — so we don't predict, we simulate, and we use the
> simulation to trigger the one thing that is actually proven to work: getting two
> people in the same physical space"* — we win, and we look like the only team that read
> the literature.

---

## 1. What the evidence actually supports

### 1.1 Similarity — real, but only in our exact context

**Montoya, Horton & Kirchner (2008)**, *Journal of Social and Personal Relationships* —
meta-analysis of 460 effect sizes from 313 studies.

| Context | Actual similarity → attraction | Perceived similarity → attraction |
|---|---|---|
| No interaction (profile only) | **r = .59** | r = .39 |
| Short interaction | r = .21 | r = .39 |
| Existing relationship | r = .08, **not significant** | **r = .39** |

*(Corrected per `AUDIT.md` M-24: the rows now show Montoya's moderator breakdown; the
pooled overall effects are actual r = .47, perceived r = .39. The corrected numbers are
stronger for our use case, not weaker.)*

Two operational consequences:

- **Actual similarity is at its strongest exactly where our product lives** — people who
  have not met yet, judging each other from a profile. We are not misapplying the effect.
- **Perceived similarity is the effect that never decays.** It predicts attraction in
  every context. And unlike actual similarity, *we can manufacture it*: the product
  should not just score the pair, it should **show each person what they share**.
  Surfacing commonalities is not decoration — it is the mechanism the literature says
  drives attraction. Build the "here's what you two have in common" panel; it is the
  single highest-leverage UI element in the app.

### 1.2 Which similarity? Values, not personality

**Luo & Klohnen (2005)**, *JPSP*, N = 291 newlywed couples:

- Couples are **substantially similar on attitudes and values** (couple-centred profile
  correlations **.48–.72** for values, political attitudes and religiosity — corrected per
  `AUDIT.md` M-26) and show **near-zero similarity on personality** traits.
- But the relationship to *marital quality* inverts: personality-domain and especially
  **attachment similarity** predicted satisfaction; attitude similarity did not.

Read together with the assortative-mating literature, this gives a clean split we should
encode directly in the model:

| Domain | Role in the model |
|---|---|
| **Values & life goals** (children, religion, money, mobility, monogamy) | **Gates / dealbreakers.** Mismatch here doesn't lower the score, it *ends* the pairing. This is what people actually sort on. |
| **Attachment & personality** | **Graded similarity + level terms.** Contributes continuously to predicted quality. |
| **Interests & lifestyle** | **Perceived-similarity fuel + narrative material.** Low scoring weight, high storytelling weight. |

### 1.3 Personality — the level matters far more than the match

**Malouff et al. (2010)**, meta-analysis, 19 samples, N = 3,848. Correlations with the
*partner's* relationship satisfaction:

| Trait | Partner effect | Own effect |
|---|---|---|
| **Neuroticism** | **r = −.22** | r = −.26 † |
| Agreeableness | r = .15 | — |
| Conscientiousness | r = .12 | — |
| Extraversion | r = .06 | — |
| Openness | not significant | — |

† Own-effect from Heller, Watson & Ilies (2004), *Psychological Bulletin* — Malouff is a
partner-effects-only meta-analysis (`AUDIT.md` M-25).

**Low neuroticism is the single most robust personality predictor of relationship
satisfaction and stability, for both partners.** This is a *level* effect, not a
similarity effect: two calm people do well, two anxious people do badly, and matching on
neuroticism buys you nothing. Our score must reflect that — it is the biggest term in the
whole model and it is not a compatibility term at all.

Openness has no reliable link to satisfaction. Keep it in the profile anyway: it is
excellent **simulation fuel** (who moves abroad, who changes careers, who buys the boat)
even though it should carry ~zero scoring weight.

### 1.4 Attachment — the one dyadic effect with real support

Attachment is measured on two continuous dimensions (Brennan/Fraley ECR-R tradition):
**anxiety** and **avoidance**.

- Joel et al. (2020) put **attachment avoidance and attachment anxiety** in the top five
  individual-difference predictors of relationship quality.
- Luo & Klohnen (2005) found **attachment similarity most strongly predictive** of
  satisfaction among the similarity terms.
- The **anxious × avoidant pairing** is the best-documented genuinely dyadic dynamic in
  the literature: it is stable, self-reinforcing, and reliably unhappy — one partner
  pursues, the other withdraws, and each behavior escalates the other.

This gives us the one interaction term we can defend, and it is *narratively perfect*:
an anxious–avoidant pair produces a simulated life full of specific, recognizable,
dramatic conflict events. Great science and great television.

### 1.5 Interpersonal style — the circumplex gives us our math

The interpersonal circumplex has two orthogonal axes: **affiliation** (warm ↔ cold) and
**control** (dominant ↔ submissive). The complementarity principle, supported at the
behavioral level (Sadler, Ethier & Woody):

> **Warmth pulls for warmth. Dominance pulls for submission.**

Partners tend to act **similarly on warmth** and **oppositely on dominance**.

This is the cleanest thing in the entire literature for our purposes, because it is
directly computable and it tells us that "opposites attract" and "birds of a feather" are
*both* right — on different axes:

```
affiliation → score by SIMILARITY   (|a − b| small is good)
control     → WITHDRAWN, see PILLARS.md §7.1 — was: complementarity (gap is good).
              Shipped: an anti-complementarity PENALTY on the high-high corner only.
```

Note this is also where the **business lens diverges hardest** from the romantic one:
two high-dominance cofounders is a well-known failure mode, so the high-high *penalty*
on the control axis is weighted *higher* for business than for romance (`PILLARS.md` §4).

### 1.6 Proximity — the strongest finding we have, and it validates the whole product

**Festinger, Schachter & Back (1950)**, the Westgate housing studies — **270 households**,
assigned to apartments essentially at random. Sociometric choices fell off monotonically
with door distance: **41.2% of same-floor choices were next-door neighbours, against
10.3% at four doors away** (22.5% and 16.2% in between). *Functional* distance mattered
too: residents near stairwells and mailboxes — high foot-traffic positions — drew markedly
more friendship choices, including from other floors. Proximity beat shared background as
a predictor of friendship.

*(An earlier version quoted "65% of friendships within five doors, N = 240" — that
statistic traces to secondary sources, not the primary text, and was removed per
`AUDIT.md` S2. The numbers above are the book's own; the thesis is unchanged.)*

**Zajonc (1968)**, mere exposure: repeated exposure to a stimulus increases positive
evaluation of it, with no interaction required.

Take this seriously, because it is the most important paragraph in this document:

> **Proximity and repeated exposure predict relationship formation better than trait
> matching does.** The best-supported intervention in this entire literature is not a
> better algorithm. It is *putting two people in the same place, repeatedly.*

Our "meet in real life" mechanic — currently scoped as a *stretch* goal in `CONTEXT.md` —
is the part of this product with the strongest scientific backing. The compatibility
engine is the hook; proximity is the drug. Worth reconsidering its priority, and worth
saying out loud on stage: *"the matching is the part everyone builds. The walking-across-
the-room is the part that actually works."*

**Aron et al. (1997)** — the "36 questions" paradigm — adds the complementary finding:
escalating reciprocal self-disclosure generates interpersonal closeness between strangers
in under an hour. If we ever want an in-app icebreaker after a match, this is the
evidence-based one, not small talk.

---

## 2. What NOT to use (and what to say when asked)

| Popular framework | Status | Our position |
|---|---|---|
| **5 Love Languages** (Chapman) | **Not supported.** Impett, Park & Muise (2024), *Current Directions in Psychological Science*: all three central assumptions fail — people do not have one preferred language, the five are not distinct (they overlap heavily), and matching partners' languages does not reliably improve satisfaction. | Do **not** use as a scoring dimension. It *is* high-recognition and fun, so it may appear as **narrative flavor** in the simulated timeline. Never as math. If a judge raises it, we get credit for knowing it's pop psych. |
| **MBTI** | Poor test–retest reliability, forced dichotomies on continuous traits, no predictive validity for relationship outcomes. | Do not use. Big Five instead. |
| **Gottman's "94% divorce prediction"** | The famous accuracy figures come from models fit *post hoc* to the same couples they describe — retrodiction, not out-of-sample prediction. | The **Four Horsemen** (criticism, contempt, defensiveness, stonewalling) and the ~5:1 positive-to-negative conflict ratio are useful *descriptive* constructs and excellent simulation content. Do not quote the accuracy number. |
| **Personality complementarity** ("opposites attract") | Not supported for personality traits generally. | Since `PILLARS.md` §7.1, not even dominance earns a complementarity *reward* — only an anti-complementarity **penalty** on the high-high corner. Nothing in the model rewards a difference. |
| **Astrological / numerological compatibility** | — | Obviously out. But note the *format* is instructive: people love a legible, categorical identity with a story attached. We should deliver that feeling with defensible math underneath. |

---

## 3. The dimension model

Life aspects to measure, with their role and evidence strength.

### Layer A — Individual traits *(level effects; largest scoring weight)*

| Dimension | Evidence | Role |
|---|---|---|
| Emotional stability (inverse neuroticism) | **Strong** — Malouff −.22 partner; Heller 2004 −.26 own | Level. Both high = good. Biggest single term. |
| Attachment anxiety | **Strong** — Joel 2020 top-5 | Level + anxious×avoidant interaction |
| Attachment avoidance | **Strong** — Joel 2020 top-5 | Level + anxious×avoidant interaction |
| Agreeableness | **Moderate** — r = .15 | Level |
| Conscientiousness | **Moderate** — r = .12 | Level (dominant term in the business lens) |
| Extraversion | **Weak** — r = .06 | Level, small; larger in friendship lens |
| Openness | **Null** for satisfaction | Zero scoring weight; high narrative weight |
| Life satisfaction / positive affect | **Strong** — Joel 2020 top-5 | Level |

### Layer B — Values & life goals *(gates and hard filters)*

| Dimension | Role |
|---|---|
| **Desire for children** *(binary — timing cut per A7/A8, `AUDIT.md` S11)* | Hard gate. Desire agreement + a declared age band are the inputs to the "will they have kids" simulation. |
| Religiosity / spirituality | Gate (soft) + assortative similarity |
| Political & moral orientation | Gate (soft) + assortative similarity |
| Monogamy / relationship structure | Hard gate |
| Ambition vs. life balance | Similarity; drives career events in the simulation |
| Money orientation (spend/save, risk) | Similarity; classic conflict generator — high narrative value |
| Geographic rootedness vs. mobility | Similarity; **this is what generates "you move to Manhattan"** |
| Family-of-origin closeness | Similarity |

### Layer C — Interpersonal style *(the circumplex; the elegant part)*

| Dimension | Rule |
|---|---|
| Affiliation / warmth | **Similarity** |
| Control / dominance | ~~Complementarity~~ → high-high **penalty** only (withdrawn per `PILLARS.md` §7.1) |
| Conflict style (engage ↔ withdraw) | Complementarity is *bad* here — pursue/withdraw is the toxic pattern. Penalize the mismatch. |

### Layer D — Lifestyle & interests *(perceived-similarity fuel; low score weight, high narrative weight)*

Chronotype · social energy · order/cleanliness · humor style · physical activity ·
food & diet · substances · hobbies · media taste · pets

These carry **low scoring weight** — the science does not support hobby matching as a
driver of relationship quality. They carry **maximum product weight**, because they are
what the "what you two have in common" panel is made of (§1.1, perceived similarity
r = .39) and what makes a simulated timeline feel like *these two specific people*.

---

## 4. The scoring model

### 4.1 Shape

```
Compat(A, B | lens) = Gate(A, B) × Σ_d  w[d, lens] · s_d(A, B)

Gate(A, B) = Π over hard-gate dimensions g:  gate_g(A, B) ∈ {0, 1}
```

Three kinds of dimension term:

```
LEVEL          s_d = f(min(a_d, b_d))        both must be high; the weaker one binds
SIMILARITY     s_d = exp(−(a_d − b_d)² / 2σ²)
COMPLEMENTARITY  — WITHDRAWN, see PILLARS.md §7.1 —
               was: s_d = 1 − exp(−(a_d − b_d)² / 2σ²)
               This form ranks a maximally submissive person as the ideal
               match for a maximally dominant one, monotonically. Replaced by
               an anti-complementarity penalty on the high-high corner.
```

The `min()` in the level term is deliberate and defensible: a secure partner does not
compensate for a highly anxious one — the literature's main effects are roughly additive
in *badness*, and the less stable partner constrains the dyad.

**Weight the terms by the meta-analytic effect sizes above, not by intuition.** That
single sentence is most of our answer to *aspecto técnico*: the model is calibrated to
published effect sizes and each weight has a citation.

### 4.2 Lens reweighting — SUPERSEDED by `PILLARS.md` §3

> The shipped weight vectors are the two-vector tables (`w_rank` / `w_sim`) in
> `PILLARS.md` §3. The single-vector draft below predates the adversarial review and is
> retained for history only — its "Dominance complementarity" row uses the withdrawn form.

Same dimensions, different weight vector per lens. Illustrative starting weights
(normalize per column):

| Dimension | ❤️ Romantic | 💼 Business | 🤝 Friendship |
|---|---|---|---|
| Emotional stability (level) | **.20** | .12 | .12 |
| Attachment security (level + pairing) | **.15** | .04 | .06 |
| Agreeableness (level) | .10 | .08 | **.14** |
| Conscientiousness (level) | .08 | **.22** | .04 |
| Extraversion (level/similarity) | .04 | .06 | **.12** |
| Values alignment (gated + graded) | **.18** | **.18** | .10 |
| Affiliation similarity | .10 | .06 | **.18** |
| Dominance complementarity | .05 | **.16** | .06 |
| Interests / lifestyle overlap | .10 | .08 | **.18** |

Business-lens notes: conscientiousness dominates (it is the most consistent predictor of
work performance across roles); dominance complementarity is heavily upweighted (two
alphas is the classic cofounder failure); attachment barely matters. Also note **Ruef,
Aldrich & Carter (2003)**, *American Sociological Review* — founding teams form
overwhelmingly by **homophily** (gender, ethnicity, age, occupation) and show little
evidence of deliberate functional diversification. People *pick* similar cofounders even
though skill complementarity is what the team needs. That tension is a great line for the
pitch and a real feature: our business lens can deliberately surface high-value pairings
that homophily would have hidden.

### 4.3 What we output

Never a single "94% match" number. Output:

1. A **rank** within this room, under this lens. (Ranking is a weaker, more honest claim
   than a probability, and it is all the demo needs.)
2. **The top 3 drivers** of the score, in plain language.
3. **The top friction point** — the dimension that scored worst. This is the honesty
   feature *and* the best simulation seed we have.

---

## 5. Longevity and children — how to model them without lying

The user-facing ask is "how long would the relationship last" and "will they have kids,
and when." Both are answerable **as simulations** — draws from a distribution — never as
predictions.

### 5.1 Duration: a survival model, not a number

Model relationship duration as a hazard function `h(t)` with a baseline shape modified by
covariates:

```
h(t | A,B) = h₀(t) · exp(Σ βᵢ · xᵢ)
```

Baseline `h₀(t)`: dissolution hazard is **not** flat. It rises over the first years,
peaks somewhere around years 4–8, then declines for surviving couples. A Weibull or a
hand-tuned spline reproduces this shape well enough for a simulation.

Covariates with genuine support in the demographic literature:

| Covariate | Direction | Confidence |
|---|---|---|
| Age at union formation (young = higher risk) | ↑ risk | **High** — one of the most consistent findings in demography |
| Both partners' neuroticism | ↑ risk | **High** |
| Attachment insecurity (esp. anxious×avoidant) | ↑ risk | **High** |
| Disagreement on wanting children | ↑ risk | **High** — a values gate, not a gradient |
| Education (higher = lower risk) | ↓ risk | **Moderate** |
| Contempt / criticism in conflict (Gottman) | ↑ risk | **Moderate** (construct solid, effect sizes overstated in pop accounts) |
| Premarital cohabitation | ↑ risk | **Low / contested** — the association largely disappears once commitment at move-in and selection effects are controlled. Do not lean on it. |

**Output a survival curve, not a point estimate — and label it *illustrative dynamics*,
never a calibrated probability.** No published source supplies β magnitudes or a baseline
hazard scale for this population, so a spoken sentence like "in 71 of 100 runs you're
still together at year 5" is a numeric outcome claim we cannot back — **never voice a
survival fraction over a real pair** (`AUDIT.md` S10). Show the curve's shape, mark the
branch points, and keep hard numbers off the voiced pitch. It still gives the timeline UI
its branching structure, and it still beats a fake point estimate.

### 5.2 Children: intention × opportunity

The fertility literature converges on a two-stage structure (Miller's
desires → intentions → behavior chain):

- **Stated desire and intention are the dominant predictors**, but they translate to
  behavior imperfectly, and the **time frame of the intention matters** for whether it
  is realized.
- **Couple agreement is the key dyadic variable.** Disagreement predicts both non-birth
  and dissolution.
- Age, education (delays first birth), relationship stability and duration, religiosity,
  and family-of-origin size all modulate timing.

Practical model:

```
P(child) = agreement(desireA, desireB) × opportunity(age, relationship survival to t)
timing   ~ conditioned on declared age bands + relationship survival to t
           (children TIMING is not asked at intake — cut per A7/A8; education is
            not collected, so it appears in no shipped covariate)
```

Note the **coupling to §5.1**: a child can only appear in a simulated timeline at a point
where the relationship survived. Wiring these two models together is what makes the
timeline *congruent* rather than a list of nice events — and congruence is the whole
product (see `CONTEXT.md` §3).

---

## 6. The adaptive quiz — measurement design

The requirement: real-life scenarios, 4 options, no fixed order for the user, but a
principled order for us, and each answer places the user in a "zone" on a life aspect.
That description maps exactly onto two established methodologies.

### 6.1 Multidimensional forced-choice + Thurstonian IRT

**Brown & Maydeu-Olivares (2011)**, *Educational and Psychological Measurement*.

The problem with rating scales ("rate 1–5 how organized you are"): social desirability,
acquiescence, and reference-group effects. In a live event where people know they are
being ranked romantically in front of peers, **faking pressure is at a maximum.** Rating
scales would be a disaster here.

The solution: **blocks of 4 statements, each loading on a different dimension, matched
for social desirability.** The respondent picks the one most like them (optionally also
the least). Because every option is equally attractive, there is no obviously flattering
answer for a casual respondent to grab — this resists casual social desirability, **not**
determined impression management (`AUDIT.md` M-21): a fixed form repeating one quadruple
becomes readable, so option order is randomized and scenario surfaces varied.

The classical problem with forced-choice is **ipsativity** — raw scores become relative
within-person and cannot be compared *between* people. That is fatal for us, since our
entire product compares people to each other. Thurstonian IRT solves exactly this: it
models the underlying comparison process and recovers **normative, between-person
comparable trait estimates** from forced-choice data.

**This is the single most defensible technical claim in our stack.** "We use **Bayesian
MAP scoring of a Thurstonian choice model with fixed, authored item parameters** over
desirability-matched forced-choice blocks — the model is Thurstonian; the parameters are
not calibrated" is the honest sentence, and the one that lands with a technical judge
(`AUDIT.md` S8). Do not say "Thurstonian IRT" unhedged.

### 6.2 Situational Judgment Test framing

Presenting each block as a **real-life scenario** rather than abstract statements buys us
ecological validity, further faking resistance, and — critically for a 36h demo — items
that are *fun to answer*. Completion rate is the demo (see `CONTEXT.md` §4).

Scenario shape:

> *A close friend cancels on you an hour before plans you'd been looking forward to. You:*
> **(a)** tell them straight that this keeps happening and it bothers you ·
> **(b)** say it's fine — and quietly stop suggesting plans ·
> **(c)** rebook for tomorrow before the conversation ends ·
> **(d)** spend the evening replaying what you might have done wrong

Four options, the four **shipped** latents loaded (a: Agency — open disagreement;
b: Politeness, **reversed-keyed**; c: Reliability — follow-through; d: Regulation —
reactivity). No option is obviously "the right one", and **one option per block is
reversed-keyed** — the F1 mandate from `AUDIT.md`: with all-positive keying the form
carries zero information about trait *levels*, the direction the soft-min terms consume.

### 6.3 Adaptive item selection — WITHDRAWN, see `PILLARS.md` §7.2

> Fifteen authored blocks administered as fifteen blocks is a **fixed balanced form**;
> there is nothing to select from. Real adaptivity needs a bank of 40–60 blocks. We ship
> the fixed form and defend it on its linking properties. The mechanics below are
> retained for reference only — do not put them in the pitch.

#### (retained for reference)

This is the "no fixed order for the user, fixed order for us" mechanic:

1. Maintain a posterior over the latent trait vector **θ** (one coordinate per dimension).
2. Initialize from a population prior.
3. After each block, update the posterior (Bayesian / MAP update against item loadings).
4. Select the next block to **maximize expected information** — the item whose loadings
   sit where our posterior is most uncertain (Fisher information, or expected KL
   divergence, at the current estimate).
5. Stop when every dimension's posterior SE drops below threshold **or** at a hard cap.

The "zone" the user described is simply the posterior mean per dimension, discretized
into labelled bands.

### 6.4 Hackathon-realistic notes

- **Item bank first.** With 4 options per block, a single pick yields ~2 bits. Estimating
  ~12 dimensions to usable precision needs on the order of **15–25 blocks** non-adaptive;
  good adaptive selection cuts that meaningfully. **Cap the user-facing quiz around 12–15
  blocks** and accept wider posteriors — completion rate beats precision for a demo.
- **Generate the item bank with AI, but the desirability matching is a hard requirement,
  not a nice-to-have.** If one option in a block is visibly the flattering answer, that
  block measures nothing. Every generated block needs a validation pass on desirability
  balance. This is the most likely place for our measurement to silently break.
- **Full Thurstonian IRT estimation is heavy.** A pragmatic Bayesian/MAP update over
  pre-assigned item loadings captures most of the value at a fraction of the build cost.
  We can describe the model correctly and implement the tractable estimator — but we
  should say which one we shipped. Not overclaiming is part of the pitch.
- **Pre-compute item loadings offline.** No live calibration; there is no calibration
  sample and no time.

---

## 7. Summary — what this buys each rubric criterion

| Criterion | What this research contributes |
|---|---|
| **Aspecto técnico (25%)** | Bayesian MAP scoring of a Thurstonian choice model over desirability-matched forced-choice blocks — a **fixed balanced form** (every latent in 15/15 blocks, maximal linking, mixed keying) · effect-size-anchored scoring with level terms, gates, and penalty-only dyadic terms · illustrative survival dynamics coupled to the children model. Weight anchoring per `PILLARS.md` A1–A2; τ is the one named unanchored parameter. *(Adaptive selection and complementarity scoring were withdrawn — see `PILLARS.md` §7.)* |
| **Originalidad (15%)** | Being the team that read the literature and built the honest version — simulation instead of prediction — while everyone else ships a match percentage. |
| **Impacto (20%)** | The proximity literature (Festinger 1950; Zajonc 1968) is direct scientific backing for the product's core thesis: the connections are already in the room. |
| **Ambición (20%)** | A calibrated psychometric instrument plus a coupled life-course simulation, built in 36 hours. |

---

## 8. Open decisions this research forces

1. **Reconsider the meet mechanic's priority.** It is currently a stretch goal, and it is
   the best-supported intervention in the entire literature. The compatibility engine is
   the hook; proximity is the mechanism.
2. **Dimension count vs. quiz length.** Every dimension costs blocks; every block costs
   completion rate. Recommend cutting Layer D to a handful of high-narrative items and
   protecting Layers A–C.
3. **Do we show the friction point?** Recommended yes — it is the honesty feature, and it
   is the best fuel the timeline generator will get.
4. **Duration output format** — survival curve vs. single number. Recommend the curve.
5. **Whether love languages appear at all.** Recommend: as timeline narrative flavor only,
   never as a scored dimension.

---

## 9. Bibliography

**Core — compatibility is hard to predict**
- Joel, S., Eastwick, P. W., & Finkel, E. J. (2017). Is romantic desire predictable? Machine learning applied to initial romantic attraction. *Psychological Science*, 28(10). https://journals.sagepub.com/doi/10.1177/0956797617714580
- Joel, S., Eastwick, P. W., et al. (2020). Machine learning uncovers the most robust self-report predictors of relationship quality across 43 longitudinal couples studies. *PNAS*, 117(32), 19061–19071. https://www.pnas.org/doi/10.1073/pnas.1917036117
- Finkel, E. J., Eastwick, P. W., Karney, B. R., Reis, H. T., & Sprecher, S. (2012). Online dating: A critical analysis from the perspective of psychological science. *Psychological Science in the Public Interest*, 13(1). https://faculty.wcas.northwestern.edu/eli-finkel/documents/2012_FinkelEastwickKarneyReisSprecher_PSPI.pdf

**Similarity and attraction**
- Montoya, R. M., Horton, R. S., & Kirchner, J. (2008). Is actual similarity necessary for attraction? A meta-analysis of actual and perceived similarity. *Journal of Social and Personal Relationships*, 25(6), 889–922. https://journals.sagepub.com/doi/10.1177/0265407508096700
- Luo, S., & Klohnen, E. C. (2005). Assortative mating and marital quality in newlyweds: A couple-centered approach. *JPSP*, 88(2), 304–326. https://pubmed.ncbi.nlm.nih.gov/15841861/

**Personality and relationship outcomes**
- Malouff, J. M., et al. (2010). The five-factor model of personality and relationship satisfaction of intimate partners: A meta-analysis. *Journal of Research in Personality*. https://www.sciencedirect.com/science/article/abs/pii/S0092656609002001

**Interpersonal style**
- Sadler, P., Ethier, N., & Woody, E. — Interpersonal complementarity. https://en.wikipedia.org/wiki/Interpersonal_complementarity_hypothesis
- Interpersonal Circumplex overview. https://link.springer.com/referenceworkentry/10.1007/978-1-4419-1005-9_1584

**Proximity, exposure, closeness**
- Festinger, L., Schachter, S., & Back, K. (1950). *Social Pressures in Informal Groups* (Westgate West study).
- Zajonc, R. B. (1968). Attitudinal effects of mere exposure. *JPSP Monograph*.
- Aron, A., et al. (1997). The experimental generation of interpersonal closeness. *PSPB*.

**Popular frameworks under scrutiny**
- Impett, E. A., Park, H. G., & Muise, A. (2024). Popular psychology through a scientific lens: Evaluating love languages from a relationship science perspective. *Current Directions in Psychological Science*. https://journals.sagepub.com/doi/10.1177/09637214231217663

**Teams and cofounders**
- Ruef, M., Aldrich, H. E., & Carter, N. M. (2003). The structure of founding teams: Homophily, strong ties, and isolation among U.S. entrepreneurs. *American Sociological Review*, 68(2), 195–222. https://journals.sagepub.com/doi/abs/10.1177/000312240306800202

**Personality and relationship outcomes (own effects)**
- Heller, D., Watson, D., & Ilies, R. (2004). The role of person versus situation in life satisfaction: A critical examination. *Psychological Bulletin*, 130(4), 574–600. (Source of the own-effect neuroticism ↔ marital satisfaction r ≈ −.26 — misattributed to Malouff in earlier drafts.)

**Dominance complementarity (evidence deliberately unexploited — see `PILLARS.md` §7.1)**
- Dryer, D. C., & Horowitz, L. M. (1997). When do opposites attract? Interpersonal complementarity versus similarity. *JPSP*, 72(3).
- Markey, P. M., & Markey, C. N. (2007). Romantic ideals, romantic obtainment, and relationship experiences. *JSPR*, 24(4).

**Measurement**
- Brown, A., & Maydeu-Olivares, A. (2011). Item response modeling of forced-choice questionnaires. *Educational and Psychological Measurement*. https://journals.sagepub.com/doi/10.1177/0013164410375112
- Brown, A., & Maydeu-Olivares, A. (2012). Fitting a Thurstonian IRT model to forced-choice data using Mplus. *Behavior Research Methods*. https://link.springer.com/article/10.3758/s13428-012-0217-x
