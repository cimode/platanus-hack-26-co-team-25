# profile-screen Specification

## Purpose

Screen 1d at `/profile/[id]`: one other person as the viewer is allowed to see them —
bio card, shared tags, the bond and friction lines, the bobbing avatar stage, and the
CTA into the simulated life.

## Requirements

### Requirement: The profile is scoped to the viewer's own ranking

The page SHALL call `ProfilePort.byId(personId, viewerId, lens)` where `personId` is
the URL segment and `viewerId` comes from the cookie resolver. The port SHALL return
`null` — and the page SHALL render Next's `notFound()` — whenever the named person is
not present in the viewer's own ranked set under the active lens. A 404 MUST be the
response for an unknown id, a below-floor person, a gate-failed pair, and a person who
has not consented to the active lens; those four cases MUST be indistinguishable from
one another.

#### Scenario: AC-PROF-1 · a ranked person renders

- GIVEN person P appears in viewer V's ranking under the friendship lens
- WHEN `/profile/{P.id}` renders for V
- THEN P's name is the page heading

#### Scenario: AC-PROF-2 · probing someone else's profile 404s (safety)

- GIVEN person Q who is below the §0 floor under the active lens
- WHEN `/profile/{Q.id}` is requested by V
- THEN the response is 404
- AND the body is byte-identical to the 404 for a nonexistent id

#### Scenario: AC-PROF-2 · a non-consenting person 404s identically (safety)

- GIVEN person R with `consent[lens] === false`
- WHEN `/profile/{R.id}` is requested
- THEN the response is 404 and identical to the previous scenario's body

#### Scenario: AC-PROF-2 · the lens changes who is reachable

- GIVEN person P consents to friendship but not to romance
- WHEN `/profile/{P.id}` is requested under each lens in turn
- THEN friendship renders the profile and romance returns 404

### Requirement: The profile shows named reasons, never numbers

The page SHALL render the person's name, their photo or an intentional placeholder,
their shared tags with the viewer, one bond line naming a driver term, and at most one
friction line. It MUST NOT render a score, percentage, rank index, or any wording that
implies a numeric ordering ("87% match", "3rd best").

#### Scenario: AC-PROF-3 · content is named, not scored

- GIVEN a profile whose engine drivers are `Common Ground` and `Structural Proximity`
- WHEN it renders
- THEN a bond line naming a driver is present
- AND the page text contains no `%` and no bare decimal

#### Scenario: AC-PROF-3 · shared tags only

- GIVEN viewer V with tags `[ramen, tango]` and person P with `[ramen, ajedrez]`
- WHEN the profile renders
- THEN `ramen` is shown as shared
- AND `ajedrez` is not presented as something V shares

#### Scenario: AC-PROF-3 · no shared tags is a designed state

- GIVEN a pair with zero tag overlap
- WHEN the profile renders
- THEN the tag region renders an explicit "nothing in common yet" state, not an empty row

#### Scenario: AC-PROF-3 · a photoless profile still looks intentional

- GIVEN person P with `photoUrl === null`
- WHEN the profile renders
- THEN a placeholder carrying an accessible name occupies the avatar stage

### Requirement: The screen renders nothing offspring-shaped, in any consent state

Per `ui-read-ports` AC-PORT-8, no offspring affordance MAY render — enabled, disabled,
locked or placeholder. The rendered output MUST NOT vary with the other person's
`consent.romantic`.

#### Scenario: AC-PROF-4 · consent-invariant output (safety)

- GIVEN two fixture people identical except `consent.romantic`
- WHEN both profiles render under the romantic lens for the same viewer
- THEN the two DOM outputs are identical
- AND neither contains an element whose accessible name matches /beb[eé]|hijo|offspring/i

### Requirement: The simulate CTA carries the viewer and lens forward

The page SHALL offer one control, reachable as `getByRole("link", { name })`, that
navigates to `/simulate/{personId}`. The lens MUST travel through the cookie, not a
query parameter, and the CTA MUST NOT carry the viewer's id in the URL.

#### Scenario: AC-PROF-5 · the CTA target

- GIVEN `/profile/{P.id}` under the business lens
- WHEN the simulate control is inspected
- THEN its href is `/simulate/{P.id}` with no query string

#### Scenario: AC-PROF-5 · following the CTA preserves the lens

- GIVEN the business lens cookie
- WHEN the CTA is followed
- THEN `/simulate/{P.id}` renders under the business lens

### Requirement: The avatar stage stays inside the reduced-motion guard

Any animation this screen introduces — including the avatar bob — MUST be stopped by
the existing `prefers-reduced-motion` block, carried either as an inline `style`
containing `animation` or as a utility class name that block already lists. A new
bespoke animation class outside that list is forbidden.

#### Scenario: AC-PROF-6 · motion stops

- GIVEN `prefers-reduced-motion: reduce` is emulated
- WHEN `/profile/[id]` renders
- THEN the count of running animations on the page is 0

#### Scenario: AC-PROF-6 · motion exists without the preference

- GIVEN the preference is not set
- WHEN the page renders
- THEN at least one animation is running on the avatar stage
