# Design: UI Flow Screens (1c–1f)

Twin: Engram `sdd/ui-flow-screens/design`. Reads `proposal.md`.

## Technical Approach

Three read ports (`RankingPort`, `ProfilePort`, `TimelinePort`) sit **above** the
other team's surface, not beside it. Participants, photos and consent are real
today (`ParticipantRepository`, `PhotoStore`, `/intake`); only the *scores* are
missing (#7, #10 still draft). So the fixture adapters mock exactly one thing —
latents — and drive the already-built pure `rankRoom()` for everything else.

Dependency direction is unchanged:

```
src/app/**  ──►  use-cases/{view-rank,view-profile,simulate-life}
                      │
                      ▼
                 ports/{ranking,profile,timeline}  ◄── adapters/reveal/fixture-*
                      ▲                                        (later: adapters/db/*)
                 composition.ts wires them  ── the ONLY module that knows which
```

### Ground that moved since the proposal (verified today)

| Proposal claim | Reality at `11df002` | Consequence |
|---|---|---|
| `--band-*` tokens missing | **Present** — `globals.css:48-51,174-177`, with a comment on the `--tag-ritual` collision | CSS slice is **empty**; delete that risk |
| `walk`/`popin` lack `@utility` + reduced-motion | **Present** — `@utility walking` / `pop-in` (471-476), both listed at 495-501 | ditto |
| Fixture seam is wide | `/intake` ships; `byRoomForRanking(roomId, lens)` + `meetsFloor` exist | Ports mock **scores only** |
| `prepareResults` not considered | `use-cases/prepare-results.test.ts` specifies it (#10): `(sessionToken, lens, deps)` → status + `RankedResult[]` | `RankingPort` must be **projectable from it**, and it resolves the viewer by **session token**, not id |

## Architecture Decisions

### D1 — Domain folder is `reveal/`, not `ranking/`

| Option | Trade | Decision |
|---|---|---|
| `domain/ranking/` (proposal) | `RankEntry` next to `matching/RankedEntry`; `ranking` next to `matching` | ✗ |
| `domain/reveal/` | The engine's own word (AUDIT S15 "excluded from the reveal entirely") | **✓** |

`participant/` vs `participants/` already costs a grep. `RankEntry` vs
`RankedEntry` is one letter and both compile. `reveal/` is the read model the
three screens share; `matching/` is the engine. One file per screen, one barrel.

### D2 — Ports return a **status union**, not a bare list

`prepareResults` reports `"ranked" | "not-consented" | "below-floor"`. If
`RankedRoom` were a flat array the real adapter would have nowhere to put that
and the swap would edit the screen. It is in the type from day one; the fixture
returns `"ranked"` always. **Absent ≠ empty**: suppressed people are simply not
in `entries`, and `excludedFromRoom()` never leaves an adapter.

### D3 — No float crosses a port

`RankedEntry.rank` / `.sim` stop in the adapter. `position` (1-based) and `band`
are what the type can carry, so no serialiser, no `dangerouslySet`, no dev-tools
inspection can leak a compatibility number (AUDIT S10). `friction`/`bond` cross
as `{ term, label }` — never `contribution` or `shortfall`.

### D4 — `EventKind` (16) → tag (7): **collapse, don't add tokens**

| Option | Trade | Decision |
|---|---|---|
| 9 new `--tag-*` pairs | 18 unlinted CSS vars, 9 new hues in a palette that already collided once (`--band-high` == `--tag-ritual`), and `Dipia Flow` draws 7 chips | ✗ |
| Collapse onto 7 | Two kinds share a hue | **✓** — the chip carries a **per-kind Spanish label**, so colour is the *family* and the label is the *identity* |

`eventTag(kind): { token; label }` in `domain/reveal/event-tag.ts` — an
exhaustive `Record<EventKind, …>`, **no `default` branch**. A 17th kind then
fails `tsc` instead of rendering an unstyled chip that nothing would catch.

| token | kinds | why |
|---|---|---|
| `hito` | `milestone` `job` `venture` `client` | progress markers of the outer life |
| `mudanza` | `move` `exit` | something changed hands or address — a **good exit is not a fight**, so it must not be amber |
| `mascota` | `pet` | — |
| `peque` | `kid` | — |
| `ritual` | `ritual` `recovery` `epilogue` | coral = the warm beats; repair is a ritual |
| `viaje` | `trip` `vignette` | a friendship vignette is an outing |
| `roce` | `conflict` `decision` `dissolution` | amber is already the friction family; decision-rights is the `bothHighAgency` arc |

`EventKind` is **re-declared** in `domain/reveal/timeline.ts`, copied from
`timeline/shared.ts:78-82`. That directory has its own lockfile and is never
imported. The comment names the source line; the exhaustive Record is the guard.

### D5 — Extract `useDragScroll`, migrate `RoomCanvas` in the same slice

The rank row and the timeline rail both need it, so duplicating gives **three**
copies of a pointer-capture drag — one gets the bugfix, two do not. Cost is
honest: a shipped, e2e-covered screen enters a new-screen diff. Paid once, in
slice 2, with `/room` e2e green before the PR opens.

`src/components/shared/use-drag-scroll.ts` (`"use client"`) returns
`{ ref, handlers }` and takes `initial: "start" | "center"` — the only thing
that actually differs. Native `overflow-x` is kept; handlers only nudge
`scrollLeft`, so touch momentum, trackpad, scrollbar and arrow keys stay free.

### D6 — Composition members are **getters from day one**

`serverDeps().db` is lazy because `getDb()` throws with no `DATABASE_URL` and
there is no `.env`. If the three new members were plain properties, the swap
would be `ranking: createDbRanking(getDb())` — evaluated eagerly, breaking
prerender on `/` and `/room` too. A getter costs nothing today and makes the
swap literally **one line per port**, three lines total.

### D7 — Ports earn their place (`rules.design`)

Wrapping a pure function does not justify a port — but the *real* implementation
is `prepareResults` over Postgres plus #7's latent estimates, and the timeline's
is an LLM narrator. Fixture + DB/LLM = two implementations at a real external
boundary. The fixture's use of pure `rankRoom()` is an implementation detail of
one adapter, not the port's reason to exist.

## Interfaces / Contracts

`Lens` is imported from `domain/room/layout` — the copy that also exports
`isLens`. (Three identical `Lens` unions exist: `room/layout`,
`matching/engine`, `participant/gates`. Do not add a fourth.)

```ts
// src/lib/domain/reveal/rank.ts
import type { Lens } from "../room/layout";

/** Whose reveal this is. Opaque: the cookie today, a session token later. */
export type ViewerId = string;

/** No `low`. The design has two pills, so the type must not admit a third. */
export type RankBand = "high" | "mid";

/** A named engine term. Never its weight, score, contribution or shortfall. */
export interface RankReason {
  /** Engine `TermName`. Stable, never rendered. */
  readonly term: string;
  /** Spanish, user-facing. */
  readonly label: string;
}

export interface RankEntry {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  /** 1-based place in THIS viewer's rank. Discloses no score. */
  readonly position: number;
  readonly band: RankBand;
  readonly bond: RankReason;
  readonly friction: RankReason | null;
}

/**
 * Suppressed people are ABSENT from `entries`, never present-and-greyed:
 * a greyed row discloses the opt-out.
 */
export type RankedRoom =
  | {
      readonly status: "ranked";
      readonly lens: Lens;
      readonly viewer: { readonly id: ViewerId; readonly name: string };
      readonly entries: readonly RankEntry[];
    }
  | { readonly status: "not-consented"; readonly lens: Lens }
  | { readonly status: "below-floor"; readonly lens: Lens };

/** Pure, tested, no React: the client island only holds the two choices. */
export type RankSort = "position" | "name";
export function applyRankView(
  entries: readonly RankEntry[],
  view: { sort: RankSort; band: RankBand | "all" }
): readonly RankEntry[];
```

```ts
// src/lib/ports/ranking.ts
import type { Lens } from "../domain/room/layout";
import type { RankedRoom, ViewerId } from "../domain/reveal/rank";

/**
 * Every signature names the viewer and there is NO `forRoom()`: a rank is
 * unaddressable without saying whose it is, which makes CONTEXT.md §3 a
 * compile-time property. Pages take the viewer from the impersonation cookie,
 * never from the URL.
 */
export interface RankingPort {
  forSubject(subjectId: ViewerId, lens: Lens): Promise<RankedRoom>;
}
```

```ts
// src/lib/domain/reveal/profile.ts
import type { RankBand, RankReason } from "./rank";

export interface PersonProfile {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly team: string | null;
  /** Closed-vocabulary slugs from `domain/participant/tags.ts` (30 of them). */
  readonly tags: readonly string[];
  /** How this person sits in THIS viewer's rank under THIS lens. */
  readonly standing: {
    readonly position: number;
    readonly band: RankBand;
    readonly bond: RankReason;
    readonly friction: RankReason | null;
  };
}
```

```ts
// src/lib/ports/profile.ts
import type { Lens } from "../domain/room/layout";
import type { PersonProfile } from "../domain/reveal/profile";
import type { ViewerId } from "../domain/reveal/rank";

/**
 * `null` covers "no such person", "suppressed" and "gate-failed" with ONE
 * value, so the screen cannot tell them apart and therefore cannot disclose
 * which one it was. There is no `byId(personId)` without a viewer.
 */
export interface ProfilePort {
  byId(
    personId: string,
    viewerId: ViewerId,
    lens: Lens
  ): Promise<PersonProfile | null>;
}
```

```ts
// src/lib/domain/reveal/timeline.ts
import type { Lens } from "../room/layout";

/** Copied from `timeline/shared.ts:78-82`. That module is NEVER imported. */
export type EventKind =
  | "milestone" | "move" | "job" | "pet" | "kid" | "ritual" | "trip"
  | "conflict" | "recovery"
  | "venture" | "client" | "decision" | "exit"
  | "dissolution" | "epilogue" | "vignette";

export interface LifeEvent {
  /** 1-based simulated year. */
  readonly year: number;
  readonly kind: EventKind;
  /** Narrated, already safety-scanned by the adapter. */
  readonly text: string;
}

/**
 * The three engine timeline types collapsed to one. `"open"` is friendship:
 * PILLARS §6.1 forbids a duration claim, so that variant carries no year and
 * `horizonYears` is null — the header pill then has no denominator to render.
 */
export type Ending =
  | { readonly outcome: "together" }
  | {
      readonly outcome: "apart";
      readonly year: number;
      readonly epilogue: string | null;
    }
  | { readonly outcome: "open" };

export interface SimulatedLife {
  readonly lens: Lens;
  readonly subject: { readonly id: string; readonly name: string };
  readonly other: {
    readonly id: string;
    readonly name: string;
    readonly photoUrl: string | null;
  };
  /** 8–14 romantic, 5–10 business, null friendship. Never hardcode 12. */
  readonly horizonYears: number | null;
  /** Sorted by year ascending. */
  readonly events: readonly LifeEvent[];
  readonly ending: Ending;
}
```

```ts
// src/lib/ports/timeline.ts
import type { Lens } from "../domain/room/layout";
import type { ViewerId } from "../domain/reveal/rank";
import type { SimulatedLife } from "../domain/reveal/timeline";

/**
 * `null` when `otherId` is not in the viewer's rank — same single value, same
 * non-disclosure reason as `ProfilePort.byId`. Async because the real adapter
 * narrates through `LlmPort` (~33s live); the fixture resolves immediately.
 */
export interface TimelinePort {
  simulate(input: {
    subjectId: ViewerId;
    otherId: string;
    lens: Lens;
  }): Promise<SimulatedLife | null>;
}
```

## Fixture wiring and the cost of the swap

```ts
// src/lib/composition.ts — Deps + ServerDeps gain three members
  get ranking() {
    return fixtureRanking;      // → createDbRanking(getDb(), getLlm())
  },
  get profiles() {
    return fixtureProfiles;     // → createDbProfiles(getDb())
  },
  get timelines() {
    return fixtureTimelines;    // → createDbTimelines(getDb(), getLlm())
  },
```

**Swap cost: one line per port, three lines total, plus three imports.** Nothing
under `src/app/**`, `src/components/**`, `src/lib/use-cases/**` or
`src/lib/domain/**` changes, because none of them names an adapter (`biome.json`
makes that an error inside the hexagon and the success criteria grep for it above).

`adapters/reveal/people.ts` derives an engine `Person` per roster id from a
stable FNV hash — the same trick `domain/room/layout.ts` uses so nobody
teleports between renders. **Not 18 hand-written `Person` literals** (~540 lines
and unreviewable); ~90 lines, deterministic, and it feeds the real `rankRoom()`
so bands, drivers and friction are genuine. Guarded by a test asserting, for
every roster id × 3 lenses, at least 5 eligible entries and both bands present.

## File Changes

| File | Action | Notes |
|---|---|---|
| `src/lib/ports/{ranking,profile,timeline}.ts` | Create | The contracts the engine team builds to |
| `src/lib/domain/reveal/{rank,profile,timeline,event-tag,index}.ts` | Create | Read model + `applyRankView` + `eventTag` |
| `src/lib/domain/reveal/{event-tag,rank}.test.ts` | Create | Totality of the 16→7 map; sort/filter |
| `src/lib/adapters/reveal/people.ts` | Create | Hash-derived `Person[]` over the roster |
| `src/lib/adapters/reveal/fixture-{ranking,profile,timeline}.ts` | Create | The **only** files the swap replaces |
| `src/lib/use-cases/view-rank.ts`, `view-profile.ts`, `simulate-life.ts` | Create | Mirror `enter-room.ts`: port in, read model out |
| `src/lib/composition.ts` | Modify | +3 getters, +3 `Deps` fields, +3 in the `Pick` |
| `src/components/shared/use-drag-scroll.ts` | Create | Extracted from `RoomCanvas` |
| `src/components/room/room-canvas.tsx` | Modify | Consume the hook; behaviour unchanged |
| `src/app/rank/page.tsx` | Modify | Stub replaced wholesale |
| `src/app/profile/[id]/page.tsx`, `src/app/simulate/[id]/page.tsx` | Create | Server Components |
| `src/components/rank/{rank-board,rank-card,band-pill}.tsx` | Create | `rank-board` is the only island |
| `src/components/profile/{profile-card,avatar-stage,tag-chips}.tsx` | Create | All server; `avatar-bob` is a class |
| `src/components/timeline/{timeline-rail,event-card,timeline-path,walking-pair,ending-card}.tsx` | Create | `timeline-rail` is the only island |
| `src/lib/domain/participants/participant.ts` | Modify | Correct the stale animal-alias comment |
| `src/app/globals.css` | **Unchanged** | Tokens and utilities already landed in `d6e0d4d` |

Client islands: `rank-board`, `timeline-rail`, `use-drag-scroll`. Everything
else is a Server Component. Per-item animation stays an **inline style**
(delay differs per card), which the `[style*="animation"]` guard already
catches — new animated components need nothing added to `globals.css`.

## Data Flow

```
cookie(dipia_impersonating) ─┐
cookie(dipia_lens) ──────────┴─► rank/page.tsx (Server)
                                     │  viewRank(viewerId, lens, serverDeps())
                                     ▼
                              RankingPort.forSubject ──► fixtureRanking
                                     │                      │ people.ts → rankRoom()
                                     ▼                      ▼ drops rank/sim floats
                              RankedRoom ──► <RankBoard entries> ("use client")
                                                  └─ applyRankView (pure)
```

`/profile/[id]` and `/simulate/[id]` take `id` from the URL as the **other**
person only; the viewer always comes from the cookie. A missing or stale cookie
`redirect("/")`, exactly like `RoomPage`.

## Testing Strategy

STRICT TDD (`strict_tdd: true`, `pnpm run test`) — RED must fail on an
assertion, not `Cannot find module`.

| Layer | What | How |
|---|---|---|
| Domain | `eventTag` totality (all 16), `applyRankView` sort/filter, `Ending` narrowing | Vitest, pure |
| Adapter | Every roster id × 3 lenses ranks ≥5 with both bands; no `rank`/`sim` key on any returned object | Vitest over the fixture |
| Use case | Unknown viewer → null; unknown `otherId` → null | Inline in-memory fake port, no adapter import |
| E2E | 1c/1d/1f by **role + accessible name**; no digit-bearing score in the DOM; reduced-motion stops everything | Playwright, 390×844 + 1280×900 |

Off-screen cards in a horizontal scroller stay in the a11y tree but fail
`toBeVisible()` — assert role + name, `scrollIntoViewIfNeeded()` before visibility.

## Rollout — auto-chain slices

| # | Slice | Est. changed lines | Autonomous? |
|---|---|---|---|
| 1 | Ports + `domain/reveal` + `eventTag` + domain tests | ~380 | Yes — compiles, publishes the contract, renders nothing |
| 2 | `use-drag-scroll` extraction + `RoomCanvas` migration | ~90 | Yes — `/room` e2e is the proof |
| 3 | `people.ts` + ranking/profile fixtures + 2 use cases + composition (×2) | ~400 | Yes — tests only |
| 4 | `/rank` (1c) + `rank/*` + e2e | ~340 | Yes |
| 5 | `/profile/[id]` (1d) + `profile/*` + e2e | ~270 | Yes |
| 6 | Timeline fixture + `simulate-life` + composition (×1) + `/simulate/[id]` (1f) + `timeline/*` + e2e | **~500 — at risk** | Yes |

**400-line budget risk: Medium.** Slice 6 is the one over budget; split it into
6a (fixture + use case + wiring) / 6b (screen + components) if the tasks-phase
forecast confirms. Slices 1–3 ship no user-visible change, so any of them can be
reverted without touching a screen. Rollback per slice is `git revert` plus,
for 3 and 6, deleting the port's line in `composition.ts`.

`chain_strategy` is still `unset` — the orchestrator must ask before slice 1.

## Migration / Rollout

No migration. No schema, no `db:generate`, no data. `next build` still
prerenders without `DATABASE_URL` because every new dependency is a getter over
a pure fixture.

## Open Questions

- [ ] `prepareResults` resolves the viewer by **session token**; our cookie holds
      a roster id. `ViewerId` is deliberately opaque so the DB adapter absorbs
      the difference — confirm with the engine team that this is their seam too.
- [ ] 1e (isometric board) stays unbuilt per the proposal. `<TimelinePath>`
      keeps it a one-component addition. Reverse only if it is the demo's hook.
- [ ] Real names on `/rank` (viewer-scoping is the compensating control).
