# Apply Progress: UI Flow Screens (1c/1d/1f)

Twin: Engram `sdd/ui-flow-screens/apply-progress`. Mode: **Strict TDD**
(`pnpm run test`, vitest). Delivery: `auto-chain` / `stacked-to-main`.

## Batch 1 — Work unit U1 (Rank + profile contracts)

**Status:** complete. 9/9 U1 tasks. Nothing user-visible ships; the unit
compiles, publishes the contract and renders nothing.

### Completed

- [x] 1.1 `src/lib/domain/reveal/rank.test.ts` — `applyRankView` sort/filter
- [x] 1.2 `src/lib/domain/reveal/rank.ts` — read model + `applyRankView`
- [x] 1.3 `src/lib/domain/reveal/profile.ts` — `PersonProfile`
- [x] 1.4 `src/lib/ports/ranking.ts` — `RankingPort.forSubject`
- [x] 1.5 `src/lib/ports/profile.ts` — `ProfilePort.byId`
- [x] 1.6 `src/lib/ports/latent-source.ts` — `LatentSource.byParticipants`
- [x] 1.7 `src/lib/domain/reveal/index.ts` — barrel, `Lens` re-exported
- [x] 1.8 `@ts-expect-error` probe rejecting a `"low"` band
- [x] 1.9 Stale animal-alias comment corrected in `domain/participants/`

### TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 1.1 / 1.2 | `domain/reveal/rank.test.ts` | Unit | N/A (new) | 5 assertion failures against an identity stub | 10/10 | 8 cases: two sorts, three bands, empty band, stability, non-mutation, fresh array | Collator hoisted to module scope |
| 1.3 | `domain/reveal/profile.test.ts` | Unit + tsc | N/A (new) | `TS2307` + 2 × `TS2578 Unused '@ts-expect-error'` | 3/3, tsc clean | 3 cases | None needed |
| 1.4–1.6 | `ports/reveal.test.ts` | Unit + tsc | N/A (new) | `TS2307` × 3 + `TS2578` × 2 | 8/8, tsc clean | `ProfilePort` null triangulated over 3 causes; `LatentSource` over present/absent pillar | None needed |
| 1.7 | — (compiled by every importer) | tsc | N/A (new) | — structural barrel | tsc clean | Skipped: re-export only, no branching | — |
| 1.8 | `domain/reveal/rank.test.ts` | tsc | N/A (new) | Widening `RankBand` to include `"low"` produced `TS2578` at `rank.test.ts:128`, proving the probe is live | tsc clean once reverted | ➖ single | — |
| 1.9 | `domain/participants/participant.test.ts` | Unit | 8/8 before, 8/8 after | Comment-only; approval baseline held | 8/8 | ➖ | — |

RED for the type-only tasks is `tsc`, not vitest: `import type` is erased by the
vitest transform, so a missing module and an unsatisfied `@ts-expect-error` are
only observable at `pnpm run typecheck`. That is the layer the contract lives
at, and both RED signals were captured before the modules existed.

### Cross-cutting verification for this unit

| Check | Result |
|---|---|
| 10.1 hexagon grep | Only `@/lib/adapters/http/session` (allowed, R7). No `getDb`, `adapters/db/**` or `drizzle-orm` under `src/app/**` or `src/components/**`. U1 touched neither tree. |
| 10.2 `excludedFromRoom()` | Not referenced from `src/app/**` or `src/components/**`. |
| 10.3 issues #7 / #10 | `to-person.ts`, `prepare-results.ts`, `score-participant.ts`, `latent-repository.ts` absent. Their four test files byte-identical to `HEAD`; 14 passed / 7 skipped, unchanged. `domain/scoring/estimate.ts` already landed on `main` in PR #17 and was not touched. |
| 10.4 gate | `pnpm run verify` green — 115 passed / 35 skipped. `pnpm run build` green with no `DATABASE_URL`; 8/8 static pages prerendered. |
| 10.5 `globals.css` | Unchanged. |
| 10.6 `src/components/ui/**` | Unchanged. |

