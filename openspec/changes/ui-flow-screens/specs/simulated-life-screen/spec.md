# simulated-life-screen Specification

## Purpose

Screen 1f at `/simulate/[id]`: the simulated life for the viewer and one other person
under the active lens — the year header, tagged event cards, the walking pair along a
path, and the ending card. Variant 1e (the isometric board) is a non-goal of this
change; see below.

## Requirements

### Requirement: The simulation is scoped to the viewer's own ranking

The page SHALL call `TimelinePort.simulate({ subjectId, otherId, lens })` with
`subjectId` from the cookie resolver and `otherId` from the URL segment, and SHALL
render `notFound()` whenever the port returns `null`. The port MUST return `null` for
an unknown id, a below-floor person, a gate-failed pair, and a person who has not
consented to the active lens; those four cases MUST be indistinguishable.

#### Scenario: AC-SIM-1 · a ranked pair simulates

- GIVEN person P appears in viewer V's ranking under the romantic lens
- WHEN `/simulate/{P.id}` renders for V
- THEN both names appear and at least one event card is present

#### Scenario: AC-SIM-2 · probing an unranked person 404s (safety)

- GIVEN person Q not in V's ranked set under the active lens
- WHEN `/simulate/{Q.id}` is requested by V
- THEN the response is 404, byte-identical to the 404 for a nonexistent id

#### Scenario: AC-SIM-2 · simulating yourself 404s

- GIVEN `/simulate/{V.id}` requested by V
- WHEN the page resolves
- THEN the response is 404

### Requirement: The year header reads the horizon it was given

For a romantic or business simulation the header pill SHALL read
`Año {N} de {horizonYears}`, taking `horizonYears` from the returned value. A literal
year count MUST NOT be hardcoded anywhere in the component tree.

#### Scenario: AC-SIM-3 · the horizon is data

- GIVEN a romantic simulation with `horizonYears === 9`
- WHEN the header renders at the first event
- THEN it reads `Año 1 de 9`

#### Scenario: AC-SIM-3 · a different horizon changes the pill

- GIVEN the same pair returned with `horizonYears === 14`
- WHEN the header renders at the last event
- THEN it reads `Año 14 de 14`
- AND no component source file contains the literal `12` as a horizon

### Requirement: The friendship variant has no horizon at all

The friendship timeline structurally lacks `horizonYears`, `dissolution` and
`epilogue` (`PILLARS.md` §6.1: no survival curve, no duration claim). Under the
friendship lens the screen MUST NOT render a year-of-horizon pill, a dissolution card,
or any wording implying a duration.

#### Scenario: AC-SIM-4 · no horizon pill under friendship

- GIVEN a friendship simulation
- WHEN the screen renders
- THEN no element matching /Año \d+ de \d+/ is present
- AND no ending card claiming the friendship ended is present

#### Scenario: AC-SIM-4 · the union is enforced by the type

- GIVEN the friendship branch of the returned union
- WHEN a component reads `horizonYears` from it
- THEN `pnpm run typecheck` fails

### Requirement: Every event card carries exactly one tag from the seven

Each event SHALL render its year, its narrated text, and exactly one tag chip resolved
through `tagFor(kind)` (see `ui-read-ports` AC-PORT-7). No card MAY render untagged,
and no card MAY carry two chips. Events SHALL appear in ascending year order.

#### Scenario: AC-SIM-5 · all 16 kinds render tagged

- GIVEN a fixture simulation containing one event of each of the 16 `EventKind` members
- WHEN the screen renders
- THEN 16 cards are present, each with exactly one tag chip
- AND every chip's label is one of the seven tag names

#### Scenario: AC-SIM-5 · year order

- GIVEN events supplied out of order
- WHEN the screen renders
- THEN the cards appear in ascending year order

#### Scenario: AC-SIM-5 · bands and tags do not share tokens

