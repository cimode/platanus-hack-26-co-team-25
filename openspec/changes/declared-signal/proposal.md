# Proposal: Give Life Shape and Distance an input again

## Intent

Two engine terms have no source of data. `lifeShape` and `distance` are scored
at their neutral midpoint for every pair in every room, because D20 removed the
declared round and nothing replaced it. This change gives them an input.

It is **deferred on purpose** — recorded here rather than built, so the next
person does not rediscover the measurement.

## The measurement (2026-08-23, production)

Of the participants who registered through the form:

| | declared bands | tags | acquaintances |
| --- | --- | --- | --- |
| registered through the app | 0 of 6 | 0 | 0 |

Against the PILLARS §3 weight table, romantic `rank`:

| term | weight | fed by | status |
| --- | --- | --- | --- |
| `lifeShape` | 0.22 | money, rootedness, family, capacity, chronotype | **dead** |
| `commonGround` | 0.21 | tags | revived by #76 |
| `structural` | 0.17 | acquaintances, team, track, cohort | partly revived by #76 |
| `distance` | 0.08 | `distanceBand` | **dead** |
| `regulation` · `politeness` · `reliability` · `agency` | 0.27 | the twelve-block quiz | alive |
| `eligibility` | 0.05 | gender + birthdate, via `mvp-defaults` | alive |

PR #76 stopped the dead weight from flattening the room: `unmeasuredTerms`
redistributes it over the terms the instrument does collect, keeping every
published ratio. That is a correct response to having no data — it is **not** a
substitute for having data. With `lifeShape` and `distance` dead, the product
ranks on personality alone, and cannot honestly say "les une: ritmo de vida",
which is the single highest-weighted reason it has.

## Scope

### In Scope

- One source of truth for the five Life Shape inputs and `distanceBand`.
- Whatever intake surface asks for them.
- `unmeasuredTerms` ceasing to name `lifeShape` and `distance` — which it does
  by itself, from the data, with no edit.

### Out of Scope

- The weight table. PILLARS §3 numbers stand; this change feeds them, never
  reweights them.
- `AUDIT S15`. The per-person degraded path is untouched.
- Acquaintances. `structural` also reads team/track/cohort and is not dead.

## Approach

Three candidates, cheapest first. **A is recommended.**

### A · Derive the bands from the twelve-block bank

The bank already writes twelve scenarios per participant. If any of them turn
on money, rootedness, rhythm or willingness to travel, the answer already
exists and only the mapping is missing. Costs no screen and no extra tap.

**Unknown that must be resolved first:** whether the committed bank actually
contains such scenarios. Nobody has read it with this question in mind. If it
does not, A becomes "author two bank blocks", which is still cheaper than B.

### B · Two or three declared taps on the registration screen

The path the tag picker took in #76: recover `band-tap-group.tsx` from the
commit that removed it (`f03495b^`), ask only for the highest-weighted bands,
persist through `saveDeclared`. Known to work, costs taps.

### C · Leave them dead, permanently

Then delete their rows from the weight table rather than leaving 0.30 of the
vector pointing at nothing, and restate what the product claims to match on.
Honest, and the worst of the three for the product.

## Risk

`declared_at` is part of the §0 floor. `saveDeclared` sets it only when ALL six
bands are present, so a partial round (B, or A covering some bands) leaves it
null — which is correct today and must stay correct: making it fire on a subset
would put the whole room below the floor and rank nobody.
