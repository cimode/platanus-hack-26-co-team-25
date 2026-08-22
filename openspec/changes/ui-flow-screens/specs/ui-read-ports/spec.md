# ui-read-ports Specification

## Purpose

The three read contracts every new screen reaches data through, the domain types
they return, the fixture adapters that back them today, and the exact seam where
the other team's engine will replace those fixtures.

This is a NEW spec: `openspec/specs/` is empty.

## Ground truth this spec is written against

Already shipped, and therefore REAL surfaces this change consumes rather than mocks:

| Surface | Where |
|---|---|
| Participant aggregate, consent, photo, gates, declared bands | `src/lib/domain/participant/` |
| The §0 floor (`floorReason`, `meetsFloor`, `RankableParticipant`) | `src/lib/domain/participant/floor.ts` |
| Participant reads incl. `byRoomForRanking(roomId, lens)` | `src/lib/ports/participant-repository.ts` |
| Consent writes | `src/lib/use-cases/set-consent.ts` |
| Pure pair scoring and room ranking (`scorePair`, `rankRoom`, `bandOf`) | `src/lib/domain/matching/engine.ts` |
| `EventKind` (16 members), `Timeline` union, `horizonYears` | `timeline/shared.ts` |
| `--band-{high,mid}{,-foreground}`, 7 `--tag-*` pairs, `@utility walking` / `pop-in`, the `[style*="animation"]` reduced-motion guard | `src/app/globals.css` |

