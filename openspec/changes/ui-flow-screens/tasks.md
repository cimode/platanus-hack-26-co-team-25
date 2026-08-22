# Tasks: UI Flow Screens (1c/1d/1f)

Twin: Engram `sdd/ui-flow-screens/tasks`. Reads `specs/*/spec.md` (normative) and
`design.md` (structural). STRICT TDD: `pnpm run test`, RED on an assertion.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2,450 total; 90–380 per unit |
| 400-line budget risk | High as one PR — Low per unit |
| Chained PRs recommended | Yes |
| Suggested split | U1‖U2‖U3 → U4 → U5 → U6 → U7 → U8 → U9 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (`openspec/config.yaml:20`, already decided) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Strategy-neutral base rule.** Under `stacked-to-main` every unit branches from
`main`. Under `feature-branch-chain` U1 targets the tracker branch and each later
unit targets its immediate predecessor. No task below names a base branch.

### Suggested Work Units

| Unit | Goal | Est. | Depends on | Visible |
|---|---|---|---|---|
| U1 | rank+profile read model, `RankingPort`/`ProfilePort`/`LatentSourcePort`, `applyRankView`, alias-comment fix | ~300 | — | No |
| U2 | timeline read model (lens union), `tagFor`, `offspringVisible`, `TimelinePort` | ~290 | — | No |
| U3 | `useDragScroll` extracted; `RoomCanvas` migrated | ~90 | — | No |
| U4 | fixture `RankableParticipant` roster + fixture `LatentSource` | ~250 | U1 | No |
| U5 | ranking+profile fixture adapters, `viewRank`/`viewProfile`, composition ×2, viewer resolver | ~380 | U1, U4 | No |
| U6 | `/rank` (1c) + `components/rank/*` + e2e | ~340 | U3, U5 | Yes |
| U7 | `/profile/[id]` (1d) + `components/profile/*` + e2e | ~270 | U5, U6 | Yes |
| U8 | timeline fixture + `simulateLife` + composition ×1 | ~230 | U2, U4 | No |
| U9 | `/simulate/[id]` (1f) + `components/timeline/*` + e2e | ~300 | U3, U7, U8 | Yes |

**Parallel:** U1 ‖ U2 ‖ U3 (disjoint files, no shared imports). Everything else
is sequential. **U1–U5 and U8 ship no user-visible change** and revert without
touching a screen; rollback is `git revert` plus deleting the port's line in
`composition.ts` for U5 and U8.

**Design slice 6 (~500) confirmed over budget** — split into U8 + U9. Two further
overruns the design did not forecast: its slice 1 grows past 400 once
`offspringVisible`, `LatentSourcePort` and the timeline union (all spec-only) are
counted → split into U1 + U2; its slice 3 grows past 400 once the fixture supplies
`RankableParticipant` rows instead of `Person` literals → split into U4 + U5.

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

### Deferred, with reason

- **`domain/participant/` vs `domain/participants/` rename: OUT OF SCOPE.** It
  touches `composition.ts`, `adapters/participants/roster.ts`, `enter-room.ts`,
  `/` and `/room` — the other team's import surface — at hour ~20, for zero
  behaviour change, and collides with the #4/#7/#10 branches. Mitigation is
  T1.9 + T4.1 (aliased imports and a disambiguating header), not a rename.
- **1e isometric board: not built.** `<TimelinePath>` keeps it a
  one-component swap behind `{ events, progress }` (AC-SIM-7).

## Phase U1 — Rank + profile contracts (~300, parallel)

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

## Phase U2 — Timeline contracts (~290, parallel with U1)

- [x] 2.1 RED **before its subject**: `src/lib/domain/reveal/event-tag.test.ts`
      — a literal `EVENT_KINDS` array of all 16 members `satisfies readonly
      EventKind[]`; assert `tagFor` returns one of the 7 tokens for each and
      never `undefined`. (AC-PORT-7)
- [x] 2.2 RED **drift trap** — same file: read root `timeline/shared.ts` with
      `node:fs`, extract the `EventKind` union members, and assert set-equality
      with our copy. `EventKind` is COPIED, not imported; the exhaustive `Record`
      only fires *after* someone updates the copy, so nothing else catches
      upstream drift. A loud failure here is the intended behaviour if root
      `timeline/` moves.
- [x] 2.3 GREEN: `src/lib/domain/reveal/event-tag.ts` — `TimelineTag`, and
      `tagFor` as an exhaustive `Record<EventKind, {token,label}>` with **no
      `default` branch**, using R3's mapping. Per-kind Spanish label; colour is
      the family, label is the identity. (AC-PORT-7, AC-SIM-5)
