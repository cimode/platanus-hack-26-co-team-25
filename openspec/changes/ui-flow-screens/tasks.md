# Tasks: UI Flow Screens (1c/1d/1f)

Twin: Engram `sdd/ui-flow-screens/tasks`. Reads `specs/*/spec.md` (normative) and
`design.md` (structural). STRICT TDD: `pnpm run test`, RED on an assertion.

> **Read the reconciliation table first.** Spec and design were authored in
> parallel and disagree in eight places; R9–R12 then changed the architecture
> after U1 and U2 had shipped. **Where this file disagrees with `specs/` or
> `design.md`, this file wins** — those two documents describe ports we no longer
> own. Their acceptance criteria still bind; their file layout does not.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,220 remaining; 90–420 per unit (was ~2,450 — R9 deleted a whole layer) |
| 400-line budget risk | Low per unit; U9 is the only one at the line |
| Chained PRs recommended | Yes |
| Suggested split | ~~U1~~‖~~U2~~‖U3 → U6 → U7 → U9 (U4, U5, U8 dissolved by R9) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (`openspec/config.yaml:20`, already decided) |

**Forecasts here read ~2.5x low.** U1 shipped 732 lines against ~300; U2 shipped
782 against ~290. The estimator counts code, not this codebase's comment density.
Read every number below as a floor.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Strategy-neutral base rule.** Under `stacked-to-main` every unit branches from
`main`. Under `feature-branch-chain` U1 targets the tracker branch and each later
unit targets its immediate predecessor. No task below names a base branch.

### Suggested Work Units

