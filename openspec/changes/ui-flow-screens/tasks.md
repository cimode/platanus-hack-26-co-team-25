# Tasks: UI Flow Screens (1c/1d/1f)

Twin: Engram `sdd/ui-flow-screens/tasks`. Reads `specs/*/spec.md` (normative) and
`design.md` (structural). STRICT TDD: `pnpm run test`, RED on an assertion.

> **Read the reconciliation table first.** Spec and design were authored in
> parallel and disagree in eight places; R9–R13 then re-drew the layer boundary
> after U1 and U2 had shipped. **Where this file disagrees with `specs/` or
> `design.md`, this file wins** — those two documents describe adapters and a
> resolver that no longer exist. Their acceptance criteria still bind; their file
> layout does not.

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
400-line budget risk: Low per unit (was High as one PR)

**Strategy-neutral base rule.** Under `stacked-to-main` every unit branches from
`main`. Under `feature-branch-chain` U1 targets the tracker branch and each later
unit targets its immediate predecessor. No task below names a base branch.

### Suggested Work Units

| Unit | Goal | Est. | Depends on | Visible | State |
|---|---|---|---|---|---|
| U1 | rank+profile view model, `applyRankView`, alias-comment fix | ~300 | — | No | **DONE**, merged (PR #27), relocated by R9 |
| U2 | timeline view model (lens union), `tagFor`, `offspringVisible` | ~290 | — | No | **DONE**, on `feat/ui-view-models` (PR #29 closed, content rescued) |
| U3 | `useDragScroll` extracted; `RoomCanvas` migrated | ~90 | — | No | **DONE** — `feat/ui-flow-u3-drag-scroll` |
| ~~U4~~ | ~~fixture roster + fixture `LatentSource`~~ | — | — | — | **DISSOLVED by R9/R10** |
| ~~U5~~ | ~~fixture adapters, `viewRank`/`viewProfile`, composition ×2, viewer resolver~~ | — | — | — | **DISSOLVED by R9/R10/R11** |
| U6 | `/rank` (1c) + `components/rank/*` + `mock.ts` wiring + e2e | ~380 | U3 | Yes | **DONE** — `feat/ui-flow-u6-rank` |
| U7 | `/profile/[id]` (1d) + `components/profile/*` + `mock.ts` + e2e | ~330 | U6 | Yes | **DONE** — `feat/ui-flow-u7-profile` |
| ~~U8~~ | ~~timeline fixture + `simulateLife` + composition ×1~~ | — | — | — | **DISSOLVED by R9/R10** |
| U9 | `/simulate/[id]` (1f) + `components/simulate/*` + `mock.ts` + e2e | ~420 | U3, U7 | Yes | **Ready** |

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

U1 and U2 put the whole reveal layer — types, ports, sorting, colour maps — under
`src/lib/`. Half of it belonged next to the screens. These four rows record the
correction and override every row above them where they disagree.

`46a798c` overshot and deleted the ports as well; **R13 below is the correction to
R9, and it is the row to read if you only read one.**

| # | Was | Is | Why |
|---|---|---|---|
| R9 | Everything reveal-shaped — types, ports, sorting, colour maps — sits under `src/lib/{domain/reveal,ports}/` | **Split by whether it has a second implementer.** The *shapes* stay put and are the shared contract; the *behaviour* moves next to the component that calls it: `applyRankView` + `RankSort` → `components/rank/view.ts`, `tagFor`/`TAG_TOKENS` → `components/simulate/event-tag.ts`, `offspringVisible` → `components/simulate/offspring.ts`, fixtures → each screen's `mock.ts` | Sorting a row the server already sent, mapping sixteen event kinds onto seven CSS tokens, choosing a Spanish label — none of that is domain logic and none of it has a second implementer. It was misfiled. **See R13: the first attempt at this deleted the shapes too, and that was wrong.** |
| R10 | Fixtures live in `src/lib/adapters/reveal/*` behind a port, wired into `composition.ts` as getters (R5) | **Fixtures are `mock.ts` colocated in the screen's own folder.** `components/rank/mock.ts` exists; U7 and U9 add their own. No adapter, no port, no `composition.ts` entry | Deleting a mock must be deleting one file and one import — not unpicking a port, a getter, a `Deps` member and a `Pick`. **R5 is void** (there is no getter to argue about) and AC-PORT-9's prerender property is now trivially true: no screen of ours reaches a database at all. `pnpm run build` with `DATABASE_URL` unset stays a gate anyway. |
| R11 | A new `src/app/viewer.ts` resolver, `hookai_session` beating `dipia_impersonating` (R6) | **The viewer is the impersonated participant, resolved exactly as `/room` already resolves it**: `enterRoom(store.get(IMPERSONATION_COOKIE)?.value, serverDeps())`. **No new file.** `redirect("/")` on a null `me`, same as `RoomPage` | R6 was written for a world where our screens sat on the real `hookai_session`. They do not — the demo path is 1a picks a person, 1b shows the room, 1c ranks it, and that identity is the impersonation cookie. A second resolver preferring a session cookie no screen of ours reads is the same mistake as R9, one layer up. **R6 is void; R7's allowlist still holds** for the intake files that already use it. |
| R12 | `mock.ts` fabricates the viewer (`p-diego-morales`, hardcoded) and seven hardcoded names | **`mockRankedRoom(lens, me, others)` takes the real people in and fabricates only `position`, `band`, `bond` and `friction`** | As written today 1c contradicts 1a: pick Laura Méndez on the chooser and the ranking greets Diego Morales — and lists Laura among her own matches. `enterRoom` already returns `me` plus everyone else with a stable per-person `sprite`, through a real port. Real identity in, mocked numbers out: that is the narrowest honest seam, and it is what the demo needs when #10 lands. |

### R13 — the correction: the shapes were never ours to delete

`46a798c` deleted `ports/{ranking,profile,latent-source}.ts`,
`domain/reveal/{rank,profile,index}.ts` and `ports/timeline.ts` on the argument
that they were "a second contract for the same thing". **That argument is false
on the facts, and the facts were one `gh issue view` away.**

The other team never wrote a competing contract. They adopted ours:

- **Issue #10** (`matching`, `status:draft`) — *"The read contract is fixed by U1
  (merged, PR #27) and **this issue implements it, not its own shape**."* It cites
  `src/lib/ports/ranking.ts` and quotes its docblock; it cites
  `src/lib/domain/reveal/rank.ts` for `RankEntry`/`RankReason`; it cites
  `ports/latent-source.ts`; and it names `rank.test.ts:136` by line as its
  evidence that `RankBand` is pinned by a live `@ts-expect-error`. It requires
  `prepareResults` to return `RankedRoom` so it structurally satisfies
  `RankingPort.forSubject`.
- **Issue #33** (`simulation`, `status:draft`) — *"`src/lib/ports/timeline.ts` and
  `src/lib/domain/reveal/timeline.ts` … are U2's deliverables. **If they exist
  when this issue starts, they are imported, never edited.** If they do not, this
  issue creates them verbatim from `design.md` 261–294."*

So deleting them removed no duplicate. It removed the **shared** contract and
left two issues pointing at nothing — and #33's fallback clause would then have
recreated the same shapes in the same place, producing the exact duplication R9
claimed to be preventing.

**The corrected line, and it is the one that generalises: a thing is contract if
someone else implements it; otherwise it is view.**

| Stays in `domain/reveal/` + `ports/` (contract) | Moves to `components/` (view) |
|---|---|
| `RankedRoom`, `RankEntry`, `RankReason`, `RankBand`, `ViewerId` | `applyRankView`, `RankSort`, `NAME_ORDER` |
| `PersonProfile` | `tagFor`, `TAG_TOKENS`, `TimelineTag` |
| `SimulatedLife`, `LifeEvent`, `Ending`, `EventKind` | `offspringVisible` |
| `RankingPort`, `ProfilePort`, `LatentSource`, `TimelinePort` | every `mock.ts` |
| the `@ts-expect-error` probes guarding those shapes | the behaviour tests |

`domain/reveal/index.ts` re-exports **types only** now. A function in that barrel
reads as something the engine team is expected to satisfy, and none of them is.

**One citation did drift and it is worth stating plainly.** #10 names
`rank.test.ts:136`; the probe now sits at `rank.test.ts:38`, because the
`applyRankView` behaviour tests that used to precede it moved to
`components/rank/view.test.ts`. Same file, same assertion, same property —
proven live by widening `RankBand` to admit `"low"` and watching **TS2578** fire
at that line, then reverting. A line number in an issue body was always going to
drift; the file and the guarantee are what #10 actually depends on.

### R14 — `RankedRoom` carries no `floorReason`, so the screen names the stage

AC-RANK-5 has two scenarios that want different copy for "you have not
consented" and "you have no photo". **The contract cannot tell them apart**: the
non-`ranked` variants are `{ status, lens }` and nothing else.

Adding a `floorReason` would widen a type issue #10 implements, on our own
authority, for copy. So U6 names the STAGE and nothing finer — `not-consented`
sends you to the consent step, `below-floor` sends you to the profile step — and
neither branch renders any other person's name, which is the part of AC-RANK-5
that actually protects someone. If #10 wants the finer reason it adds the field
and the screen reads it; one property, one line.

### R15 — three branches are dead code, and the blocker is the HARNESS, not the fixture

**Corrected after `sdd-verify` on U6.** The first version of this row said the
degraded states were untestable because the fixture cannot produce them. That
conflates two different things, and the conflation cost three unrecorded gaps.

`mockNotConsented` and `mockBelowFloor` exist precisely to construct those
states, and `<Body>` is a pure function of `RankedRoom` — so the states ARE
constructible. **What blocks them is that `vitest.config.mts` sets
`environment: "node"`: there is no jsdom, so no component branch is unit-testable
at all.** Naming that correctly matters, because the same limit hits every branch
the fixture's happy path does not walk — and by framing it as a fixture problem,
the first version filed one gap where there were four.

| Scenario | Dead code | Why the fixture never reaches it |
|---|---|---|
| AC-RANK-2 · no photo | `rank-card.tsx` `Avatar` null branch | `Placement.sprite` is `readonly string`, so `photoUrl` is never null |
| AC-RANK-4 · filter with no matches | `rank-board.tsx` empty branch | `highCount >= 1` and 17 > 7, so both bands always populate |
| AC-RANK-6 · empty room | `page.tsx` empty branch | the roster is 18 people, so `entries` is always 17 |
| AC-RANK-5 · not-consented / below-floor | `page.tsx` `<Blocked>` | the roster carries no consent, and a fixture inventing one is what R1 forbids |

**Only the last row is a fixture problem.** The first three are reachable with
honest data — a person who has not uploaded a photo is not a fabricated *consent*
value — and are left dead only because covering them needs either a component
test environment or an e2e seam neither of which U6 built.

All four branches are implemented. **None is covered by any test at any layer**,
and `tasks.md` marked 6.4 and 6.6 `[x]` without saying so. That is recorded here
rather than fixed under time pressure; the honest close is a jsdom project in
vitest, which is a change to the test harness and not to this screen.

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

Merged as PR #27 (`ee42d3b`). **Every path below still holds after R13.** What
moved is behaviour, not shapes: `applyRankView` and `RankSort` left
`domain/reveal/rank.ts` for `components/rank/view.ts`, and 1.1's behaviour tests
went with them to `components/rank/view.test.ts`. The types, the three ports, the
barrel and 1.8's `@ts-expect-error` probes are where 1.2–1.7 put them, because
issue #10 implements them.

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
`feat/ui-view-models` instead. Paths below are **post-R13**: the *types*
(`timeline.ts`) sit in `src/lib/domain/reveal/` where issue #33 expects to import
them, and the *behaviour* (`event-tag.ts`, `offspring.ts`) sits in
`src/components/simulate/` next to the cards that call it. `git mv` throughout, so
`git log --follow` still reaches the reasoning in every one of them.

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
- [x] 2.6 `src/lib/domain/reveal/timeline.ts` — `EventKind` (copied, with a
      `// SYNC: timeline/shared.ts` comment naming the source), `LifeEvent`,
      `Ending` union, and `SimulatedLife` as a **union discriminated on lens**:
      the `friendship` branch structurally has no `horizonYears` and no `Ending`.
      (AC-SIM-3, AC-SIM-4)
- [x] 2.7 `src/lib/domain/reveal/timeline.test.ts` — `@ts-expect-error` probe
      proving `horizonYears` is unreadable on the friendship branch. (AC-SIM-4)
- [x] 2.8 `src/lib/ports/timeline.ts` — `TimelinePort.simulate({subjectId,
      otherId, lens}): Promise<SimulatedLife | null>`. Deleted by `46a798c`,
      **restored by R13** — issue #33 names this exact file as the seam it fills.
      Nothing implements it yet; `mockSimulatedLife` (task 9.0) paints the screen
      meanwhile and is deliberately not an adapter behind it. (AC-SIM-1, AC-SIM-2)

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

## Phase U3 — `useDragScroll` extraction (~90) — **DONE**

- [x] 3.0 RED **before the refactor, and this was not in the plan**: the suite as
      it stood could not have caught the extraction going wrong. `"the floor
      scrolls horizontally"` passes on a plain `overflow-x-auto` div with no
      hook, no handlers and no starting offset, so 3.3's "prove it green" was
      vacuous. Two probes added to `e2e/demo-path.spec.ts` first, each proven
      live by breaking what it guards:

      | Mutation on `room-canvas.tsx` | Probe | Observed |
      |---|---|---|
      | centring deleted from the callback ref | *opens centred* | `Expected <= 1, Received 438` |
      | the four `onPointer*` props deleted | *mouse drag shoves the floor* | `Expected > 100, Received 0` |

      Each fails for its own reason only — the guards are orthogonal, not two
      spellings of one assertion.
- [x] 3.1 `src/components/shared/use-drag-scroll.ts` (`"use client"`) returning
      `{ ref, handlers }`, taking `initial: "start" | "center"`. Native
      `overflow-x` kept; the handlers only nudge `scrollLeft`, so touch momentum,
      trackpad, scrollbar and arrow keys survive. The pure arithmetic is split
      out as `initialScrollLeft(scrollWidth, clientWidth, initial)` and unit
      tested — vitest runs `environment: "node"` (no jsdom), so the hook's wiring
      cannot be unit tested and the e2e above is the only thing covering it. RED
      was 4 assertion failures against a Fake-It `return 0`.
- [x] 3.2 `src/components/room/room-canvas.tsx` migrated. No prop, no class, no
      DOM change; `overflow-x-auto` stays the caller's to declare and
      `initial: "center"` moves to the call site.
- [x] 3.3 `pnpm exec playwright test -g "1b · the room"` — **20/20 green across
      both viewports** after the migration. NB: the task originally said
      `pnpm run test:e2e -- room`; there is no `e2e/room.spec.ts` (the room lives
      in `e2e/demo-path.spec.ts` under `1b · the room`) and `pnpm run test:e2e --`
      does not forward args to playwright.

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

## Phase U6 — `/rank`, screen 1c — **DONE**

- [x] 6.0 RED: `src/components/rank/mock.test.ts` — nine properties over every
      lens. **It found two live demo bugs on its first run**, not one:
      `expected 'p-diego-morales' to be 'p-laura-mendez'` (R12, known) and
      `expected 1 to be 3` on distinct orderings — **the fixture returned the
      same ranking for all three lenses, so the lens picker on screen 1b was
      theatre.** Plus positions 1..n contiguous, every entry drawn from the
      candidates handed in, determinism across calls, both friction branches
      present, and an object-graph walk asserting no key named `rank`, `sim`,
      `score`, `contribution` or `shortfall` anywhere. (AC-PORT-3, AC-RANK-6)
- [x] 6.1 GREEN: `mockRankedRoom(lens, viewer, candidates)` per R12. Order is
      `hash(lens:viewerId:personId)` — FNV-1a copied from `domain/room/layout.ts`
      rather than exported from it, because widening a shared module's surface
      for a fixture #10 deletes is the worse trade. **The lens is IN the hash**,
      so the three readings genuinely differ. Friction is keyed on POSITION, not
      the hash, so every room of three or more is guaranteed to contain a card
      with friction and a card without — a probabilistic fixture would leave
      AC-RANK-2's null branch untested some of the time.
- [x] 6.2 `src/app/rank/page.tsx` replaced wholesale. Server Component; lens from
      `dipia_lens` checked FIRST and returned on, so no data call happens at all
      without a lens; viewer from `enterRoom` + `serverDeps()` exactly as
      `RoomPage` does (R11); `redirect("/")` on a null `me`. **`searchParams` is
      never read** — the strongest form of "`?subject=` is inert" is having no
      code that could look. (AC-RANK-1, AC-PORT-1)
- [x] 6.3 `band-pill.tsx` — two labels, `--band-*` only, never `--tag-ritual`
      (which is byte-identical to `--band-high` and means something else).
- [x] 6.4 `rank-card.tsx` (server) — position, name, photo or a NAMED
      placeholder, one bond line, optional friction. **Fixed height, not
      `min-h`**: `min-h` only stops a card collapsing below a floor, and a long
      bond label still wrapped and made that card taller than its neighbours.
      An explicit `aria-label` composes the name in reading order, because the
      browser's concatenation announced a photoless card as "sin foto 3 Camila
      Soto BANDA MEDIA…" — placeholder first, person third.
- [x] 6.5 `rank-board.tsx` — the only client island. Two `useState` and a `.map`;
      sorting and filtering are the pure `applyRankView`, dragging is U3's hook
      with `initial: "start"`. Filter chips are **native `<input type="radio">`**
      behind a transparent full-size peer, not buttons with `role="radio"`:
      Biome's a11y rule pushed for it and was right — the native group gives
      arrow-key navigation and roving focus for free.
- [x] 6.6 Empty states: filter-with-no-matches, and the room still filling in.
      Both named, neither counts or names the absent. (AC-RANK-4, AC-RANK-6)
- [x] 6.7 Degraded states rendered from `RankedRoom.status`. **See R14 and R15**:
      the copy names the stage rather than the exact floor reason, and neither
      state is reachable from the fixture, so neither has an e2e.
- [x] 6.8 `lens-{romantic,business,friendship}` on the subtree. No raw hex, no
      invented utility; every colour resolves through a token `globals.css`
      already defines. (AC-RANK-7)
- [x] 6.9 `e2e/rank.spec.ts` — **26/26 across 390×844 and 1280×900**, AC id at
      the front of each name. Two probes proven live by mutation:

      | Mutation | Probe | Observed |
      |---|---|---|
      | both band pills given the same token | AC-RANK-3 | `Expected not "rgb(251, 227, 222)"` |
      | `87%` appended to a bond label | AC-PORT-3 | `Expected pattern not /\d+([.,]\d+)?\s*%/` |

      One measurement subtlety worth keeping: AC-RANK-2's equal-height check
      reads `offsetHeight`, **not `boundingBox()`**. The cards enter on a
      staggered `pop-in`, and a bounding box is the TRANSFORMED box — measuring
      mid-animation reported four different heights for four identical cards.

### 6.10 — the redesign, after the first build was shown to the user

The first build was rejected on sight and it deserved to be. Three problems, all
structural rather than cosmetic:

- **Half a phone of dead cream below the fold.** Everything stacked from the top
  and stopped. Fixed by making the whole screen one flex column that fills the
  viewport: tight header, hairline, then the row in a `flex-1` band that takes
  ALL the slack.
- **Every person boxed in a card.** That put a border between the viewer and the
  person and turned a room into a catalogue. The people are loose now — a big
  ordinal (`1º`, in the lens accent only for first place), the sprite standing on
  its own ground-shadow ellipse, then name, band and reasons. No panel.
- **A blank background.** Screen 1c now carries the same venue as 1b, so the
  ranking reads as something happening in that room rather than a list rendered
  on a blank page. Two veils, not one: the first fades the plate in from the
  hairline, the second is a flat wash — without it the venue's own signage reads
  THROUGH the people and the row stops being the subject. **Atmosphere loses to
  content every time.**

`items-end`, not `items-center`: centred, the sprites float in mid-air over a
room; pushed down, they stand on its floor.

**The title went back to the design's words** — `Rank Romántico` /
`Rank de Negocios` / `Rank de Amistad`. The first build invented
"Con quién encajás trabajando" and then "fixed" `demo-path.spec.ts`, which had
been asserting `/negocios/i` all along. That edit is reverted: the test was
right and the screen was wrong.

Filter chips carry the design's labels too — `Todos` / `Banda alta` /
`Banda media` — with `ordenar:` and `filtrar:` legends.

### 6.11 — corrections from `sdd-verify`

- **The reduced-motion probe was time-window dependent.** It counted animations
  with `playState === "running"`, asserting at ~240ms while the staggered pop-in
  finishes by ~1.2s — so it would have started passing on its own once the page
  settled, which is a green meaning "you were late", not "the guard works". It
  now asserts `document.getAnimations().length === 0`, a property of the page
  rather than of when you looked. Re-proven live: 17 without the guard, 0 with it.
- **R15 was rewritten** — the blocker is `environment: "node"` in
  `vitest.config.mts`, not the fixture, and framing it as a fixture limit filed
  one gap where there were four. See R15 for the table of dead branches.
- **10.5's "known gap" was false** and **10.3's absence check had expired.** Both
  corrected in Phase 10.

## Phase U7 — `/profile/[id]`, screen 1d — **DONE**

- [x] 7.0 RED+GREEN: `src/components/profile/mock.ts` —
      `mockProfile(personId, room, candidates)`. **It takes the `RankedRoom`
      screen 1c already built rather than re-ranking**, and that is the
      load-bearing decision of the unit: `standing` is where this person sits in
      THIS viewer's ranking, so a second derivation would let 1c and 1d drift
      apart about the same pair. One source, one answer. RED was 4 assertion
      failures against a Fake-It `return null`.
- [x] 7.1 RED: `mock.test.ts`, 8 properties. Suppression is asserted as
      **indistinguishability**, never as "returns null for reason X" — unknown
      id and the viewer's own id must reach the same `null`, or the 404 becomes
      an oracle for who is in the room. Plus: `standing` equals the ranking's
      entry field for field; tags are exactly the intersection; the empty-tags
      and photoless states each have a subject; nothing offspring-shaped and no
      score key survives `JSON.stringify`. (AC-PROF-2, AC-PROF-3)
- [x] 7.2 `src/app/profile/[id]/page.tsx` — Server Component. `personId` from
      the segment, viewer from the impersonation cookie: **the URL names who you
      are LOOKING AT and the cookie names who is LOOKING**, and the second is
      not something a request may assert. One `null` check, one `notFound()`.
      (AC-PROF-1, AC-PROF-2)
- [x] 7.3 `components/profile/{profile-card,avatar-stage,tag-chips,standing-pill}.tsx`,
      all Server Components. **Rebuilt to the design after the first pass missed
      it entirely** — name and standing pill in the header, one dashed card with
      a mono label and the chips INSIDE it, the CTA immediately under the card
      rather than at the foot of the screen, a hairline, then the sprite taking
      the whole lower half with the "la foto real se inserta en la cara del
      sprite" note. The CTA is high on purpose: it is the only thing to do on
      this screen, and burying it under the art makes the page look like a dead
      end. See R17 for the two places the design and the spec disagree. Shared tags only — intersected in the fixture, never in
      the component, so the screen *cannot* present the other person's private
      interests as common ground even by accident. Explicit "nothing in common
      yet" state; photoless stage gets a named placeholder. Interest chips
      deliberately do NOT use `--tag-*`: that palette is screen 1f's event
      families, and the same colour meaning two things is a coincidence read as
      a relationship. (AC-PROF-3)
- [x] 7.4 Avatar bob via `@utility avatar-bob`, which `globals.css` already
      defines AND already lists in the `prefers-reduced-motion` block. No new
      bespoke class. The ground shadow deliberately does NOT bob — a shadow that
      rises with the body reads as the ground moving. (AC-PROF-6)
- [x] 7.5 Simulate CTA — `getByRole("link")` to `/simulate/{personId}`, no query
      string, no viewer id. A link that leaks out of this session names a person
      and nothing about who was looking at them. (AC-PROF-5)
- [x] 7.6 E2E `e2e/profile.spec.ts` — **8/8**. Three probes proven live:

      | Mutation | Probe | Observed |
      |---|---|---|
      | `avatar-bob` removed | AC-PROF-6 | `Expected > 0, Received 0` |
      | tags sent un-intersected | AC-PROF-3 (unit) | `expected [ 'anime', 'k-pop', …(3) ] to deeply equal []` |
      | `?from=` appended to the CTA | AC-PROF-5 | `Received "/simulate/p-diego-morales?from=5"` |

      The tag mutation is the one that matters: it is the privacy leak, caught
      as the other person's private interests being presented as shared.

### R17 — the 1d design vs AC-PROF-3, and the bio that is not invented

The design for 1d (shown after the first build) puts two things on screen that
the spec argues about.

**1. `1º en tu rank`, a rank index, on the profile.** AC-PROF-3 says the page
"MUST NOT render a score, percentage, **rank index**, or any wording that implies
a numeric ordering". The design renders exactly that, in a band-coloured pill.

**Decision: build the design.** The position is the same one screen 1c showed on
the card the viewer just tapped to get here, so it discloses nothing new *to this
viewer*; it is not a score and is not invertible into one; and the AC's own
examples — "87% match", "3rd best" — are judgements, where this is a location.
It remains the ONLY number on the screen and nothing else here may become a
second one. If the product decides otherwise it is one line in
`components/profile/standing-pill.tsx`.

**2. A "SMALL BIO" card of free prose. BUILT — the objection was answered, not
sustained.** The first pass refused to fabricate it: `PersonProfile` carries no
bio field, and adding one would put invented sentences in a named participant's
mouth. **The product owner overruled it, and correctly** — the bio is real
product, written by an AI over intake's declared data once that data exists, and
mocking a stand-in is what a fixture is for.

What the objection DID change is where it lives. `bio` is **not** on
`PersonProfile` and must not become so: issue #10 produces a ranking, not prose,
and the bio has its own future source. It sits on `ProfileView`, a screen-local
type in `components/profile/mock.ts` that extends the contract — the same rule
R9/R13 settled, applied to a field instead of a function.

`mockBio` composes from the person's OWN tags, not the shared ones. A bio is
someone describing themselves; composing it from the intersection would describe
them as a function of whoever is looking, and two viewers would read two
different people. It carries no gendered adjective either — the roster holds
names, not genders, and "Madrugadora" on a person who declared none is a guess
the product has no business making. Both properties are tested, along with a
**voseo regression guard**: generated prose is exactly where the assistant's
Rioplatense persona would leak back in, so the rule is a test now, not a note.

**3. The venue background stays on 1d**, by the product owner's call — the flow
never leaves the room. It is veiled harder than on 1c and for a concrete reason:
1c's content is short chips and big ordinals, this screen's content is a
paragraph, and a paragraph read over a sponsor wall is not atmospheric, it is
unreadable. So the wash is **opaque across the top third** and only opens below
the CTA, and the card itself is near-solid. The room shows where there is
nothing to read — which is where the person is standing anyway.

**4. The sprite caption is gone.** The first build shipped the design's
annotation, "la foto real se inserta en la cara del sprite", as if it were
product copy. It was a note to whoever reads the mockup, not to whoever uses the
app. Explaining your own art on screen is the tell of a screen that does not
trust it.

### R16 — AC-PROF-2's lens scenario is not reachable, and the e2e says so

The spec wants "P consents to friendship but not romance ⇒ friendship renders,
romance 404s". The fixture carries no consent (R15), so that scenario has no
subject. **The e2e asserts the reachable half of the same guarantee** — the same
person's profile *differs* between lenses, i.e. this is not one global profile —
and the test carries a comment saying which half it is testing and why. A test
that quietly asserted something weaker than its AC id claims would be worse than
no test.

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
      null` from `@/lib/domain/reveal/timeline`, structurally satisfying
      `TimelinePort.simulate` so issue #33 replaces it without touching a screen. **`null` for an unknown id, for a person absent
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
      import (R7). **It is now SEVEN files, not the two U2 recorded** — intake's
      `page`, `actions`, `guards`, `declared/actions` and `gates/actions`, plus
      quiz's `page` and `actions`. The rule is about the module, not the file
      count, so stop maintaining a file list: assert against `getDb`,
      `@/lib/adapters/db/**` and `drizzle-orm`, and let `adapters/http/session`
      through wherever it turns up. Pages reach data through `serverDeps()` from
      `@/lib/composition`, the way `src/app/room/page.tsx` already does.
- [ ] 10.2 `excludedFromRoom()` is unreachable from `src/app/**` and
      `src/components/**`. (AC-PORT-5)
- [ ] 10.3 **Do not create OR EDIT** `to-person.ts`, `prepare-results.ts`,
      `score-participant.ts`, `estimate.ts` or `latent-repository.ts`; do not
      edit or un-skip `prepare-results.test.ts`, `to-person.test.ts`,
      `score-participant.test.ts` or `scoring.test.ts`. Assert their skipped
      count and file contents are unchanged after every unit. (AC-PORT-6)
      **Reworded after U6's verify.** The old wording said these modules must be
      ABSENT, and that expired: `score-participant.ts` and `latent-repository.ts`
      landed on `main` via PR #37. AC-PORT-6 was never about their absence — it
      is about this change not touching the other team's surface. Check the diff,
      not the filesystem.
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
      checks token names since ESLint was removed. **The "known gap" this task
      used to record was FALSE** — `sdd-verify` checked the file: `@utility
      walking` and `@utility pop-in` both exist and both class names are listed
      in the `prefers-reduced-motion` block, alongside the `[style*="animation"]`
      attribute match. U9 can use either a class or an inline animation; do not
      route around a constraint that was never there.
- [ ] 10.6 Never edit `src/components/ui/**` — shadcn-owned and lint-exempt.
- [ ] 10.7 **The shared contract stays stable and stays type-only.** Two greps,
      because R13 made this the load-bearing check of the whole change:
      (a) `src/lib/ports/{ranking,profile,latent-source,timeline}.ts` and
      `src/lib/domain/reveal/{rank,profile,timeline,index}.ts` all exist and
      still export every name issues #10 and #33 cite; (b) `domain/reveal/index.ts`
      exports **no value** — only `export type`. A function in the barrel is a
      false promise that the engine team must satisfy something. Behaviour that
      drifts back into these files is the R9 mistake in reverse. (R9, R13)
- [ ] 10.8 Every `mock.ts` carries a header comment naming **which issue
      deletes it** (#10 for rank and profile, #10 + the simulation engine for
      simulate) and states that the file is fixture data. A mock nobody can date
      becomes production data by default. (R10)