- [x] 2.4 RED: `src/lib/domain/reveal/offspring.test.ts` — `offspringVisible`
      is `false` when either side lacks `consent.romantic` (both orders), and
      `false` under `business`/`friendship` with full consent. (AC-PORT-8)
- [x] 2.5 GREEN: `src/lib/domain/reveal/offspring.ts`. Pure predicate only —
      **nothing renders an offspring affordance in this change.**
- [x] 2.6 `src/lib/domain/reveal/timeline.ts` — `EventKind` (copied, with a
      `// SYNC: timeline/shared.ts:78-82` comment naming the source line),
      `LifeEvent`, `Ending` union, and `SimulatedLife` as a **union discriminated
      on lens**: the `friendship` branch structurally has no `horizonYears` and
      no `Ending`. (AC-SIM-3, AC-SIM-4)
- [x] 2.7 `src/lib/domain/reveal/timeline.test.ts` — `@ts-expect-error` probe
      proving `horizonYears` is unreadable on the friendship branch. (AC-SIM-4)
- [x] 2.8 `src/lib/ports/timeline.ts` — `TimelinePort.simulate({subjectId,
      otherId, lens}): Promise<SimulatedLife | null>`. (AC-SIM-1, AC-SIM-2)

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

## Phase U4 — Fixture roster + latents (~250)

- [ ] 4.1 `src/lib/adapters/reveal/fixture-roster.ts` — 18 `RankableParticipant`
      rows keyed on the existing `adapters/participants/roster.ts` ids, carrying
      real `photoUrl`, `consent`, `declaredAt`, gates and `acquaintances`. Import
      the type explicitly from `@/lib/domain/participant/floor`; add a header
      comment naming the singular/plural split.
- [ ] 4.2 RED: `fixture-roster.test.ts` — every one of `"no-photo"`,
      `"no-consent"`, `"declared-incomplete"`, `"no-gate"` is produced by at
      least one row via the real `floorReason`. **No floor literal in the
      fixture.** (AC-PORT-4)
- [ ] 4.3 RED: at least one row per lens has `consent[lens] === false`, so
      AC-PORT-5's suppression scenarios have real subjects.
- [ ] 4.4 `src/lib/adapters/reveal/fixture-latents.ts` — implements
      `LatentSource`; four posteriors per id derived from a stable FNV hash of
      the id (the trick `domain/room/layout.ts` already uses), not 72 literals.
- [ ] 4.5 RED: derivation is deterministic across calls and total over the
      roster — every id yields all four latents.

## Phase U5 — Ranking/profile adapters, use cases, wiring (~380)

