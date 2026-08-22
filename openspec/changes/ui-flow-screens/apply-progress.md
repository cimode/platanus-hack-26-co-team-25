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
