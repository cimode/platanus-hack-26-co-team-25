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

## Batch 2 — Work unit U2 (Timeline contracts)

**Status:** complete. 8/8 U2 tasks. Nothing user-visible ships; the unit
compiles, publishes the contract and renders nothing. Parallel-safe with U1 as
forecast — U2 branched from `feat/1a-venue-background`, NOT from U1's branch,
and was written and verified with none of U1's files on disk.

### Completed

- [x] 2.1 `src/lib/domain/reveal/event-tag.test.ts` — 16 kinds, 7 tokens
- [x] 2.2 Drift trap — reads root `timeline/shared.ts` bytes with `node:fs`
- [x] 2.3 `src/lib/domain/reveal/event-tag.ts` — `TagToken`, `TimelineTag`,
      `tagFor` as an exhaustive `Record`, no `default` branch
- [x] 2.4 `src/lib/domain/reveal/offspring.test.ts` — the mutual gate
- [x] 2.5 `src/lib/domain/reveal/offspring.ts` — pure predicate, no affordance
- [x] 2.6 `src/lib/domain/reveal/timeline.ts` — `EventKind` (copied),
      `LifeEvent`, `Ending`, and `SimulatedLife` as a lens-discriminated union
- [x] 2.7 `src/lib/domain/reveal/timeline.test.ts` — the AC-SIM-4 probes
- [x] 2.8 `src/lib/ports/timeline.ts` — `TimelinePort.simulate({...})`

### TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|---|---|---|---|---|---|---|---|
| 2.1 / 2.3 | `domain/reveal/event-tag.test.ts` | Unit + tsc | N/A (new) | `Cannot find module './event-tag'`; then TS2307 ×2 + TS2322 on the `CoversEveryKind` guard; then **4 assertion failures** against a Fake-It constant `tagFor` | 8/8 | 6 cases: totality, the pinned R3 map, the `exit`≠`conflict` cell, all 7 tokens used, 16 distinct labels, drift | Fake It generalised into the exhaustive `Record` |
| 2.2 | same file | Unit (`node:fs`) | N/A (new) | Injecting a 17th member into the test's `EVENT_KINDS` turned the set-equality test red — trap proven live, then reverted | 2/2 | Vacuity guard (extraction found >0 members) + set equality | — |
| 2.4 / 2.5 | `domain/reveal/offspring.test.ts` | Unit | N/A (new) | Module-not-found; then **4 assertion failures** against a Fake-It `return true` | 6/6 | 6 cases: positive, viewer opted out, other opted out (swapped), neither, both non-romantic lenses, 12-combination symmetry | — |
| 2.6 / 2.7 | `domain/reveal/timeline.test.ts` | tsc + Unit | N/A (new) | **TS2305 ×5 + TS2578 ×6** — while `vitest run` reported **10/10 PASSING** on the same file at the same moment | 10/10, tsc clean | 4 probes + 4 runtime narrowing cases | — |
| 2.8 | `ports/timeline.test.ts` | tsc + Unit | N/A (new) | TS2307 + TS2578 ×3 | 6/6, tsc clean | `null` triangulated over 4 causes (unknown id, wrong lens, wrong viewer, self) | `SimulateInput` derived via `Parameters<...>` so the fixtures cannot drift from the port |

**RED for a type is `tsc`, not vitest** — U1's finding reproduced exactly, and
worth restating because it is the single most dangerous trap in this change:
`timeline.test.ts` reported **10 passed** under `vitest run` while
`timeline.ts` exported none of `Ending`, `LifeEvent`, `PairedTimeline`,
`FriendshipTimeline` or `SimulatedLife`. `import type` is erased by the vitest
transform and `@ts-expect-error` is meaningless to it. Every type contract in
U3–U9 must gate RED on `pnpm run typecheck`.

### Probe liveness — every guard mutated and observed to fire

A probe that never errors is decoration. Each was proven by breaking the thing
it guards and watching `pnpm run typecheck` fail, then reverting.

| Mutation applied | Guard it should trip | Observed |
|---|---|---|
| 17th member added to `EventKind` | AC-PORT-7 "a new kind breaks the build" | `TS2741` at `event-tag.ts:47` — **inside `tagFor`'s `Record`**, exactly as the AC words it — plus 2 more in the test |
| Extra member in the test's `EVENT_KINDS` | 2.2 drift trap | Set-equality test red |
| `FriendshipTimeline` given `horizonYears?` and `ending?` | AC-SIM-4 | `TS2578` ×4 — this is precisely the `number \| null` shape R4 rejected, and it fails loudly |
| `subjectId` made optional on `TimelinePort` | AC-PORT-2 | `TS2578` ×1 |
| `{ outcome: "together" }` given `year?`/`epilogue?` | AC-SIM-6 | `TS2578` ×2 |
| `offspringVisible` dropped `other.consent.romantic` | AC-PORT-8 mutual gate | 2 tests red (swapped-order and symmetry) |

### Cross-cutting verification for this unit