- [ ] 5.1 RED **before its subject** (design's flagged pre-test): for **every
      roster id × all 3 lenses**, `RankingPort.forSubject` yields ≥5 entries and
      both `high` and `mid` are present. A bad hash derivation could rank
      everyone ineligible or into one band and nothing else would catch it.
- [ ] 5.2 RED: no returned object anywhere in `RankedRoom` carries a `rank`,
      `sim` or `contribution`/`shortfall` key — walk the object graph.
      (AC-PORT-3)
- [ ] 5.3 GREEN: `src/lib/adapters/reveal/fixture-ranking.ts` — map
      `RankableParticipant` + latents → engine `Person` **locally in this
      adapter**, run `meetsFloor`, then `rankRoom`, then project to `RankEntry`
      dropping every float. Order and band come from the engine; **no ordering or
      band literal in the module**. Imports nothing under `src/lib/use-cases/`.
      (AC-PORT-4, AC-PORT-6)
- [ ] 5.4 RED+GREEN: `src/lib/adapters/reveal/fixture-profile.ts` — returns
      `null` for unknown id, below-floor, gate-failed and non-consenting alike;
      `standing` is read off the same ranking. (AC-PROF-2)
- [ ] 5.5 RED+GREEN: `src/lib/use-cases/view-rank.ts` and `view-profile.ts` —
      port in, read model out, mirroring `enter-room.ts`. Tests use an inline
      in-memory fake port and import no adapter.
- [ ] 5.6 RED+GREEN: `src/app/viewer.ts` — the single cookie resolver.
      `hookai_session` (via `@/lib/adapters/http/session`) wins over
      `dipia_impersonating`; neither resolving returns a "no viewer" value and
      the caller must not call a port. Cookies only — never a segment, query,
      form field or header. (AC-PORT-1, AC-RANK-1)
- [ ] 5.7 `src/lib/composition.ts` — add `ranking` and `profiles` as **getters**
      (R5) to `Deps`, `ServerDeps` and the `Pick`. Document that the swap is one
      line per port.
- [ ] 5.8 RED: swapping in a second `LatentSource` changes the ranking and edits
      no file under `src/app/**` or `src/components/**`. (AC-PORT-4)
- [ ] 5.9 `pnpm run build` with `DATABASE_URL` unset still prerenders.
      (AC-PORT-9)

## Phase U6 — `/rank`, screen 1c (~340)

- [ ] 6.1 Replace `src/app/rank/page.tsx` wholesale: Server Component, viewer
      from `src/app/viewer.ts`, lens from `dipia_lens`, one
      `viewRank(viewerId, lens, serverDeps())` call. No dynamic segment, no
      `searchParams` subject. (AC-RANK-1)
- [ ] 6.2 `src/components/rank/band-pill.tsx` — exactly two labels,
      `BANDA ALTA`/`BANDA MEDIA`, from `--band-high*`/`--band-mid*`. Never
      `--tag-ritual`. (AC-RANK-3)
- [ ] 6.3 `src/components/rank/rank-card.tsx` (server) — position, name, photo
      or a named placeholder, one bond line, optional friction line; card does
      not collapse when `friction` is null. Reachable by
      `getByRole("link", {name})`. (AC-RANK-2)
- [ ] 6.4 `src/components/rank/rank-board.tsx` — the **only** client island
      here. Holds `{sort, band}` and calls the pure `applyRankView`; consumes
      `useDragScroll({ initial: "start" })`. Filters `Todos`/`Alta`/`Media`
      report no removed count and leave no placeholder. (AC-RANK-4)
- [ ] 6.5 Designed empty states: filter-with-no-matches, and the whole room
      below the floor — named, never a blank row, never naming or counting the
      absent. (AC-RANK-4, AC-RANK-6, AC-PORT-5)
- [ ] 6.6 Degraded states from `RankedRoom.status`: `not-consented` and
      `below-floor` name the step to go back to (from `floorReason`) and no
      other person's name appears; no lens cookie ⇒ link to `/room` and **no
      port call**. (AC-RANK-5)
- [ ] 6.7 Thread `lens-{romantic,business,friendship}` onto the subtree. No raw
      hex, no invented utility — grep `globals.css` first; Biome does not check
      this any more. (AC-RANK-7)
- [ ] 6.8 E2E `e2e/rank.spec.ts` at 390×844 and 1280×900 — AC id at the front of
      each test name. Order/positions, both band pills with differing computed
      backgrounds, `?subject=` is inert, suppressed person absent, off-screen
      entry found by role+name then `scrollIntoViewIfNeeded()`, no `%` or bare
      decimal in page text, 0 running animations under reduced motion.
      (AC-RANK-1..8, AC-PORT-3, AC-PORT-5)

## Phase U7 — `/profile/[id]`, screen 1d (~270)

- [ ] 7.1 `src/app/profile/[id]/page.tsx` — Server Component; `personId` from
      the segment, `viewerId` from the resolver, `notFound()` on `null`.
      (AC-PROF-1, AC-PROF-2)
- [ ] 7.2 `src/components/profile/{profile-card,avatar-stage,tag-chips}.tsx` —
      all Server Components. Shared tags only, with an explicit "nothing in
      common yet" state; photoless avatar gets a named placeholder. (AC-PROF-3)
- [ ] 7.3 Avatar bob as an **inline `style` containing `animation`** (or a class
      already listed in the reduced-motion block). No new bespoke animation
      class; `globals.css` stays unchanged. (AC-PROF-6)
- [ ] 7.4 Simulate CTA — `getByRole("link", {name})` to `/simulate/{personId}`,
      no query string, no viewer id in the URL; lens travels by cookie.
      (AC-PROF-5)
- [ ] 7.5 E2E `e2e/profile.spec.ts` — 404 bodies byte-identical across unknown
      id / below-floor / gate-failed / non-consenting; lens changes who is
      reachable; **consent-invariant DOM** across two people differing only in
      `consent.romantic`, and no accessible name matching
      `/beb[eé]|hijo|offspring/i`; motion runs, then stops under reduced motion.
      (AC-PROF-2..6, AC-PORT-8)

## Phase U8 — Timeline fixture + use case (~230)

- [ ] 8.1 RED+GREEN: `src/lib/adapters/reveal/fixture-timeline.ts` — returns
      `null` for unknown id, unranked person, and `otherId === subjectId`;
      resolves eligibility through the same ranking adapter, never a literal.
      (AC-SIM-1, AC-SIM-2)
- [ ] 8.2 Fixture content must include **one event of each of the 16
      `EventKind` members** in at least one pair, so AC-SIM-5 has a subject.
      Romantic/business get a data-driven `horizonYears`; friendship returns the
      branch with none. Never hardcode 12.
- [ ] 8.3 RED+GREEN: `src/lib/use-cases/simulate-life.ts` — port in, read model
      out; tests use an in-memory fake port.
- [ ] 8.4 `src/lib/composition.ts` — add `timelines` as a getter (R5).
- [ ] 8.5 RED: `offspringVisible` is consulted nowhere in the render path and
      `SimulatedLife` carries no offspring field in this change. (AC-PORT-8)

## Phase U9 — `/simulate/[id]`, screen 1f (~300)

- [ ] 9.1 `src/app/simulate/[id]/page.tsx` — Server Component, `notFound()` on
      `null`. (AC-SIM-1, AC-SIM-2)
- [ ] 9.2 `src/components/timeline/event-card.tsx` — year, narrated text,
      **exactly one** chip via `tagFor(kind)`; never two, never untagged.
      Per-item `pop-in` delay stays an inline style. (AC-SIM-5)
- [ ] 9.3 `src/components/timeline/timeline-rail.tsx` — the **only** client
      island here; consumes `useDragScroll({ initial: "center" })`; events
      ascending by year. (AC-SIM-5)
- [ ] 9.4 Year header pill `Año {N} de {horizonYears}` from data. **No literal
      horizon anywhere in the component tree** — a test greps the sources.
      Friendship renders no pill and no dissolution card. (AC-SIM-3, AC-SIM-4)
- [ ] 9.5 `src/components/timeline/timeline-path.tsx` — props are exactly
      `{ events, progress }`; a third prop must fail `tsc`. No sibling reads
      layout geometry, so 1e can replace this one file. Plus `walking-pair.tsx`
      using the existing `@utility walking`. (AC-SIM-7)
- [ ] 9.6 `src/components/timeline/ending-card.tsx` — narrates `Ending`:
      `apart` names the year and renders `epilogue` after it in document order;
      `together` says they reached the horizon. No probability, percentage or
      survival fraction. (AC-SIM-6)
- [ ] 9.7 `Proponer encuentro` CTA — role + accessible name, keyboard focusable,
      **inert**: no Server Action, no write. (AC-SIM-8)
- [ ] 9.8 E2E `e2e/simulate.spec.ts` — 16 kinds each render exactly one chip;
      `ritual` chip resolves from `--tag-ritual*` while the `high` pill resolves
      from `--band-high*`; self-simulation 404s; consent-invariant DOM and no
      `/beb[eé]|hijo|offspring/i` name; 0 running animations under reduced
      motion. (AC-SIM-3..9, AC-PORT-8)

## Phase 10 — Cross-cutting verification (folded into each unit's PR)

- [ ] 10.1 Hexagon grep per unit: no file under `src/app/**` or
      `src/components/**` imports `getDb`, `@/lib/adapters/db/**` or
      `drizzle-orm`. `@/lib/adapters/http/session` is the one allowed adapter
      import (R7; precedent `src/app/intake/page.tsx:4`).
- [ ] 10.2 `excludedFromRoom()` is unreachable from `src/app/**` and
      `src/components/**`. (AC-PORT-5)
- [ ] 10.3 **Do not create** `to-person.ts`, `prepare-results.ts`,
      `score-participant.ts`, `estimate.ts` or `latent-repository.ts`; do not
      edit or un-skip `prepare-results.test.ts`, `to-person.test.ts`,
      `score-participant.test.ts` or `scoring.test.ts`. Assert their skipped
      count and file contents are unchanged after every unit. (AC-PORT-6)
- [ ] 10.4 `pnpm run verify` and `pnpm run build` (no `DATABASE_URL`) green
      before each PR opens. **pnpm only** — a mixed `npm`/`pnpm` `node_modules`
      breaks Playwright.
- [ ] 10.5 `src/app/globals.css` stays **unchanged**: `--band-*`, `@utility
      walking`/`pop-in` and the `[style*="animation"]` reduced-motion guard all
      landed in `d6e0d4d`. Verify before writing a utility; nothing machine-
      checks token names since ESLint was removed.
- [ ] 10.6 Never edit `src/components/ui/**` — shadcn-owned and lint-exempt.