| Unit | Goal | Est. | Depends on | Visible | State |
|---|---|---|---|---|---|
| U1 | rank+profile view model, `applyRankView`, alias-comment fix | ~300 | — | No | **DONE**, merged (PR #27), relocated by R9 |
| U2 | timeline view model (lens union), `tagFor`, `offspringVisible` | ~290 | — | No | **DONE**, on `feat/ui-view-models` (PR #29 closed, content rescued) |
| U3 | `useDragScroll` extracted; `RoomCanvas` migrated | ~90 | — | No | Ready |
| ~~U4~~ | ~~fixture roster + fixture `LatentSource`~~ | — | — | — | **DISSOLVED by R9/R10** |
| ~~U5~~ | ~~fixture adapters, `viewRank`/`viewProfile`, composition ×2, viewer resolver~~ | — | — | — | **DISSOLVED by R9/R10/R11** |
| U6 | `/rank` (1c) + `components/rank/*` + `mock.ts` wiring + e2e | ~380 | U3 | Yes | Ready after U3 |
| U7 | `/profile/[id]` (1d) + `components/profile/*` + `mock.ts` + e2e | ~330 | U6 | Yes | |
| ~~U8~~ | ~~timeline fixture + `simulateLife` + composition ×1~~ | — | — | — | **DISSOLVED by R9/R10** |
| U9 | `/simulate/[id]` (1f) + `components/simulate/*` + `mock.ts` + e2e | ~420 | U3, U7 | Yes | |

**Numbers are NOT reused.** U4, U5 and U8 stay struck through rather than
renumbering U6/U7/U9 down, because `apply-progress.md`, six Engram observations
and two merged PR bodies all cite these ids. A plan that renames its own units
mid-flight makes every one of those references silently wrong.

**Parallel:** nothing left to parallelise — U3 is the only unblocked unit and the
three screens are sequential (U7 reuses U6's card, U9 reuses U7's stage).

**Every remaining unit is user-visible.** The invisible-plumbing units are gone:
that was the whole point of R9. Rollback is now `git revert` of one PR — there is
no `composition.ts` line to unpick, because no screen reaches a port it owns.

## Spec ↔ Design reconciliation

Spec and design were authored in parallel and did not see each other. Each row is
decided here; apply follows this column, not either source document.

| # | Spec says | Design says | Decision | Why |
|---|---|---|---|---|
| R1 | fixture roster of `RankableParticipant` + real `meetsFloor` | fixture `Person[]` fed straight to `rankRoom` | **Spec** | A `Person[]` fixture fabricates `consent` — a safety property, not a convenience. `floorReason` must run on real rows (AC-PORT-4). |
| R2 | `tagFor`/`offspringVisible` in `src/lib/domain/timeline/` | `eventTag` in `src/lib/domain/reveal/` | **Design's folder, spec's names** | Layout is design's call; `src/lib/domain/timeline/` would be the third "timeline" beside root `timeline/` and `timeline/shared.ts`, repeating the `participant/` vs `participants/` grep tax. Names stay `tagFor` / `offspringVisible` because the ACs cite them. |
| R3 | `exit`→`roce`, `decision`→`hito`, `epilogue`→`hito`, `vignette`→`ritual` | `exit`→`mudanza`, `decision`→`roce`, `epilogue`→`ritual`, `vignette`→`viaje` | **Design** | Design argues each from meaning; the spec table is unreasoned. `exit`→`roce` paints a successful business exit amber, i.e. as a fight. No AC asserts a specific kind→token pair; totality and the 7 tokens are preserved either way. |
| R4 | `SimulatedLife` flat; AC-SIM-4 needs reading `horizonYears` under friendship to fail `tsc` | flat record with `horizonYears: number \| null` | **Spec's structure, design's `Ending`** | A nullable field cannot fail `tsc`; the union can. Keep design's `Ending` union over the spec's nullable `dissolution`+`epilogue` — it makes `epilogue` reachable only on the `apart` branch. |
| R5 | composition members are **non-getter** (AC-PORT-9) | getters from day one (D6) | **Design** | Both pass AC-PORT-9's scenarios. A plain property becomes eager `createDbRanking(getDb())` at swap time and breaks prerender on `/` and `/room`. The requirement over-specifies a mechanism to protect a property the getter also protects. |
| R6 | one resolver; `hookai_session` beats `dipia_impersonating`; no credential ⇒ chooser state, no port call | `redirect("/")` like `RoomPage` | **Spec** | The design ignores the real session cookie entirely. `redirect("/")` is the chooser, so it satisfies "offers a route back to `/`" — but precedence and the no-port-call rule are spec-only and must land. |
| R7 | AC-PORT-9 greps `src/app/**` for any `src/lib/adapters/**` import | — | **Narrow the grep** | `src/app/intake/page.tsx:4` already imports `readSessionToken` from `@/lib/adapters/http/session`, and R6's resolver must too. Assert against `getDb`, `adapters/db/**`, `drizzle-orm`; allow `adapters/http/session`. |
| R8 | AC-SIM-5: "every chip's label is one of the seven tag names" | D4: a per-kind Spanish label, colour is the family | **Design** | Found during U2, missed by the original seven. There are 16 labels and 7 tokens; both readings cannot hold. `tagFor` shipped D4's per-kind label, so **task 9.8's e2e asserts the chip's TOKEN is one of seven, never its label.** |

### R9–R12 — the post-U2 scope change

U1 and U2 shipped port interfaces for ranking, profiles, latents and timelines.
They should not have. Commit `46a798c` removed them; these four rows record what
that costs the plan, and they override every row above them where they disagree.

| # | Was | Is | Why |
|---|---|---|---|
| R9 | We own `RankingPort`, `ProfilePort`, `LatentSource`, `TimelinePort` under `src/lib/ports/` | **The ports are deleted.** The projection logic they wrapped survives as **view models colocated with their screen**: `components/rank/view.ts`, `components/profile/view.ts`, `components/simulate/{event-tag,offspring,timeline}.ts` | The other team owns the ranking contract — `prepareResults(sessionToken, lens, deps)` is pinned by `use-cases/prepare-results.test.ts` for #10, and `domain/scoring/estimate.ts` for #7 has landed. Ours was a **second contract for the same thing**, and two competing contracts are worse than none. The logic is not domain: picking one of seven colours from sixteen event kinds, picking a band, sorting a row — that is a view model, and it was only ever misfiled. |
| R10 | Fixtures live in `src/lib/adapters/reveal/*` behind a port, wired into `composition.ts` as getters (R5) | **Fixtures are `mock.ts` colocated in the screen's own folder.** `components/rank/mock.ts` exists; U7 and U9 add their own. No adapter, no port, no `composition.ts` entry | Deleting a mock must be deleting one file and one import — not unpicking a port, a getter, a `Deps` member and a `Pick`. **R5 is void** (there is no getter to argue about) and AC-PORT-9's prerender property is now trivially true: no screen of ours reaches a database at all. `pnpm run build` with `DATABASE_URL` unset stays a gate anyway. |
| R11 | A new `src/app/viewer.ts` resolver, `hookai_session` beating `dipia_impersonating` (R6) | **The viewer is the impersonated participant, resolved exactly as `/room` already resolves it**: `enterRoom(store.get(IMPERSONATION_COOKIE)?.value, serverDeps())`. **No new file.** `redirect("/")` on a null `me`, same as `RoomPage` | R6 was written for a world where our screens sat on the real `hookai_session`. They do not — the demo path is 1a picks a person, 1b shows the room, 1c ranks it, and that identity is the impersonation cookie. A second resolver preferring a session cookie no screen of ours reads is the same mistake as R9, one layer up. **R6 is void; R7's allowlist still holds** for the intake files that already use it. |
| R12 | `mock.ts` fabricates the viewer (`p-diego-morales`, hardcoded) and seven hardcoded names | **`mockRankedRoom(lens, me, others)` takes the real people in and fabricates only `position`, `band`, `bond` and `friction`** | As written today 1c contradicts 1a: pick Laura Méndez on the chooser and the ranking greets Diego Morales — and lists Laura among her own matches. `enterRoom` already returns `me` plus everyone else with a stable per-person `sprite`, through a real port. Real identity in, mocked numbers out: that is the narrowest honest seam, and it is what the demo needs when #10 lands. |

**What R9–R12 delete from this plan:** `src/lib/adapters/reveal/**`, `view-rank.ts`,
`view-profile.ts`, `simulate-life.ts`, `src/app/viewer.ts`, three `composition.ts`
getters, the fixture `LatentSource` and its FNV derivation, and every AC that only
described how those talk to each other. **What survives untouched:** every AC about
what the user sees, and every AC about what must never cross to the client.

### Deferred, with reason

- **`domain/participant/` vs `domain/participants/` rename: OUT OF SCOPE.** It
  touches `composition.ts`, `adapters/participants/roster.ts`, `enter-room.ts`,
  `/` and `/room` — the other team's import surface — at hour ~20, for zero
  behaviour change, and collides with the #4/#7/#10 branches. Mitigation is
  T1.9 + T4.1 (aliased imports and a disambiguating header), not a rename.
- **1e isometric board: not built.** `<TimelinePath>` keeps it a
  one-component swap behind `{ events, progress }` (AC-SIM-7).

## Phase U1 — Rank + profile view model (~300) — **DONE**

Merged as PR #27 (`ee42d3b`). Paths in the tasks below are the ones that were
written at the time; **R9 has since moved them**:
`domain/reveal/rank.ts` → `components/rank/view.ts`,
`domain/reveal/profile.ts` → `components/profile/view.ts`, and
`ports/{ranking,profile,latent-source}.ts` plus `domain/reveal/index.ts` are
deleted. Task 1.9's comment fix stands where it is.

- [x] 1.1 RED: `src/lib/domain/reveal/rank.test.ts` — `applyRankView` sorts by
      `position` and by `name`, filters `high`/`mid`/`all`, is stable, and never
      mutates its input. (AC-RANK-4)
- [x] 1.2 GREEN: `src/lib/domain/reveal/rank.ts` — `ViewerId`, `RankBand =
      "high" | "mid"` (no `"low"`), `RankReason`, `RankEntry`, `RankedRoom`
      status union, `RankSort`, `applyRankView`. No `rank`/`sim`/percentage
      field. (AC-PORT-3)
- [x] 1.3 `src/lib/domain/reveal/profile.ts` — `PersonProfile` with `standing`
      reusing `RankBand`/`RankReason`; `tags` are `domain/participant/tags.ts`
      slugs. (AC-PROF-3)
- [x] 1.4 `src/lib/ports/ranking.ts` — `RankingPort.forSubject(subjectId, lens)`.
      No `forRoom()`. (AC-PORT-2)
- [x] 1.5 `src/lib/ports/profile.ts` — `ProfilePort.byId(personId, viewerId,
      lens)`, returning `PersonProfile | null` for all four suppression cases.
      (AC-PROF-2)
- [x] 1.6 `src/lib/ports/latent-source.ts` — `LatentSource.byParticipants(ids)`
      returning per-id `Partial<Record<LatentName, LatentEstimate>>`. This is the
      #7 seam; do NOT name it `latent-repository.ts`. (AC-PORT-4, AC-PORT-6)
- [x] 1.7 `src/lib/domain/reveal/index.ts` — barrel. Import `Lens` from
      `domain/room/layout` only; do not declare a fourth `Lens`.
- [x] 1.8 Typecheck guard: add a `// @ts-expect-error` probe asserting a `"low"`
      band literal is rejected. (AC-PORT-3)
- [x] 1.9 Correct the **stale alias comment** in
      `src/lib/domain/participants/participant.ts:1-8` — it still reserves animal
      aliases "for the room and the ranking"; the ranking now shows real names,
      viewer-scoped. State the compensating control so the next reader does not
      re-litigate it. Add one line disambiguating this `Participant` (roster:
      `{id,name,team}`) from `domain/participant/`'s aggregate.

## Phase U2 — Timeline view model (~290) — **DONE**

Shipped on `feat/ui-flow-u2-timeline-contracts`; PR #29 was closed unmerged and
its content rescued into `46a798c`, which is why these land on
`feat/ui-view-models` instead. Paths below are **post-R9** — the files moved from
`src/lib/domain/reveal/` to `src/components/simulate/`, `git mv` where possible so
`git log --follow` still reaches the reasoning in them.

- [x] 2.1 RED **before its subject**: `src/components/simulate/event-tag.test.ts`
      — a literal `EVENT_KINDS` array of all 16 members `satisfies readonly
      EventKind[]`; assert `tagFor` returns one of the 7 tokens for each and
      never `undefined`. (AC-PORT-7)
- [x] 2.2 RED **drift trap** — same file: read root `timeline/shared.ts` with
      `node:fs`, extract the `EventKind` union members, and assert set-equality
      with our copy. `EventKind` is COPIED, not imported; the exhaustive `Record`
      only fires *after* someone updates the copy, so nothing else catches
      upstream drift. **Anchored to the repo root via `process.cwd()`**, not a
      `../` hop count — the trap fired during R9's move and read
      `~/Dev/timeline/shared.ts`. It must fire when the ENGINE moves, not when we
      do. The assertion itself is untouched.
- [x] 2.3 GREEN: `src/components/simulate/event-tag.ts` — `TimelineTag`, and
      `tagFor` as an exhaustive `Record<EventKind, {token,label}>` with **no
      `default` branch**, using R3's mapping. Per-kind Spanish label; colour is
      the family, label is the identity. (AC-PORT-7, AC-SIM-5, R8)
- [x] 2.4 RED: `src/components/simulate/offspring.test.ts` — `offspringVisible`
      is `false` when either side lacks `consent.romantic` (both orders), and
      `false` under `business`/`friendship` with full consent. (AC-PORT-8)
- [x] 2.5 GREEN: `src/components/simulate/offspring.ts`. Pure predicate only —
      **nothing renders an offspring affordance in this change.**
- [x] 2.6 `src/components/simulate/timeline.ts` — `EventKind` (copied, with a
      `// SYNC: timeline/shared.ts` comment naming the source), `LifeEvent`,
      `Ending` union, and `SimulatedLife` as a **union discriminated on lens**:
      the `friendship` branch structurally has no `horizonYears` and no `Ending`.
      (AC-SIM-3, AC-SIM-4)
- [x] 2.7 `src/components/simulate/timeline.test.ts` — `@ts-expect-error` probe
      proving `horizonYears` is unreadable on the friendship branch. (AC-SIM-4)
- [x] ~~2.8 `src/lib/ports/timeline.ts` — `TimelinePort.simulate(...)`~~
      **DELETED by R9.** `SimulatedLife` is reached by `mockSimulatedLife` in
      `components/simulate/mock.ts` (task 9.0), not through a port we own.
      AC-SIM-1 and AC-SIM-2 keep their force as the mock's null cases.

### Carried forward from U2 — read before writing any test below

**For a type-only contract the RED gate is `tsc`, never vitest.** `import type`
is erased by the vitest transform and `@ts-expect-error` is a plain comment to
it. `timeline.test.ts` reported **10 passed** at the exact moment `timeline.ts`
exported none of `Ending`, `LifeEvent`, `PairedTimeline`, `FriendshipTimeline` or
`SimulatedLife`. Every type contract in U6/U7/U9 gates RED on `pnpm run
typecheck` (TS2307/TS2305 for a missing module, TS2578 for a probe that is not
yet enforced), and **every probe is proven live by breaking the thing it
guards.**

### U2 shapes the screens inherit

- `Ending` has TWO variants, not design's three: `{outcome:"together"}` and the
  `apart` branch. `"open"` is unreachable under R4's union — the friendship
  branch has no `ending` at all — so 9.6 must not write a case for it.
- Branches are `PairedTimeline` / `FriendshipTimeline` over a non-exported
  `SimulatedLifeBase`. Both are exported; 9.4 needs to name the friendship one.
- `TAG_TOKENS` is a readonly array and `TagToken` derives from it, so 9.8 asserts
  "one of the seven" without restating seven literals.
- `offspringVisible` takes a structural `ConsentHolder`, not a `Participant`.

## Phase U3 — `useDragScroll` extraction (~90, parallel)

- [ ] 3.1 Create `src/components/shared/use-drag-scroll.ts` (`"use client"`)
      returning `{ ref, handlers }`, taking `initial: "start" | "center"`. Keep
      native `overflow-x`; handlers only nudge `scrollLeft` so touch momentum,
      trackpad, scrollbar and arrow keys survive.
- [ ] 3.2 Migrate `src/components/room/room-canvas.tsx` onto the hook.
      Behaviour unchanged — no prop, no class, no DOM change.
- [ ] 3.3 Prove it: `pnpm run test:e2e -- room` green before the PR opens. This
      is the whole justification for touching a shipped screen in a new-screen
      change (design D5); do not skip it.

## ~~Phase U4 — Fixture roster + latents~~ — DISSOLVED (R9, R10)

All five tasks deleted. They built a fixture `RankableParticipant` roster and a
fixture `LatentSource` so that a `RankingPort` implementation could run the real
`meetsFloor` and `rankRoom` over fabricated posteriors. **We no longer implement
a ranking port** — #10's `prepareResults` does, over real rows.

The one property worth keeping from 4.2/4.3 does not need a fixture roster: it
lives in U6 as task 6.0, asserted against `mock.ts` directly.

## ~~Phase U5 — Ranking/profile adapters, use cases, wiring~~ — DISSOLVED (R9, R10, R11)

All nine tasks deleted:

| Was | Why it goes |
|---|---|
| 5.1–5.4 fixture ranking + profile adapters | R9 — a second ranking contract |
| 5.5 `view-rank.ts` / `view-profile.ts` use cases | A use case whose only job is to call a mock we own is indirection with no seam in it |
| 5.6 `src/app/viewer.ts` resolver | R11 — `enterRoom` already resolves the viewer |
| 5.7 `composition.ts` getters ×2 | R10 — nothing to wire |
| 5.8 second-`LatentSource` swap test | Guards a port that no longer exists |
| 5.9 build with `DATABASE_URL` unset | **Kept**, promoted to 10.4 — it now guards the whole change, not one unit |

## Phase U6 — `/rank`, screen 1c (~380)

Depends on U3 only. `components/rank/{view,view.test,mock}.ts` already exist on
`feat/ui-view-models`; this unit consumes them and paints the screen.

- [ ] 6.0 RED **before touching the page** — `src/components/rank/mock.test.ts`,
      the surviving half of dissolved 4.2/5.1/5.2. Against
      `mockRankedRoom(lens, me, others)` for **every lens**: ≥5 entries, both
      `high` and `mid` present, `position` is 1..n contiguous with no gap, the
      viewer's own id appears in **no** entry (R12), and every entry's id is one
      of the `others` handed in. Plus the AC-PORT-3 sweep: walk the returned
      object graph and assert no key named `rank`, `sim`, `score`,
      `contribution` or `shortfall` anywhere in it. (AC-PORT-3, AC-RANK-6)
- [ ] 6.1 GREEN: re-sign `mockRankedRoom` to `(lens, me: Participant, others:
      readonly Placement[])` per R12 — the viewer and the roster come in, only
      `position`/`band`/`bond`/`friction` are fabricated. Drop the hardcoded
      `PEOPLE` table and the hardcoded `p-diego-morales` viewer; keep `BONDS`,
      `FRICTIONS` and the doc comment naming #10 as the file's expiry date. Take
      `photoUrl` from each `Placement.sprite`, which is already stable per
      person.
- [ ] 6.2 Replace `src/app/rank/page.tsx` wholesale: Server Component, lens from
      `dipia_lens` via `@/app/lens`, viewer from `enterRoom(store.get(
      IMPERSONATION_COOKIE)?.value, serverDeps())` exactly as `RoomPage` does
      (R11), `redirect("/")` on a null `me`. **No dynamic segment, no
      `searchParams` subject** — `?subject=` must be inert. (AC-RANK-1,
      AC-PORT-1)
- [ ] 6.3 `src/components/rank/band-pill.tsx` — exactly two labels,
      `BANDA ALTA`/`BANDA MEDIA`, from `--band-high*`/`--band-mid*`. Never
      `--tag-ritual`. (AC-RANK-3)
- [ ] 6.4 `src/components/rank/rank-card.tsx` (server) — position, name, photo
      or a named placeholder, one bond line, optional friction line; card does
      not collapse when `friction` is null. Reachable by
      `getByRole("link", {name})`. (AC-RANK-2)
- [ ] 6.5 `src/components/rank/rank-board.tsx` — the **only** client island
      here. Holds `{sort, band}` and calls the pure `applyRankView` from
      `./view`; consumes `useDragScroll({ initial: "start" })` from U3. Filters
      `Todos`/`Alta`/`Media` report no removed count and leave no placeholder.
      (AC-RANK-4)
- [ ] 6.6 Designed empty states: filter-with-no-matches, and the whole room
      below the floor — named, never a blank row, never naming or counting the
      absent. (AC-RANK-4, AC-RANK-6, AC-PORT-5)
- [ ] 6.7 Degraded states from `RankedRoom.status`: `not-consented` and
      `below-floor` name the step to go back to and no other person's name
      appears; no lens cookie ⇒ link to `/room` and **no data call**.
      `mockNotConsented` / `mockBelowFloor` already return those two states.
      (AC-RANK-5)
- [ ] 6.8 Thread `lens-{romantic,business,friendship}` onto the subtree. No raw
      hex, no invented utility — grep `globals.css` first; Biome does not check
      this any more. (AC-RANK-7)
- [ ] 6.9 E2E `e2e/rank.spec.ts` at 390×844 and 1280×900 — AC id at the front of
      each test name. **Set the impersonation cookie, then assert the ranking
      greets that person and never lists them** (R12). Order/positions, both band
      pills with differing computed backgrounds, `?subject=` is inert, no `%` or
      bare decimal in page text, off-screen entry found by role+name then
      `scrollIntoViewIfNeeded()`, 0 running animations under reduced motion.
      (AC-RANK-1..8, AC-PORT-3, AC-PORT-5)

## Phase U7 — `/profile/[id]`, screen 1d (~330)

Depends on U6 — it reuses the card's photo placeholder and the lens threading.

- [ ] 7.0 RED+GREEN: `src/components/profile/mock.ts` —
      `mockProfile(personId, lens, me, others)` returning `PersonProfile | null`
      from `./view`. Returns **`null` for an unknown id, for the viewer's own id,
      and for a person absent from the ranking under that lens**, so the four
      AC-PROF-2 suppression cases collapse to one indistinguishable `null`.
      `standing` is read off `mockRankedRoom` for the same lens — **never a band
      literal in this file**, or the profile and the ranking can disagree.
      (AC-PROF-2, AC-PROF-3)
- [ ] 7.1 RED: `mock.test.ts` — all four suppression causes return `null` and
      nothing distinguishes them; `standing` matches the entry's band from
      `mockRankedRoom` for every roster id × 3 lenses; `tags` are
      `domain/participant/tags.ts` slugs and are **shared only** — never a tag
      the viewer does not also hold. (AC-PROF-2, AC-PROF-3)
- [ ] 7.2 `src/app/profile/[id]/page.tsx` — Server Component; `personId` from
      the segment, viewer from `enterRoom` (R11), `notFound()` on `null`.
      (AC-PROF-1, AC-PROF-2)
- [ ] 7.3 `src/components/profile/{profile-card,avatar-stage,tag-chips}.tsx` —
      all Server Components. Shared tags only, with an explicit "nothing in
      common yet" state; photoless avatar gets a named placeholder. (AC-PROF-3)
- [ ] 7.4 Avatar bob as an **inline `style` containing `animation`** (or a class
      already listed in the reduced-motion block). No new bespoke animation
      class; `globals.css` stays unchanged. (AC-PROF-6)
- [ ] 7.5 Simulate CTA — `getByRole("link", {name})` to `/simulate/{personId}`,
      no query string, no viewer id in the URL; lens travels by cookie.
      (AC-PROF-5)
- [ ] 7.6 E2E `e2e/profile.spec.ts` — 404 bodies byte-identical across unknown
      id / below-floor / gate-failed / non-consenting; lens changes who is
      reachable; **consent-invariant DOM** across two people differing only in
      `consent.romantic`, and no accessible name matching
      `/beb[eé]|hijo|offspring/i`; motion runs, then stops under reduced motion.
      (AC-PROF-2..6, AC-PORT-8)

## ~~Phase U8 — Timeline fixture + use case~~ — DISSOLVED (R9, R10)

8.1–8.4 deleted: the fixture becomes `components/simulate/mock.ts` (task 9.0),
`simulate-life.ts` and the `timelines` composition getter go with the port.

**8.5 survives** as task 9.9 — it is a safety property, not plumbing.

Two loose ends U2 logged against this unit and R9 answered instead:

- `domain/reveal/index.ts` barrel — **deleted, not re-exported.** A barrel over
  three folders that no longer share a parent is a fiction; each screen imports
  from its own `./view` or `./timeline`.
- `TimelinePort.simulate` taking `subjectId: string` rather than `ViewerId` —
  moot, the port is gone. `mockSimulatedLife` takes `Participant` directly.

## Phase U9 — `/simulate/[id]`, screen 1f (~420)

Depends on U3 and U7. The largest remaining unit and the only one near the
400-line line — **if 9.0–9.2 alone pass ~300, stop and open the PR there**, then
take the rail and the ending card as a second slice.

- [ ] 9.0 RED+GREEN: `src/components/simulate/mock.ts` —
      `mockSimulatedLife({subjectId, otherId, lens})` returning `SimulatedLife |
      null` from `./timeline`. **`null` for an unknown id, for a person absent
      from `mockRankedRoom` under that lens, and for `otherId === subjectId`** —
      resolved through the ranking mock, never a literal. (AC-SIM-1, AC-SIM-2)
- [ ] 9.1 RED: the content must include **one event of each of the 16
      `EventKind` members** across at least one pair, so AC-SIM-5 has a subject.
      Romantic and business get a data-driven `horizonYears`; friendship returns
      the branch that structurally has none. **Never hardcode 12** — a test greps
      the module for a bare horizon literal. (AC-SIM-3, AC-SIM-4)
- [ ] 9.2 `src/app/simulate/[id]/page.tsx` — Server Component, viewer from
      `enterRoom` (R11), `notFound()` on `null`. (AC-SIM-1, AC-SIM-2)
- [ ] 9.3 `src/components/simulate/event-card.tsx` — year, narrated text,
      **exactly one** chip via `tagFor(kind)`; never two, never untagged.
      Per-item `pop-in` delay stays an inline style. (AC-SIM-5)
- [ ] 9.4 `src/components/simulate/timeline-rail.tsx` — the **only** client
      island here; consumes `useDragScroll({ initial: "center" })` from U3;
      events ascending by year. (AC-SIM-5)
- [ ] 9.5 Year header pill `Año {N} de {horizonYears}` from data. **No literal
      horizon anywhere in the component tree** — a test greps the sources.
      Friendship renders no pill and no dissolution card; name
      `FriendshipTimeline` to write that probe. (AC-SIM-3, AC-SIM-4)
- [ ] 9.6 `src/components/simulate/timeline-path.tsx` — props are exactly
      `{ events, progress }`; a third prop must fail `tsc`. No sibling reads
      layout geometry, so 1e can replace this one file. Plus `walking-pair.tsx`
      using the existing `@utility walking`. (AC-SIM-7)
- [ ] 9.7 `src/components/simulate/ending-card.tsx` — narrates `Ending`:
      `apart` names the year and renders `epilogue` after it in document order;
      `together` says they reached the horizon. **Two variants only** — do not
      write an `"open"` case, it is unreachable. No probability, percentage or
      survival fraction. (AC-SIM-6)
- [ ] 9.8 `Proponer encuentro` CTA — role + accessible name, keyboard focusable,
      **inert**: no Server Action, no write. (AC-SIM-8)
- [ ] 9.9 RED (was 8.5): `offspringVisible` is consulted nowhere in the render
      path and `SimulatedLife` carries no offspring field in this change.
      (AC-PORT-8)
- [ ] 9.10 E2E `e2e/simulate.spec.ts` — 16 kinds each render exactly one chip and
      **the chip's TOKEN is one of the seven** (R8 — never assert the label,
      there are 16 of those); `ritual` resolves from `--tag-ritual*` while the
      `high` pill resolves from `--band-high*`; self-simulation 404s;
      consent-invariant DOM and no `/beb[eé]|hijo|offspring/i` name; 0 running
      animations under reduced motion. (AC-SIM-3..9, AC-PORT-8)

## Phase 10 — Cross-cutting verification (folded into each unit's PR)

- [ ] 10.1 Hexagon grep per unit: no file under `src/app/**` or
      `src/components/**` imports `getDb`, `@/lib/adapters/db/**` or
      `drizzle-orm`. `@/lib/adapters/http/session` is the one allowed adapter
      import (R7; precedent `src/app/intake/page.tsx:4` **and**
      `src/app/intake/actions.ts:9` — the allowlist is two files, confirmed).
      Pages reach data through `serverDeps()` from `@/lib/composition`, the way
      `src/app/room/page.tsx` already does.
- [ ] 10.2 `excludedFromRoom()` is unreachable from `src/app/**` and
      `src/components/**`. (AC-PORT-5)
- [ ] 10.3 **Do not create** `to-person.ts`, `prepare-results.ts`,
      `score-participant.ts`, `estimate.ts` or `latent-repository.ts`; do not
      edit or un-skip `prepare-results.test.ts`, `to-person.test.ts`,
      `score-participant.test.ts` or `scoring.test.ts`. Assert their skipped
      count and file contents are unchanged after every unit. (AC-PORT-6)
      **This is the rule R9 exists to enforce** — the deleted ports were a
      slower, politer version of breaking it.
- [ ] 10.4 (was 5.9) `pnpm run verify` and `pnpm run build` with `DATABASE_URL`
      unset, both green before each PR opens. **pnpm only** — a mixed
      `npm`/`pnpm` `node_modules` breaks Playwright. Note that `pnpm install`
      is now required after every `main` sync: #36 added `@aws-sdk/client-s3`
      and a stale tree fails `typecheck` with TS2307, not with a missing-module
      runtime error. (AC-PORT-9)
- [ ] 10.5 `src/app/globals.css` stays **unchanged**: `--band-*`, `@utility
      walking`/`pop-in` and the `[style*="animation"]` reduced-motion guard all
      landed in `d6e0d4d`. Verify before writing a utility; nothing machine-
      checks token names since ESLint was removed. **Known gap:** the `walk` and
      `popin` keyframes have no `@utility` wrapper and do not appear in the
      `prefers-reduced-motion` block — U9 must reach them through an inline
      `style` containing `animation`, which the guard does cover.
- [ ] 10.6 Never edit `src/components/ui/**` — shadcn-owned and lint-exempt.
- [ ] 10.7 **The deleted ports stay deleted.** Grep that
      `src/lib/ports/{ranking,profile,latent-source,timeline,reveal}.ts` and
      `src/lib/domain/reveal/**` do not exist, and that nothing under `src/`
      imports them. Re-adding any of them re-opens the second-contract problem
      R9 closed. (R9, R10)
- [ ] 10.8 Every `mock.ts` carries a header comment naming **which issue
      deletes it** (#10 for rank and profile, #10 + the simulation engine for
      simulate) and states that the file is fixture data. A mock nobody can date
      becomes production data by default. (R10)