| Check | Result |
|---|---|
| 10.1 hexagon grep | No `getDb`, `@/lib/adapters/db/**` or `drizzle-orm` under `src/app/**` or `src/components/**`. The only adapter imports are `@/lib/adapters/http/session` at `intake/page.tsx:4` **and `intake/actions.ts:9`** (R7, allowed — and confirming U1's issue 1: the allowlist is two files, not one). U2 touched neither tree. |
| 10.2 `excludedFromRoom()` | Referenced only from `domain/matching/{engine,demo,engine.test}.ts`. Unreachable from `src/app/**` and `src/components/**`. |
| 10.3 issues #7 / #10 | `to-person.ts`, `prepare-results.ts`, `score-participant.ts`, `latent-repository.ts` all absent. Their four test files byte-identical to the base branch. Skipped count 35, unchanged from the 35 measured before U2 started. `domain/scoring/estimate.ts` untouched (last touched by `b838b94`, the other team's). |
| 10.4 gate | `pnpm run verify` green — **123 passed / 35 skipped**, against a pre-U2 baseline of 94 passed / 35 skipped. `pnpm run build` green with `DATABASE_URL` explicitly unset; 8/8 static pages prerendered. |
| 10.5 `globals.css` | Unchanged. The 7 `--tag-*` pairs were read, not written: `hito`, `mudanza`, `mascota`, `roce`, `ritual`, `viaje`, `peque` — `TAG_TOKENS` matches them exactly. |
| 10.6 `src/components/ui/**` | Unchanged. |

### PR boundary

- Mode: stacked PR slice, `auto-chain` / `stacked-to-main`.
- Branch: `feat/ui-flow-u2-timeline-contracts`.
- Base: `feat/1a-venue-background` (open PR #18), same reason as U1 — that
  commit introduces `openspec/changes/ui-flow-screens/`. **Deliberately NOT
  based on U1's branch**: the two units are disjoint and basing U2 on U1 would
  serialise two independent reviews. Retarget to `main` once #18 merges.
- Rollback: `git revert`. Nothing imports these modules yet — not U1, not
  `composition.ts`, not a screen — so the revert cannot break anything.
- Five work-unit commits, each independently revertable and each under the
  400-line budget, so this PR can be split at a commit boundary without rework.

### Deviations from design

- **`TimelinePort.simulate` takes `subjectId: string`, not `ViewerId`.** That
  alias ships in `domain/reveal/rank.ts` with U1, a sibling branch that is not
  in this tree; importing it would leave U2 unable to typecheck standalone, and
  re-declaring it is the duplication U1's own notes warn against. `ViewerId` IS
  `string`, so the two are structurally identical and tightening it is a
  one-line follow-up for whoever lands U8. This is the only place U2 wanted a
  U1 symbol.
- **`Ending` has two variants, not design's three.** Design's
  `{ outcome: "open" }` existed to give friendship somewhere to land in a FLAT
  record. Under R4's lens-discriminated union the friendship branch has no
  `ending` field at all (task 2.6 says so explicitly), which makes `"open"`
  unreachable by construction — while still forcing `ending-card.tsx` in U9 to
  handle a case that can never occur. Dropped.
- **`SimulatedLife` branches are named `PairedTimeline` / `FriendshipTimeline`
  and share a non-exported `SimulatedLifeBase`.** Neither source document named
  the branches; U9 needs to name the friendship one to write the AC-SIM-4
  probe, so both are exported.
- **`TAG_TOKENS` is exported as a `readonly` array** and `TagToken` is derived
  from it. Design named only `{ token; label }`. The array is what lets a test
  assert "one of the seven" rather than restating seven literals, and it is the
  basis of the `--tag-{token}` variable name.
- **`offspringVisible` takes a structural `ConsentHolder`, not `Participant`.**
  The predicate reads one field; taking the aggregate would drag the whole
  participant module into a gate that does not need it.
- `subject` carries `{ id, name }` while `other` carries `photoUrl` as well —
  design's shape, kept verbatim, so the fixture fabricates nothing extra.

### Issues found

1. **AC-SIM-5's label scenario contradicts design D4, and nobody reconciled
   it.** The spec's scenario reads "every chip's label is one of the seven tag
   names"; design D4 (which R3 adopted) says the chip carries a **per-kind**
   Spanish label precisely so that colour is the family and the label is the
   identity. Both cannot hold: there are 16 labels. U2 implemented design's
   (16 distinct labels, 7 tokens) per task 2.3's explicit wording. **U9's e2e
   in task 9.8 must assert the chip's TOKEN is one of seven, not its label**,
   or it will fail against a correct implementation.
2. **The prompt that launched U2 stated `roce` takes "`conflict` and
   `dissolution` only".** Both authoritative records — `tasks.md` R3 and Engram
   `#1582` — settle R3 as DESIGN, whose `roce` is `conflict`, `decision`,
   `dissolution`. Task 2.3 says "using R3's mapping" verbatim. U2 implemented
   R3 (`decision` → `roce`). The prompt's load-bearing clause, `exit` →
   `mudanza` and never `roce`, is honoured and is pinned by its own named test.
   Moving `decision` is a one-line change plus one line in the test's
   `EXPECTED_TOKEN` if the reviewer wants the spec's `hito` instead.
3. **U2 came in at ~782 source lines against a ~290 forecast** — the same
   ~2.5× comment-density overrun U1 hit (732 vs 300). The forecast's per-unit
   estimates are calibrated to code, not to this codebase's commenting
   convention. U3–U9's estimates should be read as roughly 2.5× low.
4. **`domain/reveal/index.ts` (U1's barrel) does not export U2's modules.**
   The barrel is U1's file and is not in this tree, so U2 could not extend it
   without pulling U1 in. Whoever merges the second of the two units should add
   `event-tag`, `offspring` and `timeline` to it — one line each, no logic.
5. `main` has moved to `8c76d87` and now carries changes to
   `src/lib/domain/room/layout.ts`. `Lens`, `LENSES` and `isLens` are byte-
   identical there, so U2's imports are safe across the eventual retarget;
   verified rather than assumed.

### Remaining

U3–U9, plus every Phase 10 check re-run per unit.