- GIVEN a rendered event chip for `ritual` and a rendered rank pill for `high`
- WHEN their computed colours are compared to the token declarations
- THEN the chip resolves from `--tag-ritual*` and the pill from `--band-high*`

### Requirement: The ending card states the ending it was given

When `dissolution` is non-null the screen SHALL render an ending card naming the
dissolution year, and SHALL render the `epilogue` beat after it when present. When
`dissolution` is `null` the ending card SHALL say the pair reached the horizon
together. Neither MUST state a probability, percentage or survival fraction
(`AUDIT.md` S10).

#### Scenario: AC-SIM-6 · a dissolution ending

- GIVEN a romantic simulation with `dissolution.year === 6` and `horizonYears === 11`
- WHEN the screen renders
- THEN the ending card names year 6
- AND the page text contains no `%`

#### Scenario: AC-SIM-6 · together at the horizon

- GIVEN `dissolution === null`
- WHEN the screen renders
- THEN the ending card states they reached the horizon together

#### Scenario: AC-SIM-6 · an epilogue follows the ending

- GIVEN `epilogue` is a non-empty string
- WHEN the screen renders
- THEN its text appears after the ending card in document order

### Requirement: The path is a swappable component behind a narrow prop contract

The walking pair SHALL travel along a `<TimelinePath>` component whose entire props
contract is `{ events, progress }`. This change SHALL implement the 1f dashed path
only. No sibling of `<TimelinePath>` may read layout geometry, so 1e can later replace
this one component and touch nothing else.

#### Scenario: AC-SIM-7 · the contract is exactly two props

- GIVEN the `<TimelinePath>` declaration
- WHEN a third prop is passed by a caller
- THEN `pnpm run typecheck` rejects it

#### Scenario: AC-SIM-7 · the walking pair advances with progress

- GIVEN `progress` at the first and last events in turn
- WHEN the path renders
- THEN the walking pair's reported position differs between the two

#### Scenario: AC-SIM-7 · walking motion stops under reduced motion

- GIVEN `prefers-reduced-motion: reduce` is emulated
- WHEN `/simulate/[id]` renders
- THEN the count of running animations on the page is 0

### Requirement: The meet CTA renders and mutates nothing

The screen SHALL render one control labelled `Proponer encuentro`, reachable by role
and accessible name and keyboard focusable. Activating it MUST NOT call a Server
Action, MUST NOT write anything, and MUST NOT change what any other person can see.

#### Scenario: AC-SIM-8 · the CTA is present and focusable

- GIVEN the ending card has rendered
- WHEN the control is queried by role and name
- THEN it is found and can receive keyboard focus

#### Scenario: AC-SIM-8 · activating it is inert

- GIVEN the control
- WHEN it is activated
- THEN no network mutation is issued and the fixture state is unchanged

### Requirement: The screen renders nothing offspring-shaped, in any consent state

Per `ui-read-ports` AC-PORT-8: no offspring affordance — enabled, disabled, locked or
placeholder — and the rendered output MUST NOT vary with the other person's
`consent.romantic`.

#### Scenario: AC-SIM-9 · consent-invariant output (safety)

- GIVEN two fixture pairs identical except the other person's `consent.romantic`
- WHEN `/simulate/[id]` renders for both under the romantic lens
- THEN the two DOM outputs are identical
- AND neither contains an element whose accessible name matches /beb[eé]|hijo|offspring/i

## Non-goals

**1e — the isometric ~34-tile sine board is NOT built.** Cards, tags, `pop-in`, the
walking pair and the ending are identical across 1e and 1f; only the path differs, and
the board carries no information the dashed line does not. It is the most expensive
component in the change's scope, and shipping both doubles the surface to debug at
hour 20.

*Condition that reverses this:* if the isometric board is confirmed as the demo's
visual hook on stage, 1e replaces `<TimelinePath>` alone — a single component behind an
unchanged `{ events, progress }` contract — at a cost of roughly one screen's work.
