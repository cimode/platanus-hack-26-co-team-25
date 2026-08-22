# Proposal: UI Flow Screens (1c–1f)

## Intent

1a (`/`) and 1b (`/room`) ship. `/rank` is a stub that reads a cookie and
reaches no port — the one screen violating the project's own rule. Build the
four remaining screens demo-ready against fixtures **behind ports**, so when the
other team's engine lands we swap one adapter per port and nothing above moves.

**This change is UI-only.**

## Scope

### In Scope

- `/rank` (1c), `/profile/[id]` (1d), `/simulate/[id]` (1e/1f), per `Dipia Flow.dc.html`.
- Three read ports + domain types + fixture adapters, wired in `composition.ts`.
- `EventKind`→tag mapper; `--band-*` tokens; `walk`/`popin` `@utility` + reduced-motion entries.

### Out of Scope

- Scoring, matching, intake, DB persistence — issues #5–#10, #13, other team.
- Offspring reveal and image generation; live location sharing.
- The 1e isometric board (see Approach).

## Capabilities

### New Capabilities

- `ui-read-ports`: the three port contracts, domain types, fixture adapters, composition wiring.
- `rank-screen`: 1c — sort control, band filters, horizontal rank row.
- `profile-screen`: 1d — bio card, tags, simulate CTA, `bob` stage.
- `simulated-life-screen`: 1e/1f — event cards, walking pair, ending card.

### Modified Capabilities

- None. `openspec/specs/` is empty.

## Approach

```ts
RankingPort.forSubject(subjectId, lens): Promise<RankedRoom>
ProfilePort.byId(personId, viewerId, lens): Promise<PersonProfile | null>
TimelinePort.simulate({ subjectId, otherId, lens }): Promise<SimulatedLife>
```

`RankEntry = { id, name, position, band: "high" | "mid", bond, friction | null }`.

- **No `rank`/`sim` floats cross a port.** What the type cannot carry, no
  component can leak (AUDIT S10). Band `low` is excluded — the design has no
  third pill, so the type must not admit one.
- **Every signature names the viewer, and there is no `forRoom()`.** A rank is
  unaddressable without saying whose it is; pages take it from the impersonation
  cookie, never the URL. That makes CONTEXT.md §3 "rankings visible only to the
  person who ran them" a compile-time property, not a convention.
- Suppressed people stay **absent**, never greyed out — a greyed row discloses
  the opt-out. `excludedFromRoom()` must not be reachable from `src/app/**`.
- **No offspring affordance renders at all**, not even disabled: mutual romantic
  consent is unobservable against fixtures, and a locked slot still discloses
  that the other person exists in that state. The ending stops at
  "Proponer encuentro", which is copy only — it performs no mutation.

**Fixtures** live in `src/lib/adapters/{ranking,profile,timeline}/fixture.ts`,
keyed on existing roster ids. The ranking fixture drives the already-built pure
`rankRoom()` over a fixture `Person[]` — real bands, real drivers, no DB. The
timeline fixture returns pre-generated `SimulatedLife`. `timeline/index.ts`
output does map cleanly (`events[].kind`→tag, `horizonYears`→"Año N de N"), but
it lives outside `src/` with its own lockfile and narrates in ~33s live, so it
is not wired for the demo. Swapping it in later is one line.

**1f over 1e.** Cards, tags, `popin`, the walking pair and the ending are
identical in both variants; only the path differs. 1e's ~34-tile sine board is
the most expensive component in the whole scope and carries no information the
dashed line does not. Shipping both is not cheaper — it doubles the surface to
debug at hour 20. Mitigation: the path is a swappable `<TimelinePath>` behind
`{ events, progress }`, so 1e can land later touching nothing else.

**Real names**, per the earlier override. The doc comment in
`src/lib/domain/participants/participant.ts` reserving animal aliases for the
ranking is now **stale and must be corrected**, or the next reader re-litigates
this. Its pre-match-privacy rationale is answered by viewer-scoping above.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/ports/{ranking,profile,timeline}.ts` | New | The three contracts the engine team builds to |
| `src/lib/domain/{ranking,profile,timeline}/` | New | Returned types + `tagFor(kind)` mapper |
| `src/lib/adapters/{ranking,profile,timeline}/fixture.ts` | New | Mocks; the only files the swap touches |
| `src/lib/composition.ts` | Modified | Three non-lazy members (no DB, no `DATABASE_URL`) |
| `src/app/rank/page.tsx` | Modified | Stub replaced wholesale |
| `src/app/profile/[id]/`, `src/app/simulate/[id]/` | New | 1d, 1e/1f |
| `src/components/{rank,profile,timeline}/` | New | Presentation only, no I/O |
| `src/app/globals.css` | Modified | `--band-*` tokens; `walk`/`popin` utilities |
| `src/lib/domain/participants/participant.ts` | Modified | Correct the stale alias comment |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `walk` + `popin` have keyframes but no `@utility` and are missing from the `prefers-reduced-motion` block — animations silently do nothing, or ignore the setting | High | Verified today; add both in the first slice |
| BANDA MEDIA `#f6ecd2`/`#8a6a1f` has no token; BANDA ALTA's pair collides with `--tag-ritual` | High | Add `--band-{high,mid}{,-foreground}`; never reuse an event tag for a band |
| Tokens are not machine-checked since ESLint was removed — a typo renders unstyled and silent | Med | Grep `globals.css` before typing any utility |
| Off-screen cards in a horizontal scroller stay in the a11y tree but fail `toBeVisible()` | Med | Assert role + name; scroll into view before visibility |
| Engine team's real shapes diverge from these ports | Med | Publish the port file early; divergence costs an adapter, not a screen |
| Four screens far exceed the 400-line review budget | High | `delivery_strategy: auto-chain` — one slice per screen, ports first |

## Rollback Plan

Every screen is additive; `rank/page.tsx` is the only existing file replaced and
its stub is in git history. Rollback is `git revert` of the slice plus deleting
the port's line in `composition.ts`. No schema, no migration, no data, no
dependency on the other team's branches — so a revert cannot break `/` or
`/room`, and `next build` still prerenders without `DATABASE_URL`.

## Dependencies

- None blocking. Reads only `Dipia Flow.dc.html` (DesignSync) and existing
  `src/lib/domain/matching/engine.ts`.
- `timeline/` is referenced for shape only; it is not imported.

## Success Criteria

- [ ] No file under `src/app/**` or `src/components/**` imports `getDb`, an adapter, or `drizzle-orm`.
- [ ] Each of 1c/1d/1f renders from a port method; replacing a fixture adapter changes no file above `composition.ts`.
- [ ] No numeric compatibility score appears anywhere in the DOM.
- [ ] A rank cannot be addressed for anyone but the impersonated viewer.
- [ ] `pnpm run verify` and `pnpm run build` pass; the three lenses stay visually distinct.
- [ ] All motion stops under `prefers-reduced-motion`, including `walk` and `popin`.

## Proposal question round

`execution_mode: auto` — these were decided rather than asked. Flag for review:

1. **Band `low` is dropped from the rank.** Eligible-but-low pairs never appear. Design has no pill for them; the alternative is showing them under "Todos" with an undesigned style.
2. **The meet CTA is inert.** It renders and is focusable but performs no mutation — the request/accept loop is out of scope.
3. **Real names on `/rank` weaken the original pre-match-privacy argument.** The compensating control is viewer-scoping. If a stranger seeing a real name pre-match is still unacceptable, aliases must come back and the port grows a display-name field.
4. **1e is not built.** If the isometric board is the demo's visual hook, that reverses the recommendation and costs roughly a screen's worth of time.
