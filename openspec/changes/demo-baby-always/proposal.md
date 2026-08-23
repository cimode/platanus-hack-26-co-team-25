# Proposal: babyOnBoard plays on every romantic simulation (DEMO — REVERT AFTER)

## Status

**Temporary. Written to be reverted after the 2026-08-23 event.**
Two edits are marked in the source with `DEMO ONLY · revert after the event`
and point back here. Reverting is `git revert` of the commit, or the two hand
edits in §Revert.

## Why

The `babyOnBoard` reveal existed and nothing played it. Grepping
`/simulate/[id]` and its components found zero references to `action-bus`,
`fireEvent` or `BabyOnBoard` — the animation was reachable only from
`/design/baby-on-board`. The simulation produced a `kid` event, the rail drew
it as one more text card, and the reveal never ran in the product.

Two things had to be true and only one of them was:

- **The gate.** Already fully open. `kidEventAllowed` checks `wantsKids` on
  both, offspring consent on both, and the lens — and `mvp-defaults.ts` gives
  every D18 participant `wantsKids: true` and `interestedIn: GENDERS`.
  **There is no gender check anywhere**; the gate comment says "desire only,
  AUDIT S11". Two men were always allowed. Nothing was changed here.
- **The wiring.** Missing entirely. That is the permanent half of this change.

## What is permanent and what is not

**Permanent (keep):**

- `SimulatedLife.subject.photoUrl` — the viewer's own photo, so the reveal can
  put a face on both parents. D11's first named exception; set per viewer by
  `projectForViewer`, never served from the cache.
- `LifeBoard` firing `fireEvent("kid", "babyOnBoard", pair)` when the kid card
  reaches the centre of the rail. Through the BUS rather than by rendering the
  component directly, so the presenter's console control
  (`dipiaActions.fireEvent`) and the simulation reach it the same way.

**Temporary (revert):**

- The survival window on the kid arc, suspended so that every romantic pair
  gets one regardless of when they split.

## Revert

1. `src/lib/domain/timeline/index.ts` — restore `if (maxKid >= 3) {` around the
   kid-arc block and drop the `window` / `Math.max(1, …)` clamp.
2. Decide whether `LifeBoard`'s overlay stays. It is harmless with the window
   restored: no kid event, no fire, nothing renders.

## What was NOT touched

The gate itself. `kidEventAllowed` still requires `wantsKids` and offspring
consent on both sides — those are consent rules. What is suspended is the
survival condition, which is a story rule.