### PR boundary

- Mode: stacked PR slice, `auto-chain` / `stacked-to-main`.
- Branch: `feat/ui-flow-u1-reveal-contracts`.
- Base: `feat/1a-venue-background` (open PR #18) while that PR is unmerged —
  it is the commit that introduces `openspec/changes/ui-flow-screens/`, which
  this unit's `tasks.md` marks live in. Retarget to `main` once #18 merges.
- Rollback: `git revert`. Nothing imports these modules yet, so the revert
  cannot break a screen.
- Review budget: ~330 changed lines net of the planning artifacts.

### Deviations from design

- Design listed `event-tag.ts` in the same slice as `rank.ts`; the tasks phase
  split it into U2. Followed the tasks phase.
- `domain/reveal/index.ts` re-exports `Lens` from `domain/room/layout` rather
  than staying silent about it, so the barrel is the one place a fourth `Lens`
  could be added and visibly is not. Still a re-export, never a declaration.
- `LatentSource.byParticipants` returns a `ReadonlyMap`, which the design left
  unspecified. `to-person.test.ts` describes `toPerson(rankable, latents,
  cohort)` taking one person's posteriors, so a keyed lookup is the shape the
  adapter needs.

### Issues found

1. **R7's allowlist is one file short.** The reconciliation cites
   `src/app/intake/page.tsx:4` as the sole precedent for importing
   `@/lib/adapters/http/session` from `src/app/**`. There is a second:
   `src/app/intake/actions.ts:9`. The 10.1 grep must allow both.
2. **`main` gained `src/lib/composition.test.ts`** (PR #26, commit `5203954`).
   It does not collide with U1, but U5 and U8 amend `composition.ts` and must
   read that test before adding the three getters.
3. **Issue #7 partially landed.** `src/lib/domain/scoring/estimate.ts` now
   exists on `main` (PR #17). `src/lib/ports/latent-repository.ts` still does
   not, so the `latent-source.ts` seam and AC-PORT-6 are both still correct —
   but the swap may arrive sooner than the plan assumed.

### Remaining

U2–U9, plus every Phase 10 check re-run per unit.

## Batch 2 — Work unit U2 (Timeline view model) — COMPLETE

8/8. Written on `feat/ui-flow-u2-timeline-contracts`. **PR #29 was CLOSED
unmerged**; its three modules and three test files were rescued into `46a798c`
on `feat/ui-view-models`, which is where they live now. Full TDD-cycle evidence
(RED transcripts, probe-liveness mutation table) is in Engram
`sdd/ui-flow-screens/apply-progress`; it is not reproduced here because the
branch it describes no longer exists.

What shipped, at post-R9 paths:

- [x] 2.1–2.3 `src/components/simulate/event-tag.{ts,test.ts}` — 16 kinds → 7
      tokens through an exhaustive `Record` with no `default` branch, plus the
      `node:fs` drift trap against root `timeline/shared.ts`.
- [x] 2.4–2.5 `src/components/simulate/offspring.{ts,test.ts}` — the mutual
      consent gate, pure predicate, no affordance.
- [x] 2.6–2.7 `src/components/simulate/timeline.{ts,test.ts}` — `SimulatedLife`
      as a lens-discriminated union; the friendship branch structurally has no
      `horizonYears` and no `Ending`.
- [x] ~~2.8 `src/lib/ports/timeline.ts`~~ — written, then deleted by R9.

## Batch 3 — R9 scope change and plan reconciliation

`46a798c` (`refactor(ui): move the reveal read models out of domain/ and ports/`)
plus `c0e3293` (`main` merged in) on `feat/ui-view-models`. **No PR yet.**

### What changed and why

U1 and U2 shipped four port interfaces — `RankingPort`, `ProfilePort`,
`LatentSource`, `TimelinePort`. The other team owns that contract:
`use-cases/prepare-results.test.ts` pins `prepareResults(sessionToken, lens,
deps)` for issue #10, and `domain/scoring/estimate.ts` for #7 already landed.
Ours was a **second contract for the same thing**, which is worse than none.

The logic inside them was never domain logic. Picking one of seven colours from
sixteen event kinds, picking a band, sorting a rank row — that is a view model,
and it was misfiled from the start. So `46a798c` is a relocation, not a deletion:

| From | To |
|---|---|
| `src/lib/domain/reveal/rank.{ts,test.ts}` | `src/components/rank/view.{ts,test.ts}` |
| `src/lib/domain/reveal/profile.{ts,test.ts}` | `src/components/profile/view.{ts,test.ts}` |
| U2's three modules (rescued from PR #29) | `src/components/simulate/` |

`git mv` where possible, so `git log --follow` still reaches the reasoning in
those files. Deleted outright: `ports/{ranking,profile,latent-source}.ts`,
`domain/reveal/index.ts`, `ports/reveal.test.ts`. Added:
`src/components/rank/mock.ts` — fixture data colocated with the screen that
paints it.

### The drift trap fired during the move — as designed

Relocating `event-tag.test.ts` broke its four `../` hops, so the trap read
`~/Dev/timeline/shared.ts` and threw ENOENT. It is now anchored to the repo root
via `process.cwd()`, so it fires when the ENGINE moves rather than when we do.
The assertion is untouched: that loud failure is the whole point of the trap.

### Plan reconciliation (this batch's real deliverable)

`tasks.md` was written against ports that no longer exist. Reconciled in place —
R8 recorded, R9–R12 added, three phases dissolved:

- **R9** — ports deleted; read models are view models colocated with screens.
- **R10** — fixtures are colocated `mock.ts`, not `adapters/reveal/*` behind a
  port. **R5 (composition getters) is void.**
- **R11** — the viewer is the impersonated participant via `enterRoom`, exactly
  as `/room` resolves it. **R6 (a new `src/app/viewer.ts`) is void; R7 holds.**
- **R12** — `mockRankedRoom` takes the real viewer and roster in and fabricates
  only `position`/`band`/`bond`/`friction`. As written it hardcoded
  `p-diego-morales`, so 1c would have contradicted whoever 1a picked — and
  listed them among their own matches.

**U4, U5 and U8 are DISSOLVED**, struck through rather than renumbered, because
`apply-progress`, six Engram observations and two merged PR bodies cite those
ids. Surviving tasks folded into their screens: 4.2/5.1/5.2 → 6.0, 5.9 → 10.4,
8.5 → 9.9. Two new cross-cutting checks: **10.7** (the deleted ports stay
deleted) and **10.8** (every mock names the issue that deletes it).

Remaining work fell from ~2,450 lines to ~1,220, and every remaining unit is now
user-visible — the invisible-plumbing units were the ones R9 deleted.

### Verification on the merged tree

`pnpm install` first — #36 added `@aws-sdk/client-s3` and a stale `node_modules`
fails `typecheck` with TS2307, not a runtime error. Then `pnpm run verify` green:
typecheck clean, biome clean over 197 files, **151 passed / 22 skipped**.
`pnpm run build` with `DATABASE_URL` unset green, 14 routes.

## Batch 4 — R13, the correction to R9

Found while opening Batch 3's PR, by reading the two issues R9 claimed to be
deferring to. **R9's premise was false, and one `gh issue view` away.**

The other team never wrote a competing contract — they adopted ours:

- **#10** (`matching`, draft): *"The read contract is fixed by U1 (merged, PR #27)
  and this issue implements it, not its own shape."* Cites `ports/ranking.ts` and
  quotes its docblock, cites `domain/reveal/rank.ts`, cites `ports/latent-source.ts`,
  and names **`rank.test.ts:136` by line**. Requires `prepareResults` to return
  `RankedRoom` so it structurally satisfies `RankingPort.forSubject`.
- **#33** (`simulation`, draft): *"`ports/timeline.ts` and
  `domain/reveal/timeline.ts` are U2's deliverables. If they exist when this issue
  starts, they are imported, never edited."*

Those files are on `origin/main` today (PR #27). `46a798c` deleted them, so
merging Batch 3 as it stood would have deleted a contract two open issues cite —
and #33's fallback clause would then have recreated the same shapes in the same
place, producing exactly the duplication R9 claimed to prevent.

### The corrected line

**A thing is contract if someone else implements it; otherwise it is view.**

Restored to `src/lib/domain/reveal/` + `src/lib/ports/`: `RankedRoom`,
`RankEntry`, `RankReason`, `RankBand`, `ViewerId`, `PersonProfile`,
`SimulatedLife`, `LifeEvent`, `Ending`, `EventKind`, the four port interfaces,
the barrel, and the `@ts-expect-error` probes that guard those shapes.

Stayed in `src/components/`: `applyRankView` + `RankSort` + `NAME_ORDER`
(`rank/view.ts`), `tagFor` / `TAG_TOKENS` / `TimelineTag` (`simulate/event-tag.ts`),
`offspringVisible` (`simulate/offspring.ts`), `mock.ts`, and the behaviour tests.

`domain/reveal/index.ts` re-exports **types only** — a function in that barrel
reads as something the engine team must satisfy, and none of them is. Check 10.7
was inverted to assert this, having previously asserted the opposite.

### Probe liveness re-proven after the split

Both guards were mutated and observed to fire across the new folder boundary:

| Mutation | Guard | Observed |
|---|---|---|
| `RankBand` widened to admit `"low"` | AC-PORT-3 | **TS2578** at `domain/reveal/rank.test.ts:38` and `profile.test.ts:47` |
| 17th `EventKind` member added | AC-PORT-7 | **TS2741** at `components/simulate/event-tag.ts:47`, inside `tagFor`'s `Record` — exactly as the AC words it — plus TS2322 on the `CoversEveryKind` guard |

Both reverted, `pnpm run verify` green after each.

**vitest reported 159 passed during the `EventKind` mutation.** The type gate is
`tsc` and only `tsc`; this is the third independent confirmation.

### One citation drifted, stated plainly

#10 names `rank.test.ts:136`; the probe now sits at `rank.test.ts:38`, because
the `applyRankView` behaviour tests that preceded it moved to
`components/rank/view.test.ts`. Same file, same assertion, same property. A line
number in an issue body was always going to drift; the file and the guarantee are
what #10 depends on.

### Verification

`pnpm run verify` green: typecheck clean, biome clean over 205 files,
**159 passed / 22 skipped** (up from 151 — the restored `ports/reveal.test.ts`
and `domain/reveal/*.test.ts` add 8).

## Batch 5 — Work unit U3 (`useDragScroll`) — COMPLETE

4/4 on `feat/ui-flow-u3-drag-scroll`, branched from `main` at `f88a3d4`
(PR #38 merged). Strict TDD.

### The task the plan did not have, and why it mattered most

3.3 said "prove it: e2e green before the PR opens." **That gate was vacuous.**
The only room-scroll test on `main` was `"the floor scrolls horizontally"`, which
asserts `scrollWidth > clientWidth` — it passes on a bare `overflow-x-auto` div
with no hook, no pointer handlers and no starting offset. Both behaviours the
hook was about to take ownership of were untested, so the refactor could have
silently dropped either.

So 3.0 was added first: two probes in `e2e/demo-path.spec.ts`, each proven live
against the **unmigrated** component before a line of it moved.

| Mutation on `room-canvas.tsx` | Probe | Observed |
|---|---|---|
| centring deleted from the callback ref | *the room opens centred, not against the left wall* | `Expected <= 1, Received 438` |
| the four `onPointer*` props deleted | *a mouse drag shoves the floor sideways* | `Expected > 100, Received 0` |

Each mutation fails **only** its own probe. The guards are orthogonal, not two
spellings of the same assertion.

The drag probe moves the mouse in two steps rather than one on purpose: a single
coalesced step would still pass against a handler that accumulates deltas instead
of measuring from the drag origin.

### The unit half

vitest runs `environment: "node"` here (`vitest.config.mts` — deliberate, the
codebase is engine-shaped), so there is no jsdom and the hook's wiring cannot be
unit tested at all. The arithmetic is therefore split out as
`initialScrollLeft(scrollWidth, clientWidth, initial)` and pinned in
`use-drag-scroll.test.ts`:

- RED 1 — `Cannot find module './use-drag-scroll'`
- RED 2 — Fake-It `return 0` ⇒ **2 assertion failures** (`expected +0 to be 1305`,
  `expected +0 to be 305.5`)
- GREEN — 4/4, and the clamp case (`Math.max(0, …)`) matters precisely because a
  browser silently clamps a negative `scrollLeft`, so a wrong sign would be
  invisible in the room and only a jsdom-less unit test catches it.

### What shipped

- `src/components/shared/use-drag-scroll.ts` — `"use client"`, returns
  `{ ref, handlers }`, takes `initial: "start" | "center"`. A **callback** ref,
  not an object ref: it runs the moment the node exists, so the first painted
  frame is already positioned instead of jumping after paint.
- `src/components/room/room-canvas.tsx` migrated. No prop, no class, no DOM
  change. `overflow-x-auto` stays the caller's to declare — the hook has no
  opinion about the element — and `initial: "center"` moves to the call site.

U6 will call it with `"start"` (rank position 1 is not something you scroll back
to); U9 with `"center"`.

### Verification

- `pnpm exec playwright test -g "1b · the room"` — **20/20 across mobile and
  desktop** after the migration.
- `pnpm run verify` — **163 passed / 22 skipped**, typecheck and biome clean.
- `pnpm run build` with `DATABASE_URL` unset — green, 14 routes.
- Phase 10 all green: 10.2 `excludedFromRoom` only in `domain/matching/`;
  10.3 the four protected files unchanged and the five forbidden modules absent;
  10.5 `globals.css` and 10.6 `components/ui/**` byte-identical to `main`;
  10.7 `domain/reveal/index.ts` exports no value.

### Correction to 3.3 and to 10.1

- **3.3's command does not exist.** There is no `e2e/room.spec.ts` — the room
  lives in `e2e/demo-path.spec.ts` under `1b · the room` — and
  `pnpm run test:e2e -- room` does not forward args to playwright. Use
  `pnpm exec playwright test -g "1b · the room"`.
- **R7's allowlist is now SEVEN files, not two.** `@/lib/adapters/http/session`
  is imported by intake's `page`, `actions`, `guards`, `declared/actions` and
  `gates/actions`, plus quiz's `page` and `actions`. The rule is about the
  module, not the file count; 10.1 was rewritten to stop maintaining a list.
- A `next dev` server on port 3000 blocks a second one **per directory**, not per
  port, so `E2E_PORT` alone does not isolate a run in the same working tree.
  Reuse the running server (`pnpm exec playwright test`) or kill it first.

## Batch 6 — Work unit U6 (`/rank`, screen 1c) — COMPLETE

10/10 on `feat/ui-flow-u6-rank`, branched from `main` at `413f59a`
(PR #40 merged). Strict TDD. **First user-visible screen of the change.**

### The probe found TWO live demo bugs, not one

6.0 was written before the screen. Its first run:

```
expected 'p-diego-morales' to be 'p-laura-mendez'   <- R12, already known
expected 1 to be 3                                   <- NEW
```

The second is the one worth carrying. `mockRankedRoom(lens)` returned the **same
ordering for all three lenses** — so screen 1b's lens picker, whose entire
promise is that romantic, business and friendship are three different readings
of the same room, was theatre. Nothing on 1b could have caught it; only a
property asserted across all three lenses at once did.

The lens is now inside the hash alongside the viewer id, so two people never see
the same room and one person never sees the same room twice.

### What shipped

| File | Role |
|---|---|
| `components/rank/mock.ts` | re-signed `(lens, viewer, candidates)`; FNV-1a ordering |
| `components/rank/mock.test.ts` | 9 properties over every lens |
| `app/rank/page.tsx` | Server Component, replaced wholesale |
| `components/rank/band-pill.tsx` | two labels, `--band-*` only |
| `components/rank/rank-card.tsx` | fixed-height card, composed `aria-label` |
| `components/rank/rank-board.tsx` | the only client island |
| `e2e/rank.spec.ts` | 26/26 across both viewports |

### Decisions that are not obvious from the diff

- **`searchParams` is never read.** The strongest form of "`?subject=` is inert"
  is having no code that could look, so the e2e compares the two documents byte
  for byte rather than checking that the ranking "looks the same".
- **The lens is checked first and returned on**, so a request with no lens
  cookie reaches no data source at all (AC-RANK-5).
- **The card is a FIXED height, not `min-h`.** `min-h` only stops a card
  collapsing below a floor; a long bond label still wrapped and made that card
  taller than its neighbours. That reads as broken layout AND made AC-RANK-2
  untestable, because the heights differed for a reason unrelated to friction.
- **The card carries an explicit `aria-label` composed in reading order.** Left
  to the browser's concatenation, a photoless card announced itself as
  "sin foto 3 Camila Soto BANDA MEDIA les une…" — placeholder first, person third.
- **Filter chips are native `<input type="radio">`** behind a transparent
  full-size peer. Biome's a11y rule pushed back on `role="radio"` buttons and was
  right: the native group brings arrow-key navigation and roving focus for free.
  A `sr-only` input is NOT enough — a clipped 1px input has no hit area, so it is
  unreachable by pointer and unactionable to Playwright (30s timeouts).
- **Friction is keyed on POSITION, not the hash**, so every room of three or more
  is guaranteed to contain both a card with friction and one without. A
  probabilistic fixture leaves AC-RANK-2's null branch untested some of the time.

### Probe liveness

| Mutation | Probe | Observed |
|---|---|---|
| both band pills given the same token | AC-RANK-3 | `Expected not "rgb(251, 227, 222)"` |
| `87%` appended to a bond label | AC-PORT-3 | `Expected pattern not /\d+([.,]\d+)?\s*%/` |

### A measurement subtlety worth keeping

AC-RANK-2's equal-height check reads **`offsetHeight`, not `boundingBox()`**. The
cards enter on a staggered `pop-in`, and a bounding box is the TRANSFORMED box —
measuring mid-animation reported four different heights for four identical cards.

### One assertion in another suite changed, and it is not a silent edit

`demo-path.spec.ts` pinned `/rank`'s heading to `/negocios/i`, which was the
**stub's** wording. The heading now echoes the picker you just clicked
("Trabajando") so the two screens speak the same language. The test's intent —
the lens survives the navigation and is named — is unchanged, and the reason is
written into the test.

### Two AC gaps recorded, not papered over

- **R14** — `RankedRoom` carries no `floorReason`, so AC-RANK-5's photo-vs-consent
  copy cannot be distinguished. The screen names the STAGE. Widening a type
  issue #10 implements, for copy, is not ours to do.
- **R15** — neither degraded state is reachable from the fixture: the roster holds
  `{id, name, team}` and no consent, and a fixture inventing consent is exactly
  what R1 forbids. Both branches are implemented; their e2e waits for #10.

### Verification

`e2e/rank.spec.ts` 26/26; `demo-path.spec.ts` + `rank.spec.ts` together 64/64.
`pnpm run verify` **178 passed / 21 skipped**. `pnpm run build` with
`DATABASE_URL` unset green, 14 routes. Phase 10 all clean.

Full-suite failures are `quiz.spec.ts` and `intake-declared.spec.ts`, which need
`DATABASE_URL`; this diff touches nothing under either.

### Remaining

U7 (`/profile/[id]`) then U9 (`/simulate/[id]`), plus Phase 10 per unit.
**`sdd-verify` now runs per unit** — the user's call after noticing it had been
skipped for U3 and U6.
