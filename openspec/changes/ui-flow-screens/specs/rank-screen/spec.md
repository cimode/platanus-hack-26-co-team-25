# rank-screen Specification

## Purpose

Screen 1c at `/rank`: the viewer's own ranked room under the active lens — sort
control, band filters, and a horizontally scrolled rank row. Replaces the stub in
`src/app/rank/page.tsx` wholesale.

## Requirements

### Requirement: The route takes no subject, and the ranking belongs to the viewer

`/rank` SHALL accept no dynamic segment, no `?subject=`, and no other request-borne
identity. The subject SHALL be the resolved viewer (see `ui-read-ports`
AC-PORT-1). Adding a route segment or reading a subject from `searchParams` is
forbidden.

#### Scenario: AC-RANK-1 · the ranking is the viewer's

- GIVEN viewer V with the romantic lens chosen
- WHEN `/rank` renders
- THEN `RankingPort.forSubject` is called exactly once with `(V.id, "romantic")`

#### Scenario: AC-RANK-1 · a subject cannot be injected (safety)

- GIVEN viewer V
- WHEN `/rank?subject={other-id}` is requested
- THEN the rendered ranking is identical to `/rank`
- AND `RankingPort.forSubject` is still called with `V.id`

### Requirement: Entries render in engine order with a visible position and band

Each entry SHALL render its `position` (1-based, matching the port's order), the
person's name, their photo or an intentional placeholder, one `bond` line, and — when
present — one `friction` line. Every entry SHALL be reachable by
`getByRole("link", { name })` or `getByRole("button", { name })`; class names MUST
NOT be the target of any assertion.

#### Scenario: AC-RANK-2 · order and content

- GIVEN a fixture room whose engine ranking is `[B, C, A]` for viewer V
- WHEN `/rank` renders
- THEN the three entries appear in that document order with positions 1, 2, 3
- AND each shows exactly one bond label

#### Scenario: AC-RANK-2 · friction is optional

- GIVEN an entry whose `friction` is `null`
- WHEN it renders
- THEN no friction line is present for that entry, and the card does not collapse

#### Scenario: AC-RANK-2 · an entry with no photo still looks intentional

- GIVEN an entry whose `photoUrl` is `null`
- WHEN it renders
- THEN a placeholder with an accessible name is present, not an empty box

### Requirement: Only two bands exist on this surface

Band pills SHALL render exactly two labels: `BANDA ALTA` for `high` and
`BANDA MEDIA` for `mid`, coloured from `--band-high*` / `--band-mid*`. No third pill
MAY exist, and eligible-but-low pairs MUST NOT appear anywhere on the screen.

#### Scenario: AC-RANK-3 · both bands render distinctly

- GIVEN a fixture room producing at least one `high` and one `mid` entry
- WHEN `/rank` renders
- THEN both pills are present with their own accessible text
- AND their computed background colours differ

#### Scenario: AC-RANK-3 · no low band leaks

- GIVEN a fixture room where the engine produces an eligible pair with
  `bandOf(rank) === "low"`
- WHEN `/rank` renders
- THEN that person is absent from the DOM

### Requirement: Band filters narrow the row without disclosing what was removed

The screen SHALL offer filters `Todos`, `Alta`, `Media`. Selecting one SHALL narrow
the visible entries and MUST NOT report how many were removed, nor leave a
placeholder for them.

#### Scenario: AC-RANK-4 · filtering to Alta

- GIVEN a room with 2 `high` and 3 `mid` entries
- WHEN the user activates `Alta`
- THEN exactly the 2 high entries remain reachable by role and name
- AND no text stating a count of hidden entries is present

#### Scenario: AC-RANK-4 · a filter with no matches

- GIVEN a room with no `high` entries
- WHEN the user activates `Alta`
- THEN a designed empty state with an accessible name renders, not a blank row

### Requirement: The screen degrades honestly when the viewer cannot be ranked

When the viewer is below the §0 floor for the active lens, the screen SHALL state
which step to go back to, derived from `floorReason`, and MUST NOT render an empty
rank row as if the room were empty. When no lens cookie is set, the screen SHALL
prompt the user back to `/room` and MUST NOT call `RankingPort`.

#### Scenario: AC-RANK-5 · viewer has not consented to this lens

- GIVEN viewer V with `consent.romantic === false` and the romantic lens chosen
- WHEN `/rank` renders
- THEN the copy names consent as the missing step
- AND no other person's name appears in the DOM

#### Scenario: AC-RANK-5 · viewer has no photo

- GIVEN viewer V with `photoUrl === null`
- WHEN `/rank` renders
- THEN the copy names the photo step and links onward to it

#### Scenario: AC-RANK-5 · no lens chosen

- GIVEN no `dipia_lens` cookie
- WHEN `/rank` renders
- THEN `RankingPort.forSubject` is not called AND a link back to `/room` is present

### Requirement: The room can be empty, and that is a designed state

When the viewer clears the floor but no other person in the room does, the screen
SHALL render an empty state that explains the room is still filling in, and MUST NOT
imply that specific people declined.

#### Scenario: AC-RANK-6 · empty room

- GIVEN a fixture room where every other row is below the floor
- WHEN `/rank` renders
- THEN an empty state with an accessible name renders
- AND no name, photo or count of the below-floor people appears

### Requirement: The active lens recolours the subtree

The rendered subtree SHALL carry `lens-romantic`, `lens-business` or
`lens-friendship` per the `dipia_lens` cookie, so `--primary` and `shadow-toy`
follow. Components MUST NOT hardcode an accent; no raw hex and no invented utility
may appear.

#### Scenario: AC-RANK-7 · the lens threads through

- GIVEN each of the three lens cookie values in turn
- WHEN `/rank` renders
- THEN the resolved `--primary` differs between business, friendship and the
  `:root` coral that romantic deliberately equals

### Requirement: The horizontal rank row stays operable and reduced-motion safe

Every entry in the horizontally scrolled row SHALL be keyboard reachable and
targetable by role and accessible name even when off-screen; visibility assertions
SHALL scroll it into view first. Any animation introduced by this screen MUST be
stopped by the existing `prefers-reduced-motion` block — that is, carried either as
an inline `style` containing `animation` or as one of the utility class names the
block already lists.

#### Scenario: AC-RANK-8 · off-screen entries are reachable

- GIVEN a room of 10 entries at the 390×844 viewport
- WHEN the last entry is queried by role and name
- THEN it is found, and becomes visible after being scrolled into view

#### Scenario: AC-RANK-8 · motion stops under reduced motion

- GIVEN `prefers-reduced-motion: reduce` is emulated
- WHEN `/rank` renders
- THEN the count of running animations on the page is 0