Still absent (issues #7 and #10, `status:draft`), with red/skipped tests already
in the tree naming them: `src/lib/ports/latent-repository.ts`,
`src/lib/domain/scoring/estimate.ts`, `src/lib/domain/matching/to-person.ts`,
`src/lib/use-cases/score-participant.ts`, `src/lib/use-cases/prepare-results.ts`.

**The seam sits at the latent posteriors and nothing else.** Latent estimates are
the only value this change is permitted to fabricate.

## Requirements

### Requirement: Viewer identity is resolved server-side from cookies only

Every new page SHALL resolve the viewer through a single server-side resolver that
reads only cookies. The viewer MUST NOT be taken from a route segment, query
string, form field, or header. When both credentials are present the real session
token (`hookai_session`) MUST win over the impersonation cookie
(`dipia_impersonating`); when neither resolves to a person, the page MUST render a
"choose who you are" state and MUST NOT call a ranking, profile or timeline port.

#### Scenario: AC-PORT-1 · impersonation cookie resolves the viewer

- GIVEN `dipia_impersonating` names a person on the roster and no `hookai_session`
- WHEN any of `/rank`, `/profile/[id]`, `/simulate/[id]` renders
- THEN the port call receives that person as the viewer

#### Scenario: AC-PORT-1 · a real session outranks impersonation

- GIVEN both cookies are set and resolve to different people
- WHEN the page renders
- THEN the viewer is the person behind `hookai_session`

#### Scenario: AC-PORT-1 · no credential reaches no port

- GIVEN neither cookie resolves to a person
- WHEN the page renders
- THEN no port method is called AND the page offers a route back to `/`

### Requirement: Every port signature names the viewer, and no `forRoom()` exists

The three ports SHALL be declared as:

```ts
RankingPort.forSubject(subjectId, lens): Promise<RankedRoom>
ProfilePort.byId(personId, viewerId, lens): Promise<PersonProfile | null>
TimelinePort.simulate({ subjectId, otherId, lens }): Promise<SimulatedLife | null>
```

No method MAY omit the viewer, and no `forRoom(roomId, lens)`-shaped method MAY
exist on any of them. This makes "a ranking is visible only to the person who ran
it" (`CONTEXT.md` §3, `docs/testing.md`) a property of the type, not a convention.

#### Scenario: AC-PORT-2 · a rank is unaddressable without a viewer

- GIVEN the `RankingPort` interface
- WHEN a caller tries to obtain a ranking without naming a subject
- THEN no such method exists and `pnpm run typecheck` fails on the attempt

#### Scenario: AC-PORT-2 · the viewer never comes from the URL

- GIVEN `/profile/{someone-else}` is requested with viewer V's cookie
- WHEN the page resolves its data
- THEN `ProfilePort.byId` is called with `viewerId = V`, and the URL segment is
  used only as `personId`

### Requirement: Read models cannot carry a numeric compatibility score

The types returned across these ports MUST NOT contain `rank`, `sim`, or any other
float, percentage or 0–100 figure derived from them. `RankEntry` SHALL be exactly
`{ id, name, photoUrl, position, band, bond, friction }` where
`band: "high" | "mid"` — `"low"` MUST NOT be admissible — `bond` is a named driver
label and `friction` is a named friction label or `null`. Projection from the
engine's `RankedEntry` to `RankEntry` happens in the adapter; the engine's floats
MUST NOT cross the port.

#### Scenario: AC-PORT-3 · no score in the type

- GIVEN the `RankEntry`, `PersonProfile` and `SimulatedLife` declarations
- WHEN a field holding `rank`, `sim` or a compatibility percentage is added
- THEN `pnpm run typecheck` rejects it

#### Scenario: AC-PORT-3 · no score in the DOM

- GIVEN a fully rendered `/rank`, `/profile/[id]` and `/simulate/[id]`
- WHEN the page text is scanned for `%` or a bare decimal compatibility figure
- THEN none is present

#### Scenario: AC-PORT-3 · `low` is unrepresentable

- GIVEN `band: "high" | "mid"`
- WHEN an adapter attempts to emit `"low"`
- THEN `pnpm run typecheck` rejects it

### Requirement: The fixture seam supplies inputs, never decisions

The fixture adapters MAY fabricate exactly two things: the roster of
`RankableParticipant` rows and each person's four latent posteriors. They MUST NOT
fabricate ordering, band, drivers, friction, or floor outcomes. Those SHALL be
produced by running the already-shipped pure functions — `meetsFloor` from
`src/lib/domain/participant/floor.ts` and `rankRoom` from
`src/lib/domain/matching/engine.ts` — over those rows. The latent source SHALL be a
named port (`src/lib/ports/latent-source.ts`) whose only method is
`byParticipants(ids)`, so #7's `LatentRepository` replaces it by changing one line
in `src/lib/composition.ts`.

#### Scenario: AC-PORT-4 · the fixture ranking is engine output

- GIVEN a fixture roster and a fixture latent set
- WHEN `RankingPort.forSubject(subject, lens)` resolves
- THEN the returned order and every `band` equal `rankRoom(people, subject, lens)`
  and `bandOf(...)` computed over the same rows
- AND no ordering or band literal appears in the fixture module

#### Scenario: AC-PORT-4 · swapping the latent source moves nothing above composition

- GIVEN a second `LatentSource` implementation returning different posteriors
- WHEN it is wired in `src/lib/composition.ts`
- THEN the ranking changes AND no file under `src/app/**` or `src/components/**`
  is edited

#### Scenario: AC-PORT-4 · the fixture roster exercises every floor reason

- GIVEN the fixture roster
- WHEN each of `"no-photo"`, `"no-consent"`, `"declared-incomplete"`, `"no-gate"`
  is looked up via `floorReason`
- THEN at least one row yields each reason

### Requirement: Below-floor and gate-failed people are absent, never marked

A person suppressed by the §0 floor, or excluded by a gate failure, MUST NOT appear
in any read model in any form — not greyed, not disabled, not counted, and not named
in a "hidden" tally. `excludedFromRoom()` MUST NOT be reachable from `src/app/**` or
`src/components/**`.

#### Scenario: AC-PORT-5 · suppression is invisible (safety)

- GIVEN a fixture roster containing a person with `consent.romantic === false`
- WHEN the viewer ranks under the romantic lens
- THEN that person's name and photo appear nowhere in the DOM
- AND no element reports a count of hidden or excluded people

#### Scenario: AC-PORT-5 · flipping consent is the only difference

- GIVEN two fixture rosters identical except that one person's `consent[lens]` is
  flipped
- WHEN both are rendered
- THEN the only DOM difference is that person's presence or absence, with no
  placeholder left behind

### Requirement: `tagFor(kind)` is a total function over all 16 event kinds

A pure `tagFor(kind: EventKind): TimelineTag` SHALL live in
`src/lib/domain/timeline/` and map every one of the 16 `EventKind` members onto one
of the 7 existing tag tokens. No kind MAY render untagged, and no default/fallback
branch MAY absorb an unmapped kind — an unhandled kind MUST be a compile error.

| Tag token | Kinds |
|---|---|
| `hito` | `milestone`, `job`, `venture`, `client`, `decision`, `epilogue` |
| `mudanza` | `move` |
| `mascota` | `pet` |
| `peque` | `kid` |
| `ritual` | `ritual`, `recovery`, `vignette` |
| `viaje` | `trip` |
| `roce` | `conflict`, `exit`, `dissolution` |

Rank bands MUST use `--band-*`; `--tag-ritual` MUST NOT be reused for a band.

#### Scenario: AC-PORT-7 · exhaustive over the union

- GIVEN the list of all 16 `EventKind` members
- WHEN `tagFor` is called with each
- THEN each returns one of the 7 tags and none throws or returns `undefined`

#### Scenario: AC-PORT-7 · a new kind breaks the build

- GIVEN a 17th member is added to `EventKind`
- WHEN `pnpm run typecheck` runs
- THEN it fails inside `tagFor`

### Requirement: The offspring reveal is gated on mutual romantic consent, and the UI is consent-invariant

A pure `offspringVisible(viewer, other, lens): boolean` SHALL live in
`src/lib/domain/timeline/` and return `true` only when `lens === "romantic"` AND
`viewer.consent.romantic` AND `other.consent.romantic` (`docs/domain.md` D12,
`AUDIT.md` S17). `SimulatedLife` MUST carry offspring data only when that predicate
holds, and `null` otherwise.

Separately and non-negotiably: **this change renders no offspring affordance at all**
— not enabled, not disabled, not a locked slot, not a placeholder. A locked slot
would disclose the other person's romantic consent state to the viewer, which is the
same leak the gate exists to prevent. The rendered output MUST be byte-identical
whether or not the other person has consented.

#### Scenario: AC-PORT-8 · the gate is mutual

- GIVEN viewer with `consent.romantic === true` and other with `false`
- WHEN `offspringVisible` is evaluated under the romantic lens
- THEN it returns `false`
- AND it also returns `false` with the two people swapped

#### Scenario: AC-PORT-8 · the gate is romantic-only

- GIVEN both people consent to all three lenses
- WHEN `offspringVisible` is evaluated under `business` and `friendship`
- THEN it returns `false` for both

#### Scenario: AC-PORT-8 · the UI cannot leak consent (safety)

- GIVEN two fixture pairs identical except the other person's `consent.romantic`
- WHEN `/simulate/[id]` renders for both
- THEN the two DOM outputs are identical
- AND neither contains an element whose accessible name matches /beb[eé]|hijo|offspring/i

### Requirement: This change does not occupy issue #7 or #10's files

The change MUST NOT create `src/lib/domain/matching/to-person.ts`,
`src/lib/use-cases/prepare-results.ts`, `src/lib/use-cases/score-participant.ts`,
`src/lib/domain/scoring/estimate.ts`, or `src/lib/ports/latent-repository.ts`, and
MUST NOT edit or un-skip any existing `it.skip` in the test files that name them.
Mapping a `RankableParticipant` to the engine's `Person` SHALL live inside the
ranking adapter until #10 lands, after which the adapter delegates to
`prepareResults` and deletes its local mapping.

#### Scenario: AC-PORT-6 · the other team's red tests are untouched

- GIVEN `prepare-results.test.ts`, `to-person.test.ts`, `score-participant.test.ts`
  and `scoring.test.ts`
- WHEN `pnpm run test` runs after the change
- THEN their skipped-test count and their file contents are unchanged

#### Scenario: AC-PORT-6 · the mapping is adapter-local

- GIVEN the ranking adapter
- WHEN its imports are inspected
- THEN it imports no module under `src/lib/use-cases/`

### Requirement: Composition wiring adds no database dependency

The three ports SHALL be added to `Deps`/`ServerDeps` in `src/lib/composition.ts`
as non-getter members backed by fixture adapters. Rendering `/rank`,
`/profile/[id]` or `/simulate/[id]` MUST NOT open a database connection, and
`pnpm run build` MUST still prerender with no `DATABASE_URL` set.

#### Scenario: AC-PORT-9 · no connection is opened

- GIVEN `DATABASE_URL` is unset
- WHEN `pnpm run build` runs
- THEN it succeeds and no page under the three routes fails to prerender

#### Scenario: AC-PORT-9 · the hexagon rule holds

- GIVEN every file under `src/app/**` and `src/components/**`
- WHEN their imports are inspected
- THEN none imports `getDb`, a module under `src/lib/adapters/**`, or `drizzle-orm`

## Non-goals

| Not built | Condition that would reverse it |
|---|---|
| Scoring (#7) and matching (#10) engines | They land on `main`; then the fixture adapters are replaced one line at a time in `composition.ts` |
| The offspring reveal and image generation | Both the gate above and a designed reveal exist, AND a pre-consented hero pair is pre-generated (`AUDIT.md` S17) |
| Live LLM narration from `timeline/index.ts` | Its ~33s live narration fits inside the demo's tolerance, or is pre-generated |
| Any mutation from these screens | Out of scope; every new route is read-only |
