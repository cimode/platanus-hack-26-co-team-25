# declared-signal Specification

## Purpose

Restore an input to the two engine terms that currently have none:
`lifeShape` (0.22 of the romantic rank vector) and `distance` (0.08). Whatever
surface supplies them, the requirements below are what "supplied" means.

Deferred by decision on 2026-08-23. PR #76 stops the missing weight from
flattening the ranking; it does not give the terms data. See `proposal.md` for
the measurement.

## Requirements

### Requirement: The five Life Shape inputs reach the row

A registered participant SHALL end intake with `money_posture`, `rootedness`,
`family_gravity`, `capacity_hours_band` and `chronotype` non-null, each a band
in 0..3. The source MAY be a declared tap, a mapping from the twelve-block
bank, or anything else — but a participant who finished intake SHALL NOT have
them null.

#### Scenario: AC-DECL-1 · a finished intake leaves no band null

- GIVEN a participant who has completed intake
- WHEN their row is read
- THEN each of the five Life Shape columns holds a band in 0..3

#### Scenario: AC-DECL-1 · the engine stops calling the term unmeasured

- GIVEN a room whose participants all finished intake
- WHEN `unmeasuredTerms(people)` runs
- THEN the result contains neither `"lifeShape"` nor `"distance"`
- AND no code change was needed to make that true

### Requirement: `distanceBand` reaches the row

`distance_band` SHALL be non-null for a participant who finished intake, a band
in 0..3 where 3 is "stays away longest".

#### Scenario: AC-DECL-2 · distance is answered

- GIVEN a participant who has completed intake
- WHEN their row is read
- THEN `distance_band` holds a band in 0..3

### Requirement: The floor does not move

`declared_at` is part of the §0 floor. It SHALL continue to be set only when
all six declared bands are present, and a partial round SHALL leave it null.

#### Scenario: AC-DECL-3 · a partial round does not fire the floor

- GIVEN a participant with four of the six bands answered
- WHEN the row is saved
- THEN `declared_at` is null
- AND the participant is still rankable (photo, identity and consent hold)

#### Scenario: AC-DECL-3 · nobody is pushed below the floor

- GIVEN a room of participants registered before this change
- WHEN a ranking is prepared
- THEN every one of them is still ranked, exactly as before

### Requirement: The weight table is not touched

PILLARS §3 numbers SHALL be unchanged by this work. This change feeds terms; it
never reweights them.

#### Scenario: AC-DECL-4 · published weights are intact

- WHEN `getWeights(lens)` is called with no options
- THEN every cell equals the PILLARS §3 value it had before this change

### Requirement: Renormalization retires on its own

`unmeasuredTerms` reads the room, not a constant. Supplying the data SHALL be
sufficient to stop the redistribution; no edit to `engine.ts` is required.

#### Scenario: AC-DECL-5 · one answer is enough to revive a term

- GIVEN a room where exactly one participant has a Life Shape band
- WHEN `unmeasuredTerms(people)` runs
- THEN `"lifeShape"` is absent from the result

### Requirement: The reason a person reads becomes true again

`bond` may name `lifeShape` ("les une: ritmo de vida"). While the term is
unmeasured that sentence is unearned. Once fed, a `lifeShape` bond SHALL be
backed by both people's answers.

#### Scenario: AC-DECL-6 · the top reason is measured

- GIVEN a pair whose top-weighted bond is `lifeShape`
- WHEN the entry renders
- THEN both participants have non-null Life Shape bands
