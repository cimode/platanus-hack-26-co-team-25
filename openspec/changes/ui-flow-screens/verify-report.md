# Verification Report — UI Flow Screens, work unit U6 (`/rank`, screen 1c)

Twin: Engram `sdd/ui-flow-screens/verify-report`. Scope: **U6 only**. U1, U2, U3,
U7 and U9 are out of scope and are not judged here.

**Change**: `ui-flow-screens` / U6
**Branch**: `feat/ui-flow-u6-rank` @ `611698b` (diff = `git diff main...HEAD`)
**Mode**: **Strict TDD** (`pnpm run test`, vitest; `pnpm exec playwright test` for e2e)
**Artifact store**: hybrid — file twins authoritative
**Normative order**: reconciliation rows R1–R15 in `tasks.md` **override** `specs/`
and `design.md` wherever they disagree. Judged accordingly.

---

## Completeness

| Metric | Value |
|---|---|
| U6 tasks total (6.0–6.9) | 10 |
| U6 tasks marked complete | 10 |
| U6 tasks incomplete | 0 |
| U6 tasks whose `[x]` is **accurate** | 7 |
| U6 tasks whose `[x]` is **overstated** | 3 (6.4, 6.6, 6.7 — code written, never exercised) |
| Phase 10 cross-cutting (10.1–10.8) | unchecked by design; re-verified here, all hold |

## Diff scope (verified, not assumed)

`git diff main...HEAD --name-only` — 10 files, 1153 insertions / 125 deletions:

```
e2e/demo-path.spec.ts                                  (1 assertion, documented)
e2e/rank.spec.ts                                       (new)
openspec/changes/ui-flow-screens/{apply-progress,tasks}.md
src/app/rank/page.tsx                                  (replaced wholesale)
src/components/rank/{band-pill,rank-board,rank-card}.tsx  (new)
src/components/rank/{mock.ts,mock.test.ts}
```

**The claim that `quiz.spec.ts` / `intake-declared.spec.ts` are not U6's doing is
CONFIRMED**: the diff touches nothing under `src/app/intake/**`, `src/app/quiz/**`
or their specs. Their `DATABASE_URL` dependency is pre-existing.

---

## Build & Tests Execution

**Typecheck + lint + unit** — `pnpm run verify` → **exit 0**

```text
next typegen && tsc --noEmit      -> clean
biome check .                     -> Checked 217 files. No fixes applied.
vitest run                        -> Test Files 37 passed | 1 skipped (38)
                                     Tests     178 passed | 21 skipped (199)
```

**E2E** — `pnpm exec playwright test rank.spec.ts` → **exit 0**

```text
26 passed (4.9s)   -- 13 tests x [mobile 390x844] + [desktop 1280x900]
```

**E2E regression** — `pnpm exec playwright test demo-path.spec.ts` → **exit 0**

```text
38 passed, 8 skipped (9.6s)   -- U6 modified one assertion in this file; it holds
```

**Build without a database** — `env -u DATABASE_URL pnpm run build` → **exit 0**

```text
Compiled successfully in 810ms; TypeScript finished in 1811ms
Generating static pages (14/14) in 200ms
12 routes; /rank is (f) Dynamic -- it reads cookies, so this is correct, not a regression
```

**Coverage**: ➖ Not available for the changed files **by configuration**.
`vitest.config.mts` sets `coverage.include: ["src/lib/**"]`; every U6 file lives
under `src/app/**` or `src/components/**`. This is a deliberate project decision
("UI coverage from unit tests would be a vanity metric here"), not a gap.

---

## Spec Compliance Matrix

A scenario is COMPLIANT only where a covering test passed **at runtime in this
verification run**. `+verifier` marks evidence I produced independently, beyond
what the suite asserts.

### rank-screen

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Route takes no subject | AC-RANK-1 · the ranking is the viewer's | `rank.spec.ts:34` (×2) + `mock.test.ts` "never ranks the viewer against themselves" | ✅ COMPLIANT |
| Route takes no subject | AC-RANK-1 · a subject cannot be injected (safety) | `rank.spec.ts:45` (×2) **+verifier raw-document audit** | ✅ COMPLIANT |
| Entries in engine order | AC-RANK-2 · order and content | `rank.spec.ts:57` (×2) — 17 cards, positions 1..17, exactly one bond each | ✅ COMPLIANT |
| Entries in engine order | AC-RANK-2 · friction is optional | `rank.spec.ts:74` (×2) + `mock.test.ts` both-branches property | ✅ COMPLIANT |
| Entries in engine order | AC-RANK-2 · no photo still looks intentional | **(none — precondition unreachable)** | ❌ UNTESTED |
| Only two bands | AC-RANK-3 · both bands render distinctly | `rank.spec.ts:92` (×2) | ✅ COMPLIANT |
| Only two bands | AC-RANK-3 · no low band leaks | `rank.spec.ts:114` text proxy + `@ts-expect-error` @ `domain/reveal/rank.test.ts:38` (tsc clean) | ⚠️ PARTIAL — vacuously true; `RankBand` makes the precondition unrepresentable |
| Filters disclose nothing | AC-RANK-4 · filtering to Alta | `rank.spec.ts:122` (×2), 17→7 **+verifier aria sweep** | ✅ COMPLIANT |
| Filters disclose nothing | AC-RANK-4 · a filter with no matches | **(none — state unreachable)** | ❌ UNTESTED |
| Degrades honestly | AC-RANK-5 · viewer has not consented | **(none — R15)** | ❌ UNTESTED (recorded) |
| Degrades honestly | AC-RANK-5 · viewer has no photo | **(none — R14 + R15)** | ❌ UNTESTED (recorded) |
| Degrades honestly | AC-RANK-5 · no lens chosen | `rank.spec.ts:161` (×2) | ✅ COMPLIANT |
| Empty room is designed | AC-RANK-6 · empty room | **(none — state unreachable)** | ❌ UNTESTED |
| Lens recolours subtree | AC-RANK-7 · the lens threads through | `rank.spec.ts:169` (×2) — 3 distinct `--primary` | ✅ COMPLIANT |
| Row operable + motion-safe | AC-RANK-8 · off-screen entries reachable | `rank.spec.ts:188` (×2) **+verifier keyboard probe** | ✅ COMPLIANT |
| Row operable + motion-safe | AC-RANK-8 · motion stops under reduced motion | `rank.spec.ts:209` (×2) **+verifier liveness probe** | ✅ COMPLIANT (fragile — see W3) |

### ui-read-ports (only the four that bear on U6)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Viewer from cookies only | AC-PORT-1 · impersonation resolves the viewer | `rank.spec.ts:34` seeds only `dipia_impersonating`; header names that person | ✅ COMPLIANT |
| Viewer from cookies only | AC-PORT-1 · a real session outranks impersonation | — | ➖ **VOID by R11** |
| Viewer from cookies only | AC-PORT-1 · no credential reaches no port | **(none)** — `redirect("/")` implemented at `page.tsx:43` | ❌ UNTESTED (minor) |
| No numeric score | AC-PORT-3 · no score in the type | `pnpm run typecheck` clean + live `@ts-expect-error` probe | ✅ COMPLIANT |
| No numeric score | AC-PORT-3 · no score in the DOM | `rank.spec.ts:201` (×2) **+verifier full RSC-payload audit** | ✅ COMPLIANT |
| No numeric score | AC-PORT-3 · `low` is unrepresentable | `pnpm run typecheck` clean | ✅ COMPLIANT |
| Suppressed people absent | AC-PORT-5 · suppression is invisible | **(none — R15)** | ❌ UNTESTED (recorded) |
| Suppressed people absent | AC-PORT-5 · flipping consent is the only difference | **(none — R15)** | ❌ UNTESTED (recorded) |
| Composition adds no DB | AC-PORT-9 · no connection is opened | `env -u DATABASE_URL pnpm run build` → 14/14 pages | ✅ COMPLIANT |
| Composition adds no DB | AC-PORT-9 · the hexagon rule holds | verifier grep over `src/app/**` + `src/components/**` | ✅ COMPLIANT |

**Compliance summary**: **14 / 23 COMPLIANT**, 1 PARTIAL, 1 VOID (R11), **7 UNTESTED**
(4 of which R14/R15 record; **3 of which nothing records**).

---

## Adversarial findings — the seven pressure points

### 1. AC-RANK-1 · is `?subject=` genuinely inert, or does the byte-comparison have a hole?

**The implementation is airtight. The test is weaker than its own comment claims.**

`export default async function RankPage()` declares **no parameters at all**, so
`searchParams` is not merely unread — it is unreachable. No `headers()` call
either. That is a structural guarantee, not a behavioural one.

The e2e compares `page.locator("main").innerText()`, i.e. **visible text**. It
would not catch a divergence in `href`, `aria-label`, or hidden content — and the
card's identity lives in an `aria-label`. `apply-progress.md` says the e2e
"compares the two documents byte for byte"; **it does not.**

I verified the stronger property directly. Three requests, same cookies:

```
/rank                                                    main = 23424 bytes
/rank?subject=p-diego-morales                            main = 23424 bytes
/rank?subject=p-ana-ramirez&viewer=p-ana-ramirez&id=...  main = 23424 bytes
plain === inject : true      plain === inject2 : true    (exact string equality)
entry order      : identical, all 17 ids, all 17 aria-labels identical
```

Whole-document diffs reduce to exactly two Next.js artifacts: the router-state
echo of the query (`"q":"?subject=..."`, which returns only what the requester
sent) and `self.__next_r`, a **per-request nonce that differs between two
identical requests to the same URL** (verified: `4oJ-vge-...` vs `VoK4AYoRu4...`).

**Verdict: no hole in the product. The evidence narrative overstates the test.**

### 2. AC-PORT-3 · can any number that is a score, or invertible into one, reach the RSC payload?

**No.** The e2e greps visible text; I audited the raw 43 KB document including the
flight payload the client island receives.

`<RankBoard>` is the only client component, and its sole prop is
`entries: readonly RankEntry[]`. Serialized key set, exhaustively:

```
17x id   17x name   17x photoUrl   17x position   17x band   17x bond   17x friction
 7x term  7x label       <- React dedupes by reference: exactly the 4 BONDS + 3 FRICTIONS consts
```

Zero occurrences of `rank|sim|score|contribution|shortfall|weight|affinity|posterior|mu|sigma`
as a key. Zero `%` anywhere in the document. The only bare decimals are Tailwind
class fragments (`size-3.5`, `gap-1.5`, `py-1.5`, `h-[38px]`) and turbopack chunk
hashes — I checked each in context; none is data.

`position` is an ordinal the spec mandates. `bond.term` is a categorical engine
term name, never a weight. There is no float anywhere in the system to invert,
because the engine (#10) has not landed. **Clean, and clean for a structural
reason: the type cannot carry a score, so no serialiser can.**

### 3. AC-RANK-4 · does filtering disclose a count anywhere, including accessible names and `aria-*`?

**No.** I harvested every `aria-*`, `title` and `alt` attribute in the document
after activating `Alta` (17 → 7, so 10 removed): **24 attributes, none count-bearing.**
No `aria-setsize`, no `aria-posinset`, no `aria-describedby`, no live region beyond
the two `role="status"` empty states, whose copy names nothing and counts nothing.

One honest caveat the plan does not state. The e2e's guard is
`not.toMatch(/${before-after}\s*(ocult|escond)/i)` — it only catches the exact
removed count adjacent to those two Spanish stems. A leak worded `"7 de 17"` would
pass it. I swept independently and found no such string, so the property holds —
but the assertion is narrower than the requirement it guards.

**Inference channel, stated for the record, not a violation.** Filtering to `Media`
leaves positions 8..17 visible, from which the removed count is inferable. That is
forced by two spec requirements held simultaneously — `position` must render, and
filtering must not renumber — and it discloses only the viewer's own ranking,
never anything about suppressed people. The requirement forbids *reporting* a
count; nothing reports one.

### 4. AC-RANK-6 / AC-PORT-5 · does any empty or degraded state name, count or imply specific absent people?

**No, in all four states.** Verified by reading each branch:

- empty room (`page.tsx:137`) — `aria-label="La sala todavía se está llenando"`, copy
  `"la sala todavía se está llenando. volvé en un rato."` No name, no count.
- filter-with-no-matches (`rank-board.tsx:66`) — `aria-label="Nadie en esta banda"`.
  No name, no count.
- `not-consented` / `below-floor` (`page.tsx:111,121`) — one shared `<Blocked>`
  shape; no other person's name is rendered on either branch. The `<Header>` still
  renders `me.name`, which is the **viewer's own** name, not another person's.

**The property holds. What does not hold is that any of it is tested — see C1.**

### 5. AC-RANK-8 · is every entry keyboard reachable off-screen, and is the reduced-motion count genuinely 0?

**Keyboard: yes, and the suite does not prove it — I did.** `rank.spec.ts:188`
uses `scrollIntoViewIfNeeded()`, which is programmatic scrolling, not keyboard
operation. The requirement text says "keyboard reachable"; the suite tests
targetability only, and only for the **last** entry. I drove real Tab presses at
390×844:

```
entries = 17    reachable-by-Tab = 17    ALL entries reachable
last entry ("17 · Daniel Rueda...") horizontally in view after focus alone: true
```

Sound by construction too — each card is an `<a href>` in DOM order inside an
`overflow-x-auto` region that is itself `tabIndex={0}`.

**Reduced motion: the probe is LIVE, but time-window dependent.** Measured both ways:

| `prefers-reduced-motion` | immediately after load | after 1.2 s |
|---|---|---|
| `no-preference` | total 17, **running 17** | total 17, running 0 |
| `reduce` | **total 0**, running 0 | total 0, running 0 |

So the guard genuinely does work — under `reduce` the animations do not exist at
all (`animation: none !important` in `globals.css:494-505`, which matches `.pop-in`
**and** `[style*="animation"]`, so the inline stagger is doubly covered).

But the animations all **finish by ~1.22 s** (0.5 s `popin` + 16 × 45 ms stagger),
and the assertion is `running === 0`. Any run where the `evaluate` lands after that
window passes **whether or not the guard exists**. It currently lands at ~240 ms, so
it is live today; it is one slower CI box or one longer stagger away from being
vacuous. Asserting `document.getAnimations().length === 0` would be time-invariant.

### 6. Task honesty — are 6.0–6.9 truly complete?

| Task | Verdict | Evidence |
|---|---|---|
| 6.0 | ✅ accurate | `mock.test.ts` has **exactly 9** `it` blocks, all over `LENSES`; both reported RED failures corroborated against git — see §7 |
| 6.1 | ✅ accurate | signature is `(lens, viewer, candidates)`; lens **is** in the hash (`mock.ts:74`); friction keyed on `position % 3` (`mock.ts:111`), so both branches are guaranteed |
| 6.2 | ✅ accurate | page declares no params; `isLens` checked and returned on **before** `enterRoom`; `redirect("/")` on null `me` |
| 6.3 | ✅ accurate | two labels only; `bg-band-high` / `bg-band-mid`; no `--tag-*` reached for |
| **6.4** | ⚠️ **OVERSTATED** | "photo or a NAMED placeholder" — the placeholder is written (`rank-card.tsx:103-116`) and **never renders**. `spot.sprite` is typed `readonly sprite: string` (`layout.ts:126`) and always one of four PNGs, so `photoUrl` is never null. `rg 'sin foto'` on the rendered document → **0**. Dead branch, zero coverage |
| 6.5 | ✅ accurate | one client island; two `useState`; `applyRankView` pure; `useDragScroll({initial:"start"})`; native `<input type="radio">` confirmed reachable by `getByRole("radio")` |
| **6.6** | ⚠️ **OVERSTATED** | both empty states exist and are correctly worded, but **neither is reachable**: `highCount = max(1, round(n*0.4))` guarantees both bands non-empty, and the roster has 18 people so `entries` is never `[]`. Neither has any test |
| 6.7 | ⚠️ accurate-but-dead | branches render from `status` as claimed, and the task correctly points at R14/R15. But `mockNotConsented` / `mockBelowFloor` are **referenced nowhere in the repo** — not by the page, not by a test. They are unreferenced exports |
| 6.8 | ✅ accurate | `lens-${lens}` on `<main>`; `globals.css` **byte-identical to `main`**; no raw hex added |
| 6.9 | ✅ accurate | 26/26 re-run and green in both projects; the two mutation probes are analytically sound — see §7 |

### 7. Strict TDD — is there real RED-before-GREEN evidence, and were the probes proven live?

**6.0/6.1 RED evidence: corroborated against git history, not taken on trust.**

`mock.test.ts` did not exist on `main` (`git show main:...` → not found), so it is
new with its subject. Both reported RED failures are reproducible from the
pre-U6 source:

| Reported RED | Corroboration on `main` |
|---|---|
| `expected 'p-diego-morales' to be 'p-laura-mendez'` | `git show main:src/components/rank/mock.ts` → `viewer: { id: "p-diego-morales", name: "Diego Morales" }` hardcoded, and the signature was `mockRankedRoom(lens)` — no viewer parameter at all ✅ |
| `expected 1 to be 3` (distinct orderings) | `main`'s entries were `PEOPLE.map((…, i) => ({ position: i + 1, band: i < 3 ? "high" : "mid" }))` — a static array with **no hash and no lens input**. The order was provably identical across all three lenses ✅ |

**The second bug is the valuable one and the claim about it is true**: screen 1b's
lens picker was returning one ranking for three lenses. Nothing on 1b could have
caught it; only a property asserted across all three at once did.

**Probe liveness — validated analytically, not by re-mutation.** I did not re-run
the two mutations because this working tree is shared and a mutate/revert cycle
risks corrupting it. Both are provable by inspection instead:

- *both pills given the same token* → `rank.spec.ts:92` first asserts both keys are
  present, then asserts `backgrounds["BANDA ALTA"] !== backgrounds["BANDA MEDIA"]`.
  Identical tokens ⇒ identical computed `backgroundColor` ⇒ the assertion fails.
  **Cannot pass vacuously.**
- *`87%` appended to a bond label* → the bond label renders as visible text in the
  card body (`rank-card.tsx:79-81`); `main.innerText()` therefore contains it, and
  `not.toMatch(/\d+([.,]\d+)?\s*%/)` fails. `truncate` is CSS `text-overflow` and
  does not affect `innerText`. **Cannot pass vacuously.**

The third guard, `@ts-expect-error` on `RankBand`, was proven live in Batch 4
(widening to `"low"` → **TS2578** at `rank.test.ts:38`) and `pnpm run typecheck`
is clean now, so it is still enforced.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ⚠️ | Batch 6 reports RED transcripts and a probe-liveness table, but **not** the canonical RED/GREEN/TRIANGULATE/SAFETY-NET table Batch 1 used. Substance present, format deviates |
| All tasks have tests | ⚠️ | 7/10. 6.4, 6.6, 6.7 have no covering test at any layer |
| RED confirmed (tests exist) | ✅ | `mock.test.ts` + `rank.spec.ts` both new; both RED claims corroborated against `main` |
| GREEN confirmed (tests pass) | ✅ | 178/178 unit, 26/26 e2e, re-executed in this run |
| Triangulation adequate | ✅ | 9 properties × 3 lenses; friction asserted on **both** branches; orderings asserted distinct across all 3 lenses |
| Safety net for modified files | ✅ | `demo-path.spec.ts` was modified; re-run here → 38 passed. The edit is documented in-file with its reason, not silent |

**TDD compliance**: 4/6 clean, 2 warnings.

## Test Layer Distribution

| Layer | Tests | Files | Tool |
|---|---|---|---|
| Unit | 9 | 1 (`src/components/rank/mock.test.ts`) | vitest (`environment: "node"`) |
| Integration | **0** | 0 | **structurally impossible** — no jsdom by project decision |
| E2E | 26 (13 × 2 projects) | 1 new (`e2e/rank.spec.ts`) + 1 modified | Playwright |
| **Total** | **35** | **2 new, 1 modified** | |

The zero in the Integration row is the root cause of every gap in this report —
see C1.

## Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `src/components/rank/mock.test.ts` | 142-143 | `if (room.status === "ranked") expect(room.entries).toEqual([])` | **Conditional assertion.** If `mockRankedRoom` ever returned a non-`ranked` status for an empty roster, this test passes with **zero assertions executed**. The honest form asserts the status first | WARNING |
| `e2e/rank.spec.ts` | 140-142 | `not.toMatch(/${before-after}\s*(ocult\|escond)/i)` | Narrower than the requirement — catches only the exact count next to two stems; `"7 de 17"` would pass | WARNING |
| `e2e/rank.spec.ts` | 209-216 | `expect(running).toBe(0)` | Passes vacuously once animations finish (~1.22 s). Live today at ~240 ms; not time-invariant | WARNING |
| `e2e/rank.spec.ts` | 114-120 | `expect(body).not.toMatch(/BANDA BAJA/i)` | Text proxy for a property the **type** already guarantees; the precondition is unrepresentable | SUGGESTION |
| `e2e/rank.spec.ts` | 65-67 | comment: *"the photoless placeholder puts 'sin foto' first in the DOM"* | **Factually false** with this fixture — no card is photoless. The `aria-label` choice is still right; its stated justification is not | SUGGESTION |

No tautologies. No ghost loops — both `for` loops are preceded by a non-zero count
assertion (`:62` and `:131`). No `vi.mock()` calls anywhere, so no mock-heavy tests.
No CSS-class assertions: every query is by role or accessible name, as AC-RANK-2
demands.

**Assertion quality**: 0 CRITICAL, 3 WARNING, 2 SUGGESTION.

## Quality Metrics

**Linter**: ✅ biome clean over 217 files, no fixes applied
**Type checker**: ✅ `next typegen && tsc --noEmit` clean

---

## Correctness (static evidence)

| Requirement | Status | Notes |
|---|---|---|
| Ranking belongs to the viewer | ✅ Implemented | No page params; viewer via `enterRoom(IMPERSONATION_COOKIE, serverDeps())` per R11; `mock.ts:84` filters the viewer out defensively even if the caller already did |
| Two bands only | ✅ Implemented | `RankBand = "high" \| "mid"`; `BAND` is a total `Record`, so a third is a compile error |
| Position never renumbered | ✅ Implemented | `applyRankView` filters and sorts but never reassigns `position` (`view.ts:37-46`) |
| Lens genuinely changes the ranking | ✅ Implemented | Lens is inside the FNV-1a key (`mock.ts:74`); asserted distinct across all 3 |
| Determinism | ✅ Implemented | Pure hash, no `Math.random`, no `Date`; asserted call-to-call |
| No score in type or DOM | ✅ Implemented | Verified at the type, the payload and the pixel |
| Degraded states name the stage only | ✅ Implemented | Per R14 — correct given `RankedRoom` has no `floorReason` |
| Fixture dated for deletion (10.8) | ✅ Implemented | `mock.ts:7` names issue #10 as the deleter and states it is fixture data |

## Coherence (design + reconciliation rows)

| Decision | Followed? | Notes |
|---|---|---|
| R9/R13 — contract vs view split | ✅ Yes | Types + ports in `src/lib/{domain/reveal,ports}/`; `applyRankView`/`RankSort`/`mock.ts` under `src/components/rank/`. `domain/reveal/index.ts` exports **only** `export type` — 10.7 holds |
| R10 — colocated `mock.ts`, no adapter, no composition entry | ✅ Yes | No `src/lib/adapters/reveal/**`; nothing added to `composition.ts` |
| R11 — viewer via `enterRoom`, no `src/app/viewer.ts` | ✅ Yes | `page.tsx:37-43` mirrors `RoomPage` exactly; no resolver file created |
| R12 — `mockRankedRoom(lens, viewer, candidates)` | ✅ Yes | Real identity in, only order/band/bond/friction fabricated |
| R14 — screen names the stage, not the floor reason | ✅ Yes | One `<Blocked>` shape, two titles, no other person's name on either branch |
| R15 — degraded states unreachable, no e2e, stated | ⚠️ Partial | Conclusion **sound**, reasoning **incomplete** — see W1 |
| 10.1 hexagon | ✅ Yes | No `getDb`, `@/lib/adapters/db/**` or `drizzle-orm` under `src/app/**` or `src/components/**`. `adapters/http/session` appears in 7 intake/quiz files, allowed by R7 |
| 10.2 `excludedFromRoom` | ✅ Yes | Unreachable from `src/app/**` and `src/components/**` |
| 10.3 #7/#10 files | ✅ Yes for U6 | The 4 protected test files are **byte-identical to `main`**; U6 creates none of the forbidden modules. See S3 — the check's wording has expired |
| 10.5 `globals.css` | ✅ Yes | Byte-identical to `main` |
| 10.6 `src/components/ui/**` | ✅ Yes | Byte-identical to `main` |
| 10.7 contract stable and type-only | ✅ Yes | All four ports and all four `domain/reveal/*` modules present; barrel is 100% `export type` |

---

## Issues Found

### CRITICAL

**C1 — Three required spec scenarios have no covering test at any layer, and
nothing in the plan records them.** One root cause, three instances.

The fixture derives identity from `adapters/participants/roster.ts`, which models
`{id, name, team}` and nothing else, and `page.tsx:50` substitutes `spot.sprite`
for `photoUrl`. Combined with `highCount = Math.max(1, round(n*0.4))` over an
18-person roster, **the screen can only ever render its happy path.** Every
degraded branch is unreachable, and because vitest runs `environment: "node"`
with no jsdom, none of them can be reached by a unit test either. Playwright can
only see what the fixture produces, so these branches are unverifiable in the
current harness:

| Scenario | Dead code | Why unreachable | Recorded? |
|---|---|---|---|
| AC-RANK-2 · no photo still looks intentional | `rank-card.tsx:103-116` | `sprite` is `readonly sprite: string`, never null → `photoUrl` is never null. `rg 'sin foto'` on the rendered doc = **0** | **NO** |
| AC-RANK-4 · a filter with no matches | `rank-board.tsx:66-72` | `highCount ≥ 1` and `n=17 > highCount=7`, so both bands are always populated | **NO** |
| AC-RANK-6 · empty room | `page.tsx:137-145` | 18-person roster ⇒ `entries.length` is always 17 | **NO** |

`tasks.md` marks 6.4 and 6.6 `[x]` and `apply-progress.md` lists them as shipped.
The code **is** written and, on inspection, correct. What is claimed but absent is
any evidence that it works. R14/R15 record the *other* two degraded branches with
care; these three slipped through the same net without the same disclosure.

Cheapest honest close for the first one: give one roster candidate a `null`
`photoUrl` at the `page.tsx:45-51` mapping — a person without a photo is a person
who has not finished intake, which is **not** a fabricated consent value, so R1
does not forbid it. That one change also makes the e2e comment at `rank.spec.ts:65`
true. The other two need either a jsdom-capable test layer or a fixture seam that
can produce an empty band.

### WARNING

**W1 — R15's conclusion is right; its stated reasoning is incomplete, and the gap
it leaves is what produced C1.** R15 argues the two floor states have no e2e
because the fixture cannot honestly produce them without inventing consent (true,
and R1 forbids that). But it treats "the fixture cannot reach this state" as
equivalent to "this branch cannot be tested" — and those are different claims.
`mockNotConsented()` and `mockBelowFloor()` exist **precisely** to construct those
states, and `<Body>` is a pure function of `RankedRoom`; a component test would
reach them without touching consent. The real blocker is that
`vitest.config.mts` sets `environment: "node"`, so no component can be rendered in
a unit test at all. R15 never says this. Because it framed the limit as a fixture
problem rather than a harness problem, the same limit hit three more scenarios
(C1) without anyone noticing they belonged in the same paragraph. **The decision
stands; the reasoning should name the real constraint before U7 and U9 inherit it.**

**W2 — `mockNotConsented` and `mockBelowFloor` are referenced nowhere in the
repository.** Not by `page.tsx`, not by `mock.test.ts`, not by any e2e.
`rg 'mockNotConsented|mockBelowFloor'` returns only their own definitions. R15
says they are "exercised by nothing but the type", which is generous — nothing
constrains them but their own return annotation. They are correct as written and
their existence is defensible as #10's landing pad, but they are currently
unreferenced exports and will not fail if they rot.

**W3 — the reduced-motion assertion is one slow machine away from vacuous.**
Measured: all 17 animations finish by ~1.22 s; the assertion is `running === 0` and
currently evaluates at ~240 ms. It is live today (I confirmed 17 running without
the guard, 0 existing with it), but it does not fail for the right reason if the
timing slips. `document.getAnimations().length === 0` is the time-invariant form —
and it is what `reduce` actually produces here.

**W4 — the AC-RANK-4 leak guard is narrower than the requirement.**
`not.toMatch(/${removed}\s*(ocult|escond)/i)` catches one phrasing of one number.
I swept every `aria-*`/`title`/`alt` attribute plus the full text and found no
disclosure, so the property holds — but the test would not defend it against a
rewording such as `"7 de 17"`.

**W5 — Batch 6 omits the canonical TDD Cycle Evidence table.** Batch 1 reported
RED/GREEN/TRIANGULATE/SAFETY-NET per task; Batch 6 reports a narrative plus a
probe-liveness table. The substance is present and I corroborated the RED claims
against git independently, so this is a reporting-format deviation, not a
protocol failure — but a future verifier without git access could not reconstruct
what I did.

**W6 — `apply-progress.md` overstates the AC-RANK-1 evidence.** "the e2e compares
the two documents byte for byte" — it compares `main.innerText()`, which excludes
`aria-label`, `href` and hidden content. The underlying property is true and I
proved the stronger form, but the sentence describes a test that was not written.

### SUGGESTION

**S1 — a docblock contradicts the code it documents.** `rank-board.tsx:96` says the
radios sit *"behind a `sr-only` peer"*; the inline comment at `:121-124` and the
class list at `:127` say the opposite, and explicitly explain why `sr-only` was
rejected (no hit area, 30 s Playwright timeouts). The inline comment is the correct
one. The docblock predates the fix.

**S2 — `tasks.md` 10.5's "Known gap" is factually wrong and could mislead U9.** It
says `walk` and `popin` "have no `@utility` wrapper and do not appear in the
`prefers-reduced-motion` block". Both do: `@utility walking` at `globals.css:471`,
`@utility pop-in` at `:475`, and both `.walking` and `.pop-in` are listed in the
block at `:500-501`. U9's task 9.5/9.6 may be routed around a constraint that does
not exist.

**S3 — 10.3's "these five modules must be absent" has expired on `main`.**
`src/lib/use-cases/score-participant.ts` and `src/lib/ports/latent-repository.ts`
now **exist** — PR #37 / issue #30 landed them. U6 did not create them (confirmed:
neither appears in `git diff main...HEAD --name-only`) and the four protected test
files remain byte-identical, so AC-PORT-6 holds for this change. But the check as
worded now fails on `main` itself and should be reworded to "not created or edited
**by this change**" before U7 runs it.

**S4 — the skipped-test count moved 22 → 21 between the U3 and U6 reports, and it
is not U6's doing.** Currently skipped in the protected files: 4 in
`prepare-results.test.ts`, 1 in `to-person.test.ts`; `score-participant.test.ts` and
`scoring.test.ts` now run because their implementation landed on `main`. Since
U6's diff leaves all four byte-identical, AC-PORT-6 is satisfied — but the raw
"skipped count unchanged" number is now environment- and base-dependent, and
comparing it across batches will keep producing false alarms.

**S5 — `demo-path.spec.ts`'s `AC-10` and `AC-11` are not evidence for U6.** They
assert against `/results/{lens}` and `/room`, never `/rank`, and the file's own
comment concedes AC-11 is "vacuous while /room is a 404". They passed; they simply
do not bear on this unit. Worth not counting them toward 1c's safety story.

---

## Verdict

**FAIL** — on coverage, not on behaviour.

Everything that runs, runs green and was re-executed here: `pnpm run verify`
178/178, `rank.spec.ts` 26/26 across both viewports, `demo-path.spec.ts` 38/38,
and a database-free production build. Every safety-bearing property I attacked
held, several more firmly than the suite proves: `?subject=` is inert at the byte
level and not merely the visible-text level, the RSC payload carries no number
that is or inverts into a score, filtering discloses no count through any
accessible name, and all 17 entries are genuinely Tab-reachable. Both reported RED
failures are corroborated against `main`, and the ranking bug the probe found —
one order for three lenses — was real and is fixed.

The blocker is C1: **three required spec scenarios have no test at any layer, and
unlike R14/R15's two, nothing records them.** All three are branches that cannot be
reached because the fixture only ever produces the happy path, and cannot be
unit-tested because vitest has no DOM. `tasks.md` marks 6.4 and 6.6 complete; the
code is there and looks right, but "looks right" is what verification exists to
replace.

Two of the three need a harness decision that outlives U6 and should be made
before U7 inherits it. **One — the photoless placeholder — is a one-line fixture
change that R1 does not forbid**, and closing it would also make a stale e2e
comment true.

**Recommended next**: `sdd-apply` for C1, then re-verify. Do not archive.

---
---

# Verification Report — UI Flow Screens, work unit U7 (`/profile/[id]`, screen 1d)

Twin: Engram `sdd/ui-flow-screens/verify-report`. Scope: **U7 only**. U1, U2, U3
and U9 are out of scope. **U6 is not re-verified** — its section above stands;
this section records only what U7 *inherits* from it.

**Change**: `ui-flow-screens` / U7
**Branch**: `feat/ui-flow-u7-profile` @ **`8a97665`**, stacked on
`feat/ui-flow-u6-rank`. Diff = `git diff feat/ui-flow-u6-rank...HEAD`.
**Mode**: **Strict TDD** (`pnpm run test`, vitest; `pnpm exec playwright test`)
**Artifact store**: hybrid — file twins authoritative
**Normative order**: reconciliation rows **R9–R16 in `tasks.md` override
`specs/`** wherever they disagree. Judged accordingly.

> **Evidence is pinned to commit `8a97665`.** Midway through this run the shared
> working tree was modified from outside it — see **W9**. Every command below was
> executed against a tree byte-identical to `8a97665`; I verified my own probe
> restores against `git show HEAD:` afterwards and clobbered nothing.

---

## Completeness

| Metric | Value |
|---|---|
| U7 tasks total (7.0–7.6) | 7 |
| U7 tasks marked complete | 7 |
| U7 tasks incomplete | 0 |
| U7 tasks whose `[x]` is **accurate** | 5 (7.0, 7.1, 7.2, 7.4, 7.5) |
| U7 tasks whose `[x]` is **overstated** | 2 (7.3, 7.6) |
| `apply-progress.md` batch for U7 | **absent** — see C4 |

## Diff scope (verified, not assumed)

`git diff --name-only feat/ui-flow-u6-rank...HEAD` — 9 files, 700 insertions /
37 deletions:

```
e2e/profile.spec.ts                        (new, 8 tests)
openspec/changes/ui-flow-screens/tasks.md  (7.0-7.6 checked, R16 added)
src/app/profile/[id]/page.tsx              (new)
src/components/profile/{avatar-stage,profile-card,tag-chips}.tsx  (new)
src/components/profile/{mock.ts,mock.test.ts}                     (new)
src/components/rank/mock.ts                (+2: optional `team` on RankCandidate)
```

**The claim that `quiz.spec.ts` / `intake-declared.spec.ts` are not U7's doing is
CONFIRMED** — the diff touches nothing under `src/app/quiz/**`,
`src/app/intake/**` or their specs. Their `DATABASE_URL` dependency is
pre-existing. `composition.ts` is untouched (**R10 honoured**: no `ProfilePort`
implementation, no `Deps` member).

---

## Build & Tests Execution

**`pnpm run verify`** → **exit 0**

```text
next typegen && tsc --noEmit   -> clean
biome check .                  -> 224 files, no fixes applied
vitest run                     -> 38 files passed | 1 skipped
                                  186 tests passed | 21 skipped   (1.42s)
```

178 → 186 is exactly U7's 8 new unit tests. **Skipped stays 21**, so AC-PORT-6's
count is unmoved (see also U6/S4 on why the raw count is a poor signal).

**`pnpm exec playwright test profile.spec.ts`** → **16 passed** (8 tests ×
mobile + desktop), 4.5s. No flakes over 6 separate invocations during this run.

**`pnpm exec playwright test`** (full suite) → **124 passed, 26 failed, 28
skipped**. All 26 failures are `intake-declared.spec.ts` (12) and `quiz.spec.ts`
(14), both `DATABASE_URL`-dependent and both untouched by this diff.

**`env -u DATABASE_URL pnpm run build`** → **exit 0**, 14 routes, `/profile/[id]`
emitted as `ƒ (Dynamic)`. **AC-PORT-9 holds.**

---

## Spec Compliance Matrix

### profile-screen

| Requirement | Scenario | Covering test | Result |
|---|---|---|---|
| scoped to the viewer's ranking | AC-PROF-1 · a ranked person renders | `profile.spec.ts:29` | ✅ COMPLIANT |
| " | AC-PROF-2 · below-floor 404s, body identical to unknown-id | `profile.spec.ts:38` (substitutes self-id) | ⚠️ PARTIAL |
| " | AC-PROF-2 · a non-consenting person 404s identically | (none — no subject, undisclosed for 1d) | ❌ UNTESTED |
| " | AC-PROF-2 · the lens changes who is reachable | `profile.spec.ts:56` (R16 substitution) | ⚠️ PARTIAL |
| named reasons, never numbers | AC-PROF-3 · content is named, not scored | `profile.spec.ts:71` | ✅ COMPLIANT |
| " | AC-PROF-3 · shared tags only | `mock.test.ts:77` | ✅ COMPLIANT (unit) |
| " | AC-PROF-3 · no shared tags is a designed state | `profile.spec.ts:81` — **assertion cannot fail** | ❌ UNTESTED |
| " | AC-PROF-3 · a photoless profile still looks intentional | `mock.test.ts:115` — **synthetic subject** | ❌ UNTESTED |
| nothing offspring-shaped | AC-PROF-4 · consent-invariant output | (none) | ❌ UNTESTED |
| " | AC-PROF-4 · no offspring-named element | `profile.spec.ts:91` | ✅ COMPLIANT |
| the simulate CTA | AC-PROF-5 · the CTA target | `profile.spec.ts:109` | ✅ COMPLIANT |
| " | AC-PROF-5 · following the CTA preserves the lens | (none) — **and currently false** | ❌ UNTESTED |
| reduced-motion guard | AC-PROF-6 · motion stops | `profile.spec.ts:123` | ✅ COMPLIANT |
| " | AC-PROF-6 · motion exists without the preference | `profile.spec.ts:123` | ✅ COMPLIANT |

### ui-read-ports (only what bears on U7)

| Scenario | Covering test | Result |
|---|---|---|
| AC-PORT-1 · impersonation resolves the viewer | `profile.spec.ts` seeds the cookie; all 8 depend on it | ✅ COMPLIANT (R11) |
| AC-PORT-1 · a real session outranks impersonation | — | ➖ **void by R11** |
| AC-PORT-2 · the viewer never comes from the URL | (none on `/profile`) — property verified by me | ❌ UNTESTED |
| AC-PORT-3 · no score in the DOM | `profile.spec.ts:71` + my 30-render sweep | ✅ COMPLIANT |
| AC-PORT-5 · suppression is invisible | trivially — 1d renders no third party | ✅ COMPLIANT |
| AC-PORT-6 · the other team's red tests are untouched | 4 protected files byte-identical; no forbidden module created | ✅ COMPLIANT |
| AC-PORT-8 · the UI cannot leak consent | see AC-PROF-4 | ❌ UNTESTED |
| AC-PORT-9 · no connection is opened / hexagon rule | DB-free build + import grep | ✅ COMPLIANT |

**Compliance summary: 11 / 22 scenarios COMPLIANT, 2 PARTIAL, 8 UNTESTED, 1 void.**

---

## Adversarial findings — the eight pressure points

### 1. AC-PROF-2 · is the 404 genuinely not an oracle?

**Yes, and more firmly than the suite proves.** The e2e compares
`document.body.innerText`. I compared the full responses.

| Signal | unknown id | the viewer's own id |
|---|---|---|
| status | `404` | `404` |
| headers (minus `Date`) | identical | identical |
| body bytes | 18609 | 18607 |
| body after normalising the **echoed URL segment** and Next's per-response `__next_r` nonce | 18567 | **18567 — byte-identical** |
| RSC flight (`?_rsc`) | 200, 9287 B | 200, 9286 B |
| flight after the same normalisation | identical but for the React key nonce | " |

The entire 2-byte delta is `p-nobody-at-all` (15) vs `p-laura-mendez` (14)
appearing twice in Next's router state — the id **the requester itself supplied**.
Nothing about room membership crosses. Payload size, header set, and timing class
are all invariant. **The oracle does not exist.**

The two causes the fixture cannot reach (below-floor, non-consenting) collapse to
the same `null` **in the source**, one line above the two that are reachable, so
the property is structural rather than incidental.

### 2. AC-PROF-3 · does the other person's non-shared tag reach the client anywhere?

**No.** For the tested pair, `mockTagsFor("p-diego-morales")` =
`picante, reposteria, vegetariano, tango, running`; the viewer's are
`cine-de-culto, fantasia, ramen, arepas, cafe-de-especialidad`. I grepped both
the served HTML (22041 B) and the RSC flight payload (13394 B) for all ten:
**zero occurrences of any of them**. No other roster name appears either — not
even the viewer's own. No `"position"`, `"band"`, `"bond"`, `"friction"`,
`"standing"` or `"tags"` key survives into either payload, because the three
profile components are Server Components and nothing crosses a client boundary.

I then swept **30 renders** (10 people × 3 lenses) for `%`, a bare decimal, an
ordinal, and `/beb[eé]|hijo|offspring/i` in `<main>`: **clean on all 30**.

The intersection happening in `mock.ts:86` rather than in `tag-chips.tsx` is the
load-bearing choice and it is correct: the component is never handed the data it
would have to be trusted not to render.

### 3. AC-PORT-8 / AC-PROF-4 · is the DOM really invariant to romantic consent?

**Trivially, and it should be said plainly.** `RankCandidate` is
`{id, name, photoUrl, team?}` and `PersonProfile` has no consent field.
`page.tsx:48-53` maps `enterRoom`'s `others` into candidates and drops everything
else. **Consent is not merely unrendered — it never enters the render's input.**
The property is unbreakable by construction today, which is a stronger guarantee
than any test could give, and it is also why the spec's scenario ("two fixture
people identical except `consent.romantic`") has no subject.

**What breaks it when #10 lands**: `ProfilePort.byId` will project from real
`Participant` rows that *do* carry `consent`. Invariance survives if
non-consenting people simply become `null` → `notFound()` (which is what
AC-PORT-5 requires anyway). It dies the moment anyone adds a disabled, locked or
"available under romance" affordance, or lets `standing` differ in shape between
consented and non-consented people. The guard that would catch that does not
exist yet, and nothing in the plan says so — see **C3**.

### 4. AC-PROF-5 · does the CTA leak the viewer anywhere?

**No — and I checked the wire, not just the attribute.** Loading
`/profile/p-diego-morales` under the business lens, I captured every network
request the page issues: **zero URLs contain `p-laura-mendez`**. No prefetch
fires against `/simulate` at all. No console errors. `href` is exactly
`/simulate/p-diego-morales` — no query string, no viewer id, and the lens travels
in `dipia_lens` as specified. The Referer on click names the *person*, never the
viewer, so even a same-origin log records nothing about who was looking.

**But following it lands on Next's built-in 404.** `/simulate/[id]` does not
exist (U9 unbuilt), which the route table confirms. See **W6**.

### 5. AC-PROF-6 · is the motion assertion time-invariant this time?

**Yes. U6's W3 is properly closed.** I sampled `document.getAnimations()` at
0/100/400/1000/2000/3400/5000 ms in both media states:

```
default : count=1 running [bob]  at every one of the 7 samples
reduce  : count=0             at every one of the 7 samples
```

`@utility avatar-bob` is `animation: bob 3.2s ease-in-out infinite`
(`globals.css:467`), so the count **cannot decay to 0** the way U6's staggered
finite `pop-in` did — the assertion is a property of the page, not of when you
looked. `.avatar-bob` is already listed in the guard at `globals.css:498` and
`globals.css` is **not in the diff**, so 7.4's "no new bespoke class" is literally
true. Probe A (below) proves the assertion is live.

### 6. Task honesty — are 7.0–7.6 truly complete?

Five are. Two are overstated, and one of those is overstated the same way 6.4 and
6.6 were.

- **7.0 — accurate, and the deviation is disclosed.** Planned
  `mockProfile(personId, lens, me, others)`; delivered
  `mockProfile(personId, room, candidates)`. The rewritten row explains why, and
  the new signature makes the single-source property structural rather than
  conventional. Good change, honestly recorded.
- **7.1 — accurate on substance, thin on one clause.** 8 properties, all present
  and all live. But the plan said "**all four** suppression causes return `null`
  and nothing distinguishes them"; two of the four have no subject and the
  rewritten row drops "four" without saying so. R16 records the *lens*
  substitution, not this one.
- **7.2, 7.4, 7.5 — accurate.**
- **7.3 — OVERSTATED.** "photoless avatar gets a named placeholder" is written and
  correct, and **cannot render**. See **C2**.
- **7.6 — OVERSTATED.** See **W1**: the row was rewritten to describe the test
  that was written rather than the test that was planned, and two of its three
  original clauses left the record without a reconciliation row.

### 7. Strict TDD — is the RED real, and were the three probes live?

**All three claimed probes are live. I re-ran every one and got the exact strings
`tasks.md` records.**

| Mutation | Probe | Claimed in 7.6 | Observed by me |
|---|---|---|---|
| `avatar-bob` removed | AC-PROF-6 e2e | `Expected > 0, Received 0` | ✅ `Expected: > 0` / `the stage should be alive by default` |
| tags sent un-intersected | AC-PROF-3 unit | `expected [ 'anime', 'k-pop', …(3) ] to deeply equal []` | ✅ that exact message — **plus a second test also failed** |
| `?from=5` on the CTA | AC-PROF-5 e2e | `Received "/simulate/p-diego-morales?from=5"` | ✅ that exact string |

**RED reconstruction.** There is one squashed commit, so no RED-first commit
exists to inspect. I reconstructed it instead: replacing `mockProfile`'s body with
the Fake-It `return null` yields **5 failed / 3 passed**, not the "4 assertion
failures" 7.0 records. The benign reading is that 7.0's RED predates 7.1's eighth
property; I record the measurement without calling the claim false.

**Two probes of my own found holes the author's three did not:**

| My mutation | Expected to fail | Actually |
|---|---|---|
| delete `mock.ts:75` (`personId === room.viewer.id` guard) | AC-PROF-2 | **8/8 unit + 16/16 e2e still GREEN** → W3 |
| replace the "nothing in common yet" state with the bare empty `<ul>` AC-PROF-3 forbids | AC-PROF-3 tags | **still GREEN** → C1 |

### 8. The `standing` single-source claim — can 1c and 1d disagree?

**Not today. Yes, once the roster stops being a constant.**

I compared the live pages for the same pair (Laura Méndez → Diego Morales,
romantic):

| | position | band | bond | friction |
|---|---|---|---|---|
| `/rank` | 13 (`aria-label="13 · Diego Morales…"`) | BANDA MEDIA | les une: humor parecido | roce: planes de ciudad |
| `/profile/p-diego-morales` | not rendered (by design) | BANDA MEDIA | les une: humor parecido | roce: planes de ciudad |

They agree. But the mechanism is **not** "one source" — it is "the same pure
function re-run over the same input". `mockRankedRoom` derives `band` from
`highCount = max(1, round(others.length * 0.4))` and `friction` from
`position % 3`, so **both are functions of roster size**. Simulating one extra
arrival between the two page loads:

```
17 others -> 18 others:  6 of 17 pairs change standing
  p-sofia-guzman   pos 12->13  friction null  -> shown
  p-natalia-pena   pos 14->15  friction shown -> null
  p-nicolas-rojas  pos 15->16  friction null  -> shown
  p-daniel-rueda   pos 17->18  friction shown -> null
```

Unreachable at `8a97665` because `adapters/participants/roster.ts` is a static
18-row array and `composition.ts` wires it as a **non-getter**. But that same
file's docblock advertises "swapping it for a Drizzle-backed implementation later
changes this file and the one line in `composition.ts`". The invariant is *same
roster ⇒ same answer*, not *one source, one answer*, and 1d re-derives the whole
`RankedRoom` per request to read one row out of it. See **S1**.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ❌ | **`apply-progress.md` has no U7 batch at all** — its "Remaining" still lists U7 as pending. Evidence lives in `tasks.md` 7.0–7.6 + R16 instead. |
| All tasks have tests | ⚠️ | 5/7 have a test that can fail; 7.3's placeholder branch and 7.6's consent clause do not. |
| RED confirmed | ⚠️ | Unverifiable from git (one squashed commit). Reconstructed: 5 failures against a Fake-It, vs the 4 recorded. |
| GREEN confirmed | ✅ | 8/8 unit and 16/16 e2e re-executed here. |
| Triangulation | ✅ | 8 unit properties + 8 e2e scenarios; the intersection test is non-degenerate (2 of 7 candidates share tags, 5 do not). |
| Safety net for modified files | ✅ | Only `components/rank/mock.ts` was modified (+2, optional `team`); `rank.spec.ts` and `demo-path.spec.ts` are green in the full run. |
| Probe liveness | ✅ | All three claimed probes reproduced verbatim. |

**TDD compliance: 4 / 7 checks clean.**

## Test Layer Distribution

| Layer | Tests | Files | Tool |
|---|---|---|---|
| Unit | 8 | 1 (`mock.test.ts`) | vitest, `environment: "node"` |
| Integration | **0** | 0 | none — no jsdom (**R15, still open**) |
| E2E | 8 × 2 projects = 16 runs | 1 (`profile.spec.ts`) | Playwright |

Every DOM-level assertion about screen 1d rests on Playwright alone, and
Playwright can only see what the fixture produces. That is the single root cause
of C1 and C2.

## Changed File Coverage

`vitest run --coverage --coverage.include='src/components/profile/**' --coverage.include='src/components/rank/mock.ts'`

| File | Stmts | Branch | Funcs | Lines | Uncovered | Rating |
|---|---|---|---|---|---|---|
| `src/components/profile/mock.ts` | 95.83% | 90% | 100% | 100% | L74 | ✅ Excellent |
| `src/components/profile/avatar-stage.tsx` | 0% | 0% | 0% | 0% | L23 | ⚠️ e2e-only |
| `src/components/profile/profile-card.tsx` | 0% | 0% | 0% | 0% | L13 | ⚠️ e2e-only |
| `src/components/profile/tag-chips.tsx` | 0% | 0% | 0% | 0% | L16-31 | ⚠️ e2e-only |
| `src/components/rank/mock.ts` | 90% | 83.33% | 75% | 88.88% | L136-140 | ⚠️ U6/W2 unclosed |

Uncovered `mock.ts:74` is `if (room.status !== "ranked") return null;` —
`mockRankedRoom` never returns a non-`ranked` status, so the branch is dead for
the same reason `mockNotConsented`/`mockBelowFloor` (L136-140) remain unreferenced.

## Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `e2e/profile.spec.ts` | 88 | `expect(shared.count() + empty.count()).toBe(1)` | Cannot distinguish **which** branch rendered — passes for the bare empty row AC-PROF-3 forbids. Proven by mutation. | **CRITICAL** |
| `e2e/profile.spec.ts` | 68 | `expect(readings.size).toBeGreaterThan(1)` | Passes at 2 of 3; for the tested pair **business and friendship render an identical profile**. | WARNING |
| `src/components/profile/mock.test.ts` | 115-122 | `expect(photoless.length).toBeGreaterThan(0)` | The subject exists only because the test's own `CANDIDATES[2]` hardcodes `photoUrl: null` — a shape `page.tsx` cannot produce. | WARNING |
| `src/components/profile/mock.test.ts` | 40-49, 51-65, 77-101 | assertions inside `for (const entry of current.entries)` | No `toHaveLength` before the loop. Not vacuous today (the two "has a subject" tests would fail on an empty `entries`), but the protection is incidental. | SUGGESTION |

No tautologies, no orphan empty checks, no smoke-only tests, no CSS-class
assertions, no mock-heavy files. **Assertion quality: 1 CRITICAL, 2 WARNING.**

## Quality Metrics

**Linter**: ✅ `biome check .` — 224 files, no fixes applied.
**Type checker**: ✅ `next typegen && tsc --noEmit` — clean.

---

## Correctness (static evidence)

| Requirement | Status | Note |
|---|---|---|
| Viewer from the cookie, person from the segment | ✅ | `page.tsx:35-46`. `searchParams` is never read; I confirmed `?viewer=`/`?subject=` are inert at the byte level — the only delta is Next echoing the query back as router state, and Ana Ramírez's name appears nowhere. |
| One `null` check, one `notFound()` | ✅ | `page.tsx:61`. Four causes, one branch. |
| Shared tags intersected in the fixture | ✅ | `mock.ts:85-86`; the component is never handed the rest. |
| Bond named, friction optional, no number | ✅ | `profile-card.tsx`; `standing.position` deliberately unrendered. |
| Avatar bob inside the existing guard | ✅ | `avatar-bob` at `globals.css:467`, listed at `:498`; `globals.css` not in the diff. |
| CTA carries the person only | ✅ | `page.tsx:113`; verified on the wire. |
| Hexagon rule | ✅ | No `getDb`, no `adapters/db/**`, no `drizzle-orm` in any new file. |
| Photoless placeholder | ⚠️ | Written and correct; **unreachable** (C2). |

## Coherence (design + reconciliation rows)

| Row | Followed? | Note |
|---|---|---|
| R10 — colocated `mock.ts`, no port, no `composition.ts` entry | ✅ | `composition.ts` untouched; no `ProfilePort` implementation exists. |
| R11 — viewer is the impersonated participant via `enterRoom`, `redirect("/")` on null | ✅ | `page.tsx:42-46`, identical to `/rank`. No `src/app/viewer.ts`. |
| R12 — real identity in, mocked numbers out | ✅ | Candidates come from `enterRoom`; only order/band/bond/friction are fabricated. |
| R13 — the shapes stay put | ✅ | `PersonProfile` imported from `@/lib/domain/reveal/profile`, not redeclared. |
| R15 — `environment: "node"`, no component branch is unit-testable | ✅ acknowledged, ❌ unclosed | U7 inherits the limit verbatim and adds three more 0%-covered components. |
| R16 — AC-PROF-2's lens scenario has no subject | ⚠️ | Honest in form, overreaching in one sentence — see W2. |
| AC-PROF-3's "no rank index" vs the design | ⚠️ | Honoured at `8a97665`; **contradicted by uncommitted work in flight** — see W9. |

**On R16 specifically, since it was raised directly.** The substitution is honest
on two counts and overreaches on the third.

- *Is it clearly labelled?* **Yes.** `profile.spec.ts:59-62` names the spec
  scenario, states that it needs per-lens consent the fixture cannot honestly
  produce, cites R15, and says which half is being tested. That is the right way
  to do this, and it is better than what U6 did with its two gaps.
- *Does it still guard something real?* **Yes.** `readings.size > 1` fails if the
  fixture ever returns one reading for three lenses — which is **exactly the bug
  U6's probe caught on `/rank`**. It is a live regression guard for a defect that
  has already occurred once in this codebase.
- *Is it "the same underlying guarantee"?* **No, and that sentence should be
  struck.** The spec's scenario is about **reachability** — romance must 404. The
  substitute is about **variation** — the text must differ. A profile reachable
  under every lens that merely *says* different things passes the substitute and
  violates the requirement. The substitute cannot detect a missing consent gate;
  it detects a missing lens input. Calling them the same guarantee invites a
  future reader to believe AC-PROF-2's third scenario is covered.

---

## Issues Found

### CRITICAL

**C1 — AC-PROF-3's "no shared tags is a designed state" has a covering assertion
that cannot fail.** `profile.spec.ts:88` asserts
`shared.count() + empty.count() === 1`, which is satisfied by *either* branch. I
replaced the designed `role="status"` region with exactly the bare, chip-less
`<ul aria-label="Lo que tienen en común">` the requirement forbids — **the test
stayed green**. It catches "both rendered" and "neither rendered"; it cannot catch
"the wrong one rendered", which is the only failure the scenario is about.
Closing it is one line: assert `await empty.count()).toBe(1)` when
`profile.tags` is empty, or assert on the region's accessible name.

**C2 — AC-PROF-3's photoless placeholder cannot render, and 7.3 is marked `[x]`.
This is U6's C1 inherited verbatim, after U6's report named the one-line fix and
said to make it before U7 inherited it.** `Placement.sprite` is
`readonly sprite: string` (`layout.ts:126`) and `page.tsx:51` assigns
`photoUrl: spot.sprite`, so `PersonProfile.photoUrl` is **never null in the
running app**. I requested six roster profiles and `rg "sin foto"` returned **0**
on every one. The unit test that appears to cover it
(`mock.test.ts:115`, "gives the photoless stage a subject too") passes only
because the test's own `CANDIDATES[2]` hardcodes `photoUrl: null` — a shape the
page cannot produce. The branch is correct code with a synthetic witness.
**Remedy is unchanged from U6: give one roster candidate a `null` `photoUrl` at
the `page.tsx:48-53` mapping.** A person without a photo has not finished intake;
that is not a fabricated *consent* value, so R1 does not forbid it, and the same
one line closes AC-RANK-2 on screen 1c.

**C3 — AC-PROF-4 / AC-PORT-8's consent-invariance scenario has no test and no
reconciliation row.** The spec requires comparing two people identical except
`consent.romantic`. No such comparison exists anywhere; `profile.spec.ts:91`
iterates three *lenses* over one person and checks for offspring-shaped words.
The property **is** true today and unbreakable by construction (finding 3), which
is why this is a disclosure failure rather than a behaviour failure — but R16
records the lens substitution and nothing records this one, so the next reader
will believe the scenario is covered. **The remedy may well be a reconciliation
row rather than a test**, stating that the scenario has no subject until #10
supplies consent-bearing rows, and naming what would break invariance then.

**C4 — `apply-progress.md` contains no U7 batch.** It ends at Batch 6 and its
"Remaining" section still reads "U7 (`/profile/[id]`) then U9". Under Strict TDD
the apply phase must report TDD Cycle Evidence per task; for U7 there is no batch,
no RED/GREEN/TRIANGULATE/SAFETY-NET table, and no Files Changed table. The
narrative lives in `tasks.md` 7.0–7.6 instead, which is where the plan lives, not
where execution evidence lives. U6 was flagged for a *format* deviation here
(W5); U7 omits the artifact entirely.

### WARNING

**W1 — 7.6's row was rewritten to describe the test that was written, and two of
its three original clauses left the record.** Planned at
`feat/ui-flow-u6-rank:tasks.md:501-506`:

1. "404 bodies **byte-identical** across unknown id / below-floor / gate-failed /
   non-consenting" → delivered as `innerText`-identical across **two** causes.
2. "lens changes who is reachable" → **R16 discloses this one properly.**
3. "**consent-invariant DOM** across two people differing only in
   `consent.romantic`" → **not implemented, not recorded** (C3).

Clause 1's property is in fact true — I proved the stronger byte-level form above
— but that is my evidence, not the suite's, and the row now claims neither. This
is the same pattern U6/W6 flagged: the prose describes a test that was not
written.

**W2 — R16's substitute is weaker than it reads, in two ways.** (a) The sentence
"the same underlying guarantee" conflates reachability with variation — see the
coherence note above. (b) `toBeGreaterThan(1)` passes at 2 of 3. Computing the
rendered output for the tested pair from the fixture:

```
romantic    pos=13 -> mid  | les une: humor parecido | roce: planes de ciudad
business    pos= 5 -> high | les une: ritmo de vida  | roce: quién decide
friendship  pos= 7 -> high | les une: ritmo de vida  | roce: quién decide
distinct rendered readings: 2 of 3
```

**Business and friendship render an identical screen for this pair.** The
stricter `readings.size === 3` would fail today. The reason is instructive:
`position` is the field that varies most with lens (13/5/7) and 1d is the one
screen that does not render it.

**W3 — `mock.ts:75`, the viewer-self guard, is mutation-dead.** Deleting
`if (personId === room.viewer.id) return null;` leaves **8/8 unit and 16/16 e2e
green**, because `mockRankedRoom:86` already filters the viewer out of
`candidates` and `enterRoom` already excludes `me` from `others`. It is
line-covered but not behaviour-covered. Defence in depth is fine; `tasks.md` 7.1
presenting it as the load-bearing half of AC-PROF-2 is not, since no test
distinguishes it from the fallthrough.

**W4 — `mock.ts:74`'s not-`ranked` guard is uncovered, and U6/W2 is still open.**
v8 reports L74 as the only uncovered line in `mock.ts`; `mockRankedRoom` always
returns `"ranked"`. `mockNotConsented`/`mockBelowFloor` (`rank/mock.ts:136-140`)
remain referenced by nothing but their own return annotations, exactly as U6/W2
reported. U7 now depends on that dead status branch for its 404 story.

**W5 — the `<ul>` shared-chips branch is never rendered at any layer.** The e2e's
`SUBJECT = p-diego-morales` has **zero tag overlap with the viewer under all three
lenses** (tags are lens-independent), so `profile.spec.ts:81` only ever sees the
empty state — I confirmed the served page carries
`aria-label="Todavía no tienen nada en común"`. Four roster people *do* share tags
with Laura Méndez (`p-andres-gil`, `p-natalia-pena`, `p-santiago-luna`,
`p-valentina-cruz`); using one of them as a second subject would exercise the
list branch and cost two lines.

**W6 — AC-PROF-5's second scenario is untested and currently false: the primary
CTA on screen 1d lands on a 404.** I clicked it: `/profile/p-diego-morales` →
`/simulate/p-diego-morales` → "404 | This page could not be found." The lens
cookie survives, so the *lens* half is structurally satisfied, but "`/simulate/{P.id}`
renders under the business lens" cannot be true until U9 lands. The e2e asserts
the `href` and never follows it. Expected given U9's dependency — but it is a live
demo hazard and belongs in the plan, not only in a verifier's report.

**W7 — AC-PORT-2's "the viewer never comes from the URL" has no test on
`/profile`.** I verified the property (finding: `?viewer=`/`?subject=` are inert
at the byte level), but no assertion in the repository defends it on this screen —
unlike `/rank`, where `rank.spec.ts` guards `?subject=`.

**W8 — three new components at 0% unit coverage, and R15's harness gap is now
wider.** `avatar-stage.tsx`, `profile-card.tsx` and `tag-chips.tsx` are reachable
only through Playwright, and only along the one path the fixture walks. U6's
report asked for the jsdom decision to be made "before U7 inherits it". U7
inherited it and added three more files to the far side of it.

**W9 — the working tree diverged from `8a97665` mid-verification, and the change
in flight contradicts AC-PROF-3.** After my last probe the tree acquired
`src/components/profile/standing-pill.tsx` (untracked) plus modifications to
`page.tsx`, `avatar-stage.tsx`, `profile-card.tsx`, `e2e/profile.spec.ts`
(the CTA name moved from `/simular una vida/i` to `/simular vida/i`) and
`tasks.md` (a new row R17). The new component's own docblock says it renders
"the position … as one pill", and AC-PROF-3 states the page "MUST NOT render a
score, percentage, **rank index**". **None of my evidence covers that code**, and
the e2e I re-ran would already fail against it on the renamed CTA. This section's
verdict applies to `8a97665` and to nothing else; the redesign needs its own
verify pass, and R17 needs to argue the AC-PROF-3 tension explicitly rather than
by reference.

### SUGGESTION

**S1 — "one source, one answer" is a per-request property, not a structural one.**
See finding 8. `band` and `friction` are functions of `others.length`, and
`page.tsx` rebuilds the entire `RankedRoom` on every profile request to read one
row out of it. Unreachable while the roster is a constant; a one-line note in
`mock.ts` saying "same roster ⇒ same answer" would keep the claim accurate when
`roster.ts` becomes DB-backed.

**S2 — R10's "delete one file and one import" is weaker for 1d than for 1c.**
`ports/profile.ts` declares `ProfilePort.byId(personId, viewerId, lens)`;
`mockProfile(personId, room, candidates)` has a different shape, and `page.tsx`
also builds `candidates` and calls `mockRankedRoom`. The #10 swap will
restructure this page, not merely delete an import. Worth saying so in the
docblock so the expectation is right when it happens.

**S3 — add `expect(current.entries).toHaveLength(7)` before the three loop-only
unit tests.** They are not vacuous today, but their protection against an empty
`entries` comes from two *other* tests. Make it local.

**S4 — the RSC flight response for a `notFound()` page returns HTTP 200.** Both
suppression causes share it and I verified the payloads are identical modulo the
React key nonce, so it is **not** an oracle — but `profile.spec.ts:46`'s
`status() === 404` covers only the document navigation. Worth knowing before
someone reasons about the prefetch path.

**S5 — U6/S3 is still unfixed.** Phase 10's "these five modules must be absent"
still fails on `main` itself (`score-participant.ts` and `latent-repository.ts`
landed in PR #37). It holds for U7's diff — nothing forbidden was created — but
the wording should become "not created or edited **by this change**" before U9
runs it.

**S6 — `PersonProfile.team` is newly rendered on 1d and no AC covers it.** It is
public roster data already shown on screen 1a, so there is no leak. Noting it
because nothing asserts it either way.

---

## Verdict

**FAIL** — on coverage and disclosure, not on behaviour. Same posture as U6, and
for one of the same reasons.

**Everything that runs, runs green, and I re-executed all of it**: `pnpm run
verify` 186/186 (21 skipped), `profile.spec.ts` 16/16 across both viewports, a
database-free production build emitting 14 routes, and the full e2e suite at
124 passed with all 26 failures confirmed pre-existing and DB-bound.

**Every safety property I attacked held, several more firmly than the suite
proves.** The 404 is genuinely not an oracle — identical status, identical
headers, and byte-identical bodies and flight payloads once you remove the URL
the requester supplied and Next's own nonce. The other person's private
interests genuinely never ship: none of the five non-shared tags appears in the
HTML or the RSC payload, and no third party's name appears at all. No request
carries the viewer's id. The reduced-motion guard is genuinely time-invariant
now — 1 animation at seven sample points from 0 to 5 s, 0 at all seven under
`reduce` — which properly closes U6's W3. And all three claimed mutation probes
reproduce verbatim; the tag probe is the one that matters and it is live.

**The blockers are four, and two of them are things U6's report already asked
for.** C1: the empty-tags assertion cannot fail, and I proved it by shipping the
exact bare row the spec forbids past a green suite. C2: the photoless placeholder
still cannot render, one screen after the same defect was found and the one-line
fix was named. C3: consent-invariance has no test and, unlike R16's substitution,
no row admitting why. C4: U7 has no `apply-progress` batch at all.

The pattern worth naming is not any single gap — it is that **R16 did the right
thing and then the same commit did the wrong thing twice**. R16 shows this author
knows how to record a substitution honestly. 7.3 and 7.6 then dropped clauses
without that treatment. The fix for C3 and W1 is probably not more tests; it is
two more rows written the way R16 was written.

**Recommended next**: `sdd-apply` for C1, C2, C4 and the R16/W1 disclosure rows,
then re-verify — **against whatever the in-flight redesign (W9) settles into, not
against `8a97665`**. Do not archive.

# Verification Report — UI Flow Screens, work unit U9 (`/simulate/[id]`, screen 1f)

**Change**: `ui-flow-screens` · work unit **U9 only**
**Commit**: `4f9d094` on `feat/ui-flow-u9-simulate`, stacked on `feat/ui-flow-u7-profile`
**Diff under review**: `git diff feat/ui-flow-u7-profile...HEAD` — 12 files, 1,445 insertions / 61 deletions
**Mode**: Strict TDD (`pnpm run test`, vitest 4.1.11, `environment: "node"`)
**Artifact store**: hybrid; file twins authoritative
**Scope note**: U1, U2, U3, U6, U7 were NOT re-verified. Where U9 inherits a
prior finding it is named, not restated.

The working tree was clean at `4f9d094` when this run started and clean at
`4f9d094` when it ended. Every mutation below was applied from a `/tmp` backup
and restored, with `git status --porcelain` empty after each. R19 honoured.

## Completeness

| Metric | Value |
|--------|-------|
| U9 tasks (9.0–9.10) | 11 |
| U9 tasks complete | 11 |
| U9 tasks incomplete | 0 |
| Phase 10 tasks (10.1–10.8) | 8 |
| Phase 10 marked complete in `tasks.md` | **0 — all still `[ ]`** |
| Phase 10 actually passing when re-run here | **8 of 8** |

9.11 and 9.12 are narrative subsections, not checkboxes; `apply-progress.md`
Batch 8's "11/11 tasks" is consistent with 9.0–9.10.

## Diff scope (verified, not assumed)

| File | Status | Changed |
|---|---|---|
| `src/app/simulate/[id]/page.tsx` | added | 138 |
| `src/components/simulate/mock.ts` | added | 240 |
| `src/components/simulate/mock.test.ts` | added | 206 |
| `src/components/simulate/timeline-rail.tsx` | added | 103 |
| `src/components/simulate/event-card.tsx` | added | 68 |
| `src/components/simulate/ending-card.tsx` | added | 65 |
| `src/components/simulate/timeline-path.tsx` | added | 61 |
| `src/components/simulate/walking-pair.tsx` | added | 24 |
| `e2e/simulate.spec.ts` | added | 309 |
| `e2e/profile.spec.ts` | modified | 31 |
| `openspec/.../apply-progress.md` | modified | 85 |
| `openspec/.../tasks.md` | modified | 176 |

**Zero files touched under `src/lib/**`.** The `e2e/profile.spec.ts` edit is a
disclosed flake fix (two single samples became `expect.poll`) that strengthens
both assertions; it is recorded in 9.11 and Batch 8, so it is not a silent edit
to another unit's suite.

## Build & Tests Execution

**`pnpm run verify`**: ✅ green
```text
next typegen && tsc --noEmit   -> clean
biome check .                  -> 229 files, no fixes applied
vitest run                     -> 40 files | 222 passed | 16 skipped (238)
```
Matches Batch 8's claim of 222/16 exactly.

**`pnpm exec playwright test simulate.spec.ts`**: ✅ **26 passed** across
`[mobile]` and `[desktop]`. Matches task 9.10's claim.

**Flakiness — five consecutive parallel runs, `test-results` cleared between each:**
```text
pnpm exec playwright test rank.spec.ts profile.spec.ts simulate.spec.ts demo-path.spec.ts
run 1  110 passed |  8 skipped (23.7s)
run 2  110 passed |  8 skipped (23.3s)
run 3  110 passed |  8 skipped (23.0s)
run 4  110 passed |  8 skipped (24.0s)
run 5  110 passed |  8 skipped (26.6s)
```
**Zero flakes in 550 test executions.** Batch 8's "six consecutive clean parallel
runs, 110/110" is independently corroborated. `quiz.spec.ts` and
`intake-declared.spec.ts` were not run; they need `DATABASE_URL` and U9's diff
touches nothing they reach (confirmed against the file list above).

**`env -u DATABASE_URL pnpm run build`**: ✅ green. 11 routes,
`ƒ /simulate/[id]` server-rendered on demand, 11/11 static pages generated. No
database connection is opened (AC-PORT-9).

**Coverage**: ➖ Not applicable by project decision. `vitest.config.mts` sets
`coverage.include: ["src/lib/**"]` ("Only the engine is worth a coverage number.
UI coverage from unit tests would be a vanity metric here"), and U9 touched no
file under `src/lib/**`. The changed-file coverage table is therefore empty for
structural reasons, not because a tool is missing.

## Spec Compliance Matrix

### simulated-life-screen

| Requirement | Scenario | Covering test | Result |
|---|---|---|---|
| Scoped to the viewer's ranking | AC-SIM-1 · a ranked pair simulates | `simulate.spec.ts:46` | ✅ COMPLIANT |
| | AC-SIM-2 · unranked person 404s | `simulate.spec.ts:59` (unknown id only) | ⚠️ PARTIAL |
| | AC-SIM-2 · simulating yourself 404s | `simulate.spec.ts:59` | ✅ COMPLIANT |
| Header reads the horizon it was given | AC-SIM-3 · the horizon is data | `simulate.spec.ts:71` | ❌ **PARTIAL/DEAD** (C1) |
| | AC-SIM-3 · no literal horizon in the tree | `simulate.spec.ts:88` | ❌ **PARTIAL/DEAD** (C1) |
| Friendship has no horizon | AC-SIM-4 · no pill under friendship | `simulate.spec.ts:103` | ✅ COMPLIANT |
| | AC-SIM-4 · the union is enforced by the type | `domain/reveal/timeline.test.ts:58,68` | ✅ COMPLIANT |
| Exactly one tag from the seven | AC-SIM-5 · 16 kinds render tagged | `simulate.spec.ts:115` | ⚠️ PARTIAL (W2) |
| | AC-SIM-5 · year order | `simulate.spec.ts:211` | ✅ COMPLIANT |
| | AC-SIM-5 · bands and tags share no token | `simulate.spec.ts:180` | ⚠️ PARTIAL (W1) |
| Ending card states the ending | AC-SIM-6 · a dissolution ending | (none — branch never renders) | ❌ **UNTESTED** (C2) |
| | AC-SIM-6 · together at the horizon | `simulate.spec.ts:219`, does not distinguish | ⚠️ PARTIAL (C2) |
| | AC-SIM-6 · an epilogue follows the ending | (none — never renders) | ❌ **UNTESTED** (C2) |
| | AC-SIM-6 · no probability or `%` | `simulate.spec.ts:227-229` | ✅ COMPLIANT |
| Path behind a two-prop contract | AC-SIM-7 · a third prop fails `tsc` | (no probe in the tree) | ❌ **UNTESTED** (W4) |
| | AC-SIM-7 · the pair advances with progress | `simulate.spec.ts:232` | ✅ COMPLIANT |
| | AC-SIM-7 · motion stops under `reduce` | `simulate.spec.ts:283` | ⚠️ PARTIAL (W3) |
| Meet CTA renders and mutates nothing | AC-SIM-8 · present and focusable | `simulate.spec.ts:249-254` | ✅ COMPLIANT |
| | AC-SIM-8 · activating it is inert | `simulate.spec.ts:256-263` | ⚠️ PARTIAL (W5) |
| Nothing offspring-shaped, consent-invariant | AC-SIM-9 · consent-invariant output | (none) | ❌ **UNTESTED** (C3) |
| | AC-SIM-9 · no offspring accessible name | `simulate.spec.ts:266` | ✅ COMPLIANT |

### ui-read-ports (only what bears on U9)

| Scenario | Covering test | Result |
|---|---|---|
| AC-PORT-1 · impersonation cookie resolves the viewer | `simulate.spec.ts:46` + `:59` (self-404) | ✅ COMPLIANT |
| AC-PORT-3 · no score in the type | `domain/reveal/timeline.test.ts:87` (`@ts-expect-error` on `sim: 0.82`) | ✅ COMPLIANT |
| AC-PORT-3 · no score in the DOM | `simulate.spec.ts:227` + flight-payload walk below | ✅ COMPLIANT |
| AC-PORT-7 · `tagFor` total over 16 kinds | `event-tag.test.ts` (U2, unchanged) | ✅ COMPLIANT |
| AC-PORT-8 · the gate is mutual / romantic-only | `offspring.test.ts` (U2, unchanged) | ✅ COMPLIANT |
| AC-PORT-8 · the UI cannot leak consent | (none) | ❌ **UNTESTED** (C3) |
| AC-PORT-9 · no connection opened | `env -u DATABASE_URL pnpm run build` | ✅ COMPLIANT |
| AC-PORT-9 · the hexagon rule holds | grep, re-run here | ✅ COMPLIANT |

**Compliance summary**: 13 COMPLIANT / 6 PARTIAL / 5 UNTESTED across 24 scenarios.

## Adversarial findings — the nine pressure points

### 1. AC-SIM-5's "exactly one chip" — can a card render two, or zero?

**Yes for two, if the second is not a `<span>`.** The filter is
`[...card.querySelectorAll("span")].filter(painted)`.

| Mutation on `event-card.tsx` | Result |
|---|---|
| a second `<span>` chip painted from `TAG_TONE[tag.token]` | ❌ fails — `Expected 1, Received 2` |
| the chip's tone class replaced with `""` (untagged) | ❌ fails — `Expected 1, Received 0` |
| a second **`<div>`** chip painted from `TAG_TONE.roce` | ✅ **PASSES — two visible chips on every card, suite green** |

So the assertion is live in both directions for span-shaped chips and blind to
any other element. "Exactly one chip" is implemented as "exactly one painted
`<span>`". Low risk today — `EventCard` is 68 lines and structurally renders one
chip — but the assertion is narrower than the words it carries. (W2)

### 2. The band/tag token collision — is the source grep actually sufficient?

**No, and I broke it.** `--band-high` and `--tag-ritual` are both `#fbe3de`
(`globals.css:174,188`), so the runtime colour comparison is provably blind for
that family. The author knows this and says so; the grep at
`simulate.spec.ts:180` is the compensating control.

First, the author's own probe reproduces verbatim:

| Mutation | Observed |
|---|---|
| `roce: "bg-band-high text-band-high-foreground"` inside `event-card.tsx` | ❌ grep fails, `offenders: ["event-card.tsx"]`; the **colour test stayed green**, exactly as 9.12 claims |

Then the bypass. The guard is
`for (const file of readdirSync("src/components/simulate")) { if (!file.endsWith(".tsx")) continue; ... }`.
**It reads `.tsx` only, in one directory.** I moved the same violation one file
sideways:

```ts
// event-tag.ts  — a .ts file, in the SAME directory
export const ROCE_TONE = "bg-band-high text-band-high-foreground";
// event-card.tsx
roce: ROCE_TONE,
```

**All six AC-SIM-5 tests passed.** The `roce` chip was painted from a rank-band
token and neither the colour assertion (blind by construction) nor the grep
(wrong file extension) noticed.

This is not a contrived escape route. `event-tag.ts` is the file that already
owns the token vocabulary — `TAG_TOKENS`, `TagToken`, `TimelineTag`, `TAGS` — so
a class map is the single most likely thing to be moved there. The same hole
covers `src/components/shared/**` and any class string imported from
`components/rank/**`. (W1)

The narrowing itself is right: the pattern
`/\b(?:bg|text|border|ring)-band-|var\(--band-/` correctly ignores the docblock
in `event-card.tsx` that explains the rule. It is the file filter that leaks.

### 3. AC-SIM-4 / the union — can `horizonYears` be read off a friendship at runtime?

**No, and the probes are live — verified today, not taken on trust.** I added
`readonly horizonYears: number` to `FriendshipTimeline` and ran `tsc`:

```text
src/lib/domain/reveal/timeline.test.ts(60,7): error TS2578: Unused '@ts-expect-error' directive.
src/lib/domain/reveal/timeline.test.ts(70,7): error TS2578: Unused '@ts-expect-error' directive.
src/lib/domain/reveal/timeline.test.ts(38,7): error TS2741: Property 'horizonYears' is missing ...
src/components/simulate/mock.ts(223,5): error TS2322: Type '{ lens: "friendship"; ... }' is not assignable to 'SimulatedLife | null'
```

Four independent gates, including `mockSimulatedLife` itself refusing to
compile. `timeline-rail.tsx:51` narrows on `life.lens === "friendship"` before
reading `horizonYears`, so no component reads it unguarded. AC-SIM-4 is the
best-defended criterion in the unit.

One caveat on the *runtime* half. 9.12's first probe reproduces verbatim
(`Expected 0, Received 1` at `simulate.spec.ts:107`) — but only because I
hardcoded a numeric horizon alongside it. If the horizon leaked as `undefined`
the pill would read `"Año 1 de "`, which does not match `/Año \d+ de \d+/` and
the e2e would pass. The type is the real gate here; the e2e is corroboration.

### 4. AC-SIM-8 / inertness — would it catch a Server Action, a beacon, a GET?

**Server Action: yes, proven.** I wrapped the CTA in
`<form action={async () => { "use server"; }}>` with `type="submit"`:

```text
- Expected  - Array []
+ Received  + Array ["http://localhost:3000/simulate/p-diego-morales"]
```

**`navigator.sendBeacon`: yes, proven.** A throwaway probe spec (created, run,
deleted) confirmed the exact listener shape observes both:

```text
CAPTURED: ["POST http://localhost:3000/probe-beacon","POST http://localhost:3000/probe-fetch"]
```

**Three residual holes, none of them exercised today:**

1. **GET is explicitly excluded.** `if (request.method() !== "GET")`. A
   side-effecting `fetch("/api/propose?other=…")` sails through. Unconventional,
   but the spec says "MUST NOT write anything", not "MUST NOT POST".
2. **The window is 400 ms.** A beacon fired on `pagehide`/`visibilitychange` —
   which is the *idiomatic* use of `sendBeacon` — fires after the test ends.
3. **The scenario's second clause is not asserted at all.** AC-SIM-8 says "no
   network mutation is issued **and the fixture state is unchanged**". Only the
   first half has an assertion.

The static structure is far stronger than the test: `page.tsx` has no
`"use client"`, the button is `type="button"`, there is no form, no handler and
no client boundary anywhere near it. The property holds. The guard against it
regressing is narrower than the property. (W5)

### 5. AC-PORT-3 — does any number that is or implies a score reach the client?

**No.** I fetched the rendered `/simulate/p-diego-morales` and walked the RSC
flight payload directly:

```text
keys matching rank|sim|score|position|band|bond|friction|contribution|
             shortfall|probability|survival|consent|latent|posterior   -> 0 hits
roster names other than the two people involved                        -> 0 hits
p-* ids present                          -> exactly p-laura-mendez, p-diego-morales
```

`TimelineRail` is a client component, so the whole `SimulatedLife` crosses the
boundary — and `SimulatedLife` carries `subject`, `other`, `events`,
`horizonYears`, `ending` and nothing else. The 17-entry `RankedRoom` is built on
the server, read for one row, and never serialised.

The only `%` in the document are CSS gradient stops and
`backgroundPosition: "center 74%"` inside `VenueFloor`'s inline styles. They are
attribute values, not text, so `main.innerText()` does not see them and
`simulate.spec.ts:228` produces no false positive.

**One near-miss worth recording as an invariant.** `horizonYears` is seeded from
`hash("life:{lens}:{viewer}:{other}")` while the ranking order is seeded from
`hash("{lens}:{viewer}:{other}")`. Different prefixes, so the horizon is
uncorrelated with position. Had both used one seed, `horizonYears` would have
been a monotone function of affinity — a rank oracle rendered in 18-point type at
the top of the screen. Nothing in the code says this must stay true. (S5)

### 6. AC-SIM-2 / the 404 oracle — same rigour as U7

**It holds, at the byte level.** Three requests with viewer `p-laura-mendez`:

| Request | Status | Bytes |
|---|---|---|
| `/simulate/p-nobody-at-all` (unknown, 15 chars) | 404 | 18,601 |
| `/simulate/p-zzz-not-real` (unknown, 14 chars) | 404 | 18,599 |
| `/simulate/p-laura-mendez` (self, 14 chars) | 404 | 18,599 |

Headers are identical. Bodies are **byte-identical, zero residual diff lines**,
once the requester's own URL segment and Next's dev nonce / `_rsc` token are
normalised — and a same-length unknown id produces the identical byte count with
no normalisation at all. Neither 404 contains a roster name, a lens, or anything
the requester did not supply.

**The third case has no subject, and this is not recorded anywhere.**
`mockSimulatedLife` has four `null` paths; `page.tsx` can only reach two of them:

| Path | Reachable from `page.tsx`? |
|---|---|
| `room.status !== "ranked"` | **No** — `mockRankedRoom` always returns `"ranked"` |
| `otherId === room.viewer.id` | Yes (self) |
| not in `room.entries` | Yes, but only via an unknown id |
| not in `candidates` | Same condition — one array feeds both |

`mockRankedRoom` ranks **every** candidate it is handed, and `page.tsx` passes
the same array to both functions, so "a below-floor person", "a gate-failed
pair" and "a person who has not consented to the lens" — three of the spec's
four indistinguishable cases — cannot exist. R15 records this class of gap for
1c and R16 for 1d. Nothing records it for 1f. (W6)

### 7. Flakiness — is the "six consecutive clean runs" claim real?

**Yes.** Five further parallel runs of the same four specs, `test-results`
cleared between each, produced 110 passed / 8 skipped every time — 550 clean
test executions, zero retries, zero flaky annotations.

**But the reduced-motion guard is not deterministic, and the bug it guards is the
one 9.11 is about.** I reintroduced `transition-[left] duration-500` on
`TimelinePath`'s wrapper — the exact regression — and ran the guard four times:

| Attempt | mobile | desktop |
|---|---|---|
| 1 | ❌ caught (`Expected 0, Received 1`) | ✅ **missed** |
| 2 | ❌ caught | ❌ caught |
| 3 | ❌ caught | ❌ caught |
| 4 | ❌ caught | ❌ caught |

**7 of 8 project-runs.** The "is stopped" half is deliberately unpolled, for a
reason I agree with — polling for zero waits for a page to go quiet and calls
that a pass. But that leaves the sample racing the scroll settling, which is
precisely the intermittency 9.11 diagnosed. The fix removed the bug; the guard
against its return still has the property that produced the original 4-in-5
failure. The deterministic form is not polling — it is forcing a `left` change
(one `scrollLeft` write) before sampling. (W3)

The fix itself is correct and the reasoning in `timeline-path.tsx:33-47` is
right: a CSS transition is an entry in `getAnimations()`, `globals.css`'s block
matches `[style*="animation"]` plus seven class names, and that wrapper carries
none of them.

### 8. Task honesty — are 9.0–9.12 complete as claimed?

**Yes. Every claim I could falsify reproduced.** This is the cleanest task ledger
of the three units — no 6.4/6.6-shaped overstatement.

| Task | Claim | Verified |
|---|---|---|
| 9.0 | `mockSimulatedLife(otherId, room, candidates)`, deliberately not `TimelinePort`-shaped; RED was 6 assertion failures against a Fake-It `null` | ✅ **exact** — see below |
| 9.1 | 16 kinds each, horizons in 8–14 / 5–10, events inside horizon, both endings + both epilogue states in one roster | ✅ asserted in `mock.test.ts:83,114,144`, all green |
| 9.2 | Server Component, viewer from the impersonation cookie, one `notFound()` | ✅ `page.tsx:31-57` |
| 9.3 | exactly one chip via `tagFor(kind)`, per-item `pop-in` delay inline | ✅ |
| 9.4 | the only client island; `useDragScroll({initial:"center"})`; one number | ✅ `timeline-rail.tsx` is the only `"use client"` in the tree |
| 9.5 | pill from data, narrowed by the union, source grep | ⚠️ built as claimed; the **grep is dead for any literal but `12`** (C1) |
| 9.6 | props are exactly `{events, progress}` | ✅ property holds (TS2322 on a third prop) — but no probe defends it (W4) |
| 9.7 | two branches, never three | ✅ `ending-card.tsx` has no `"open"` case |
| 9.8 | `<button type="button">`, e2e listens for non-GET | ✅ |
| 9.9 | `offspringVisible` imported nowhere outside its own module | ✅ `rg` returns only `offspring.ts` and `offspring.test.ts` |
| 9.10 | 26/26 across both viewports | ✅ re-run here |
| 9.12 | both probes | ✅ **both reproduce verbatim** |

The Fake-It claim is worth reproducing exactly, because it is precise and it is
also the finding. `mockSimulatedLife` reduced to `return null`:

```text
Tests  6 failed | 6 passed (12)
```

Six, as claimed. **And six of the twelve properties survive an implementation
that returns nothing at all** — see C4.

### 9. Strict TDD — real RED-before-GREEN, and were the probes live?

**Evidence is present, reproducible, and not table-shaped.**

The branch is one squashed commit (`4f9d094`), so RED **ordering** cannot be
reconstructed from history for 9.0 or 9.1. What can be checked is the RED
*signature*, and it matches to the test: the claimed "6 assertion failures
against a Fake-It `null`" reproduces as exactly `6 failed | 6 passed`, with the
six failures being the six properties that are not vacuous.

Both mutation probes in 9.12 reproduce verbatim (findings 2 and 3), and I proved
two more of the unit's guards live that the report does not claim (the chip count
in both directions, the Server Action). That is a stronger probe record than
either prior unit.

`apply-progress.md` Batch 8 carries **no TDD Cycle Evidence table** —
no RED/GREEN/TRIANGULATE/SAFETY-NET columns, no Files Changed table. The strict
TDD verify module prescribes CRITICAL for a missing table. **I am filing it
WARNING (W8), and saying why**: the substance is present in prose across Batch 8
and `tasks.md` 9.0–9.12, the one falsifiable RED claim reproduces exactly, and
this is the fourth consecutive batch in the same format (U6 was flagged for the
same deviation as W5). It is a reporting-format failure, not a protocol failure.
The orchestrator can escalate it if consistency with the module matters more than
the substance.

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | ⚠️ | Present in prose; canonical table absent (W8) |
| All tasks have tests | ⚠️ | 9.0–9.5, 9.7–9.10 covered; **9.6's type contract has no probe** (W4) |
| RED confirmed | ✅ | Fake-It signature reproduced exactly: `6 failed | 6 passed` |
| GREEN confirmed | ✅ | 222/16 unit, 26/26 e2e, re-executed here |
| Triangulation adequate | ⚠️ | 12 unit + 13 e2e cases; **AC-SIM-6's `apart` branch has no case at all** (C2) |
| Safety net for modified files | ✅ | `e2e/profile.spec.ts` is the only modified file; 8/8 before and after, and the change strengthens both assertions |
| Probes proven live | ✅ | 2/2 claimed reproduce; 4 further guards proven live here; **2 guards proven DEAD** (C1, W1) |

**TDD compliance**: 4 of 7 clean, 3 qualified.

## Test Layer Distribution

| Layer | Tests | Files | Tool |
|---|---|---|---|
| Unit (node) | 12 | 1 (`mock.test.ts`) | vitest |
| Component / integration | **0** | 0 | none — `environment: "node"`, no jsdom (R15) |
| E2E (browser) | 11 × 2 projects = 22 | 1 (`simulate.spec.ts`) | Playwright |
| E2E (node-layer source greps) | 2 × 2 = 4 | same file | Playwright as a runner |
| **Total for U9** | **38 executions** | **2** | |

Five new `.tsx` components — `event-card`, `ending-card`, `timeline-path`,
`walking-pair`, `timeline-rail` — sit at 0% unit coverage and are reachable only
through the single fixture path Playwright walks. R15's harness gap now covers
eight component files across 1c/1d/1f. (S3)

## Assertion Quality

| File | Test | Issue | Severity |
|---|---|---|---|
| `mock.test.ts:94` | "resolves every event to exactly one of the seven tokens" | **Ghost loop** — `for (const event of found?.events ?? [])` with no count guard. Zero iterations, zero assertions, green | CRITICAL |
| `mock.test.ts:179` | "narrates in neutral Spanish" | **Ghost loop** — same shape, same `?? []` | CRITICAL |
| `mock.test.ts:165` | "carries nothing offspring-shaped and no score" | `JSON.stringify(null) === "null"` matches none of the forbidden patterns. **A safety assertion (AC-PORT-8, AC-PORT-3) that passes on absent data** | CRITICAL |
| `mock.test.ts:103` | "sorts events ascending by year, always" | `expect([]).toEqual([])` when the life is null | WARNING |
| `mock.test.ts:192` | "is deterministic across calls" | `null` equals `null` | WARNING |
| `simulate.spec.ts:211` | "cards appear in ascending year order" | No card-count guard of its own; vacuous on an empty page. Companioned by `:119`'s `toBe(16)` in a sibling test | WARNING |

**Not flagged, on evidence**: the two `expect(offenders).toEqual([])` empty-array
assertions at `simulate.spec.ts:100` and `:208` look like orphan empty checks,
but I proved both fire under mutation. Their defect is scope, not vacuity — filed
as C1 and W1.

**Praised, because it is the correct pattern and it is right there in the same
file**: `simulate.spec.ts:163` asserts `cardChips.length === 16` *before*
iterating, so the AC-SIM-5 loop cannot be a ghost loop. The e2e author knew to do
this; the unit author did not.

**Assertion quality**: 3 CRITICAL, 3 WARNING.

## Quality Metrics

**Linter**: ✅ biome clean over 229 files.
**Type checker**: ✅ `next typegen && tsc --noEmit` clean.
**`Record<string, string>`**: ⚠️ `event-card.tsx:6` types `TAG_TONE` as
`Record<string, string>` rather than `Record<TagToken, string>`, and
`noUncheckedIndexedAccess` is off. An eighth `TAG_TOKENS` member would compile
and render an unpainted chip. Contained by the runtime chip count, which I proved
fires (`Expected 1, Received 0`). (W7)

## Correctness (static evidence)

| Requirement | Status | Note |
|---|---|---|
| Viewer from cookies, never the URL | ✅ | `page.tsx:38`; the segment is only ever `otherId` |
| One `notFound()`, not three | ✅ | `page.tsx:57` |
| Lens checked before any data call | ✅ | `page.tsx:33-35`, returns before `enterRoom` |
| `SimulatedLife` is a lens-discriminated union | ✅ | Four compile gates, proven live |
| `Ending` has two variants, no `"open"` | ✅ | `ending-card.tsx` writes no third case |
| Exactly one chip, via `tagFor` | ✅ | one `<span>`, no local kind lookup |
| `TimelinePath` props are `{events, progress}` | ✅ | third prop ⇒ TS2322, proven |
| Nothing offspring-shaped | ✅ | `offspringVisible` unreferenced; `SimulatedLife` has no offspring field |
| CTA is inert | ✅ | Server Component, `type="button"`, no handler, no form |
| Render is consent-invariant | ✅ | **no consent field exists anywhere on 1f's data path** — `RankCandidate` is `{id,name,photoUrl,team?}`, `SimulatedLife` has none. Property holds by construction; nothing tests it (C3) |

## Coherence (design + reconciliation rows)

| Row | Followed? | Note |
|---|---|---|
| R3 — design's kind→token map | ✅ | `exit`→`mudanza`, `decision`→`roce`, `epilogue`→`ritual`, `vignette`→`viaje`. Exact |
| R4 — union on lens, `Ending` union | ✅ | Built as decided; the spec's nullable `dissolution`/`epilogue` shape is absent |
| R8 — assert the TOKEN, never the label | ✅ | `simulate.spec.ts:8-13` states it and the assertions honour it |
| R10 — colocated `mock.ts`, no port, no composition entry | ✅ | No `TimelinePort` implementation, no `composition.ts` edit. Correctly not reported as a defect |
| R11 — viewer via `enterRoom` + impersonation cookie | ✅ | Identical to `RoomPage` |
| R15 — `environment: "node"`, no component branch unit-testable | ✅ inherited | Five more files added to the far side of it (S3) |
| 9.6 — "no sibling reads layout geometry" | ⚠️ | `timeline-rail.tsx:64-77`'s `onScroll` reads `scrollWidth`, `scrollLeft` and `children.length`. That is the *parent* measuring its own scroller and passing a normalised scalar down, and the docblock argues it explicitly. The design intent (1e is a one-file swap) is preserved; the spec's literal wording is not (S1) |
| 10.8 — every `mock.ts` names the issue that deletes it | ✅ | `mock.ts:13` names #33 |
| Phase 10 (10.1–10.8) | ✅ all eight re-run and passing | but all eight still `[ ]` in `tasks.md` (W8) |

Phase 10 results in full: no `getDb` / `adapters/db/**` / `drizzle-orm` under
`src/app/**` or `src/components/**` (only `adapters/http/session`, in six files —
`tasks.md` still says seven, S4); `excludedFromRoom` unreachable; none of the
protected modules in the diff; `globals.css` and `components/ui/**` untouched;
all eight contract files present; `domain/reveal/index.ts` exports only types.

## Issues Found

### CRITICAL

**C1 — a hardcoded horizon passes the whole green suite. Both AC-SIM-3 guards are
mutation-dead for every literal but `12`.** The requirement is unambiguous: "A
literal year count MUST NOT be hardcoded anywhere in the component tree."

I replaced `de {life.horizonYears}` with `de 11` in `timeline-rail.tsx:54` and
ran both AC-SIM-3 tests: **4 passed.**

Neither half can see it. The runtime test asserts only
`8 <= horizon <= 14` — the whole romantic range — so any hardcoded value in that
range is indistinguishable from data. The source grep is
`/de\s*\{?\s*12\b|horizonYears\s*[=:]\s*\d+/`: the first alternative is pinned to
the single literal `12`, and the second requires a digit immediately after `=` or
`:`, which `horizonYears={life.horizonYears}` never produces.

The guard *is* live for `12` — I confirmed `de 12` fails with
`offenders: ["timeline-rail.tsx"]` — which is exactly what makes this dangerous:
it looks proven. This is U7's C1 in a new place, and it is the same
demonstration: **a violation of the spec's own words shipped past a green suite.**

Cheapest honest close: assert the pill's denominator equals the horizon the
fixture returned for that pair, or widen the grep to
`/\bde\s+\d+\b/` over the JSX text.

**C2 — the ending card's `apart` branch and the epilogue are rendered by no test
at any layer, and the AC-SIM-6 e2e passes on the wrong branch.** Third occurrence
of the U6-C2 / U7-C2 defect class.

The e2e visits exactly one pair, `p-diego-morales`, as `p-laura-mendez`. I
fetched both paired lenses and both render the **`together`** branch:

```text
romantic: "hasta donde alcanza esta simulación, siguen ahí."
business: "hasta donde alcanza esta simulación, siguen ahí."
```

`simulate.spec.ts:225` asserts `toContainText(/año \d+/i)`, which the `together`
copy — "Llegan juntos al año 12." — satisfies just as well as the `apart` copy.
So the test named for AC-SIM-6's dissolution scenario cannot tell the two
branches apart, and `ending-card.tsx:48-57` — the dissolution line **and** the
epilogue paragraph — is code nobody has ever seen run.

`mock.test.ts:144` proves both outcomes exist **in the data**. Nothing proves the
component renders them. That distinction is the whole of C2, and it is exactly
what 9.1's own rationale says it exists to prevent: *"a probabilistic split would
ship one branch of the ending card rendered by nothing, which is the exact defect
the 1c and 1d verifies found."* The fixture did its job; the e2e did not use it.

**The branch is one URL away.** For the e2e's existing viewer under `romantic`,
7 of 17 pairs are `apart` and 5 carry an epilogue. Verified live:
`/simulate/p-fernanda-lopez` renders "Se separan en el año …" **and** "Un año
después, la conversación vuelve por su cuenta." and does not render "Llegan
juntos". One extra `open()` covers both missing scenarios.

**C3 — AC-SIM-9 / AC-PORT-8's consent-invariance scenario has no test and no
reconciliation row. This is U7's C3, verbatim, one unit later.** The spec wants
two fixture pairs identical except the other person's `consent.romantic`,
rendered and compared. No such comparison exists.
`simulate.spec.ts:266` iterates three *lenses* over one person and checks for
offspring-shaped words — which is the offspring half of the requirement, not the
invariance half, and the test's name honestly says so.

The property **is** true and unbreakable by construction: no consent field exists
anywhere on 1f's data path (`RankCandidate` is `{id, name, photoUrl, team?}`;
`SimulatedLife` has none), so the render cannot vary with it. That makes this a
disclosure failure, not a behaviour failure — and U7's C3 was closed by writing a
test that asserts *what is true* plus a row saying it must be REPLACED when #10
lands. U9 did neither. R15 and R16 exist because this author knows how to record
a substitution honestly; the third instance got no row at all.

**C4 — six of `mock.test.ts`'s twelve properties survive an implementation that
returns `null` for every input, and five of those six are vacuous.** Proven:

```text
mockSimulatedLife -> return null
✓ suppresses an unknown id, the viewer, and anyone unranked   (correct to pass)
× names both people, and never a third
× gives every one of the sixteen kinds a subject (AC-SIM-5)
✓ resolves every event to exactly one of the seven tokens     GHOST LOOP
✓ sorts events ascending by year, always                      [] === []
× keeps paired events inside the horizon it declared (AC-SIM-3)
× gives friendship no horizon KEY and no ending KEY (AC-SIM-4)
× makes both endings, and both epilogues, reachable in one roster
✓ carries nothing offspring-shaped and no score               JSON.stringify(null)
✓ narrates in neutral Spanish                                 GHOST LOOP
✓ is deterministic across calls                               null === null
× makes the lens change the life
Tests  6 failed | 6 passed (12)
```

The cause is one idiom repeated five times: `found?.events ?? []` and
`JSON.stringify(life(...))` with no guard that `life(...)` returned anything. The
loops iterate zero times; the safety assertion scans the four bytes `null`.

The most serious is `"carries nothing offspring-shaped and no score"` — it is the
unit-layer evidence for AC-PORT-8 and AC-PORT-3, and it passes on no data at all.

The remedy is one line each, and the correct pattern is already in this
repository: `simulate.spec.ts:163` asserts the collection length before
iterating. `mock.test.ts:83` does it too (`expect(kinds.length).toBe(16)`), which
is why that test correctly fails. Five of its siblings do not.

This also qualifies the RED claim. "6 assertion failures against a Fake-It
`null`" is arithmetically exact — and materially incomplete, because half the
file was green against a stub and the report does not say so.

### WARNING

**W1 — AC-SIM-5's band-token guard is bypassable by moving the violation into a
`.ts` file in the same directory.** Proven green with `roce` painted from
`bg-band-high`. See finding 2. The guard scans `*.tsx` under
`src/components/simulate` only; `event-tag.ts` — the file that already owns the
token vocabulary — is the most likely place for a class map to land, and it is
invisible. Also invisible: `src/components/shared/**` and anything imported from
`components/rank/**`. Not CRITICAL because the assertion *can* fail and the
property holds today; C1's cannot fail for the realistic case.

**W2 — "exactly one chip" is implemented as "exactly one painted `<span>`".** A
second `<div>` chip passes. See finding 1.

**W3 — the reduced-motion guard caught the reintroduced regression in 7 of 8
project-runs.** See finding 7. The unpolled sample is the right call; the missing
piece is a deterministic `left` change before it.

**W4 — AC-SIM-7's "a third prop fails `tsc`" has no probe in the tree.** I proved
the property holds — a third prop gives `TS2322` at `timeline-rail.tsx:59` — but
that is my mutation, not the suite's. `domain/reveal/timeline.test.ts` shows this
author knows how to pin a type contract with `@ts-expect-error`; the same pattern
applied to `TimelinePath` would be three lines. Today, widening the props to
`{events, progress, ...rest}` breaks nothing.

**W5 — AC-SIM-8's inertness guard excludes GET, closes after 400 ms, and never
asserts the scenario's "fixture state is unchanged" clause.** See finding 4. The
non-GET half is proven live for a Server Action, `sendBeacon` and `fetch`.

**W6 — three of AC-SIM-2's four indistinguishable causes have no subject, and no
row records it.** `mockRankedRoom` ranks every candidate; `page.tsx` feeds the
same array to both functions; `mock.ts:206`'s `status !== "ranked"` guard is dead
from the page. R15 records this class for 1c, R16 for 1d, nothing for 1f. See
finding 6.

**W7 — `TAG_TONE: Record<string, string>` defeats its own exhaustiveness story.**
`event-card.tsx:6`. The docblock says a seventeenth `EventKind` "fails
`pnpm run typecheck` right here" — true of `tagFor`'s `Record<EventKind, …>`, not
of this map. An eighth *token* compiles and renders nothing.
`Record<TagToken, string>` is the one-word fix.

**W8 — the plan's own ledger is behind the work.** All eight Phase 10 checkboxes
are still `[ ]` after the last unit, though I re-ran all eight and all eight
pass. And Batch 8 carries no TDD Cycle Evidence table — the fourth consecutive
batch in that format (U6/W5 flagged it, U7/C4 escalated it). The strict-TDD
module prescribes CRITICAL for the missing table; I am filing WARNING because the
substance is present and reproducible, and saying so explicitly rather than
silently downgrading.

**W9 — Review Workload Guard: U9's code slice is ~1,245 changed lines against a
~420 forecast and a 400-line budget.** `tasks.md:18` calls U9 "the only one at
the line"; it is roughly 3× over it. The plan's own warning that "forecasts here
read ~2.5× low" is the accurate one. Not a defect in the work — it is the last
unit and it is coherent — but the reviewer of this PR is being handed three
budgets' worth, and the guard exists to say so out loud.

**W10 — `simulate.spec.ts:211`'s year-order test has no card-count guard.**
Vacuous on an empty page. Companioned by `:119`, so low risk.

### SUGGESTION

**S1 — 9.6's "no sibling reads layout geometry" is satisfied in intent, not in
letter.** `timeline-rail.tsx`'s `onScroll` reads `scrollWidth`/`scrollLeft`/
`children.length` from the card scroller — a sibling of `<TimelinePath>` in the
same JSX. The parent measuring its own scroller and passing a normalised scalar
is the right design, and the docblock argues it. Reword the criterion to
"`<TimelinePath>` reads no geometry it was not passed", which is what is actually
true and what actually keeps 1e a one-file swap.

**S2 — four defensive branches are dead from the page**, in the R15 sense:
`events[active]?.year ?? 1`, `Math.max(1, events.length - 1)`,
`timeline-path.tsx:31`'s `events.length > 0 ? … : null`, and `mock.ts:206`.
All four are harmless and none is wrong. R15's table records exactly this for 1c;
1f's four are unrecorded.

**S3 — five more components on the far side of the jsdom gap.** `event-card`,
`ending-card`, `timeline-path`, `walking-pair`, `timeline-rail` at 0% unit
coverage. U6's report asked for the harness decision "before U7 inherits it";
U7 inherited it and added three, U9 inherited it and added five. Eight files now.

**S4 — `tasks.md` 10.1 still says the `adapters/http/session` allowlist is "SEVEN
files".** It is six: `intake/{page,actions,guards,declared/actions}` and
`quiz/{page,actions}`. #46 deleted `intake/gates/actions`, which Batch 7 noted.
The rule is about the module, so nothing is broken — but the sentence right after
says "stop maintaining a file list" and then maintains one.

**S5 — write down that the horizon seed and the ranking seed must stay
different.** `hash("life:…")` vs `hash("{lens}:…")`. Today they diverge and
`horizonYears` carries no ranking information. Unify them by accident and the
horizon becomes a rank oracle rendered at the top of the screen. Nothing in the
code, the tests or the plan says this must hold. See finding 5.

**S6 — the `apart`/epilogue distribution is worth pinning in a comment.** For
`p-laura-mendez`: romantic 10 together / 7 apart / 5 with epilogue; business
11 / 6 / 4. That is what makes C2 a two-line fix rather than a fixture change,
and it is currently only discoverable by reimplementing FNV-1a.

## Verdict

**FAIL** — on coverage and on two dead guards, not on behaviour.

Everything that runs, runs green and was re-executed here: `pnpm run verify`
222/16, `simulate.spec.ts` 26/26, five consecutive parallel runs of four specs at
110/110 with zero flakes, and a database-free production build. **The flakiness
claim is real** — 550 clean test executions.

**Every safety property I attacked held, and two held more firmly than the suite
proves.** The 404 is genuinely not an oracle: identical status, identical
headers, byte-identical bodies with zero residual diff once the requester's own
URL segment is normalised, and a same-length unknown id matching self to the
byte with no normalisation at all. The RSC flight payload carries no rank, no
position, no band, no bond, no friction and no third party's name — only the two
people involved. The union is the best-defended thing in the change: four
independent compile gates, and I fired the `@ts-expect-error` probes myself
rather than trusting the report. The CTA is inert by structure, not by promise.
Both claimed mutation probes reproduce verbatim, and I proved four more guards
live that the report never claimed.

**The blockers are four, and three of them are a defect class this project has
now found three times.** C1: a hardcoded horizon — a violation of the spec's
literal words — passes both AC-SIM-3 guards, because one asserts a range wide
enough to swallow it and the other greps for the single literal `12`. C2: the
ending card's dissolution branch and its epilogue are rendered by no test at any
layer, and the e2e carrying AC-SIM-6's id passes on the `together` branch —
the exact defect 9.1's own rationale cites U6 and U7 for. C3: consent-invariance
has no test and, unlike R15 and R16, no row admitting why — U7's C3, one unit
later, from the author who wrote R16. C4: five of `mock.test.ts`'s twelve
properties are vacuous, including the safety assertion that is the unit-layer
evidence for AC-PORT-8.

**The pattern worth naming is that the correct idiom is in the diff.**
`simulate.spec.ts:163` counts the collection before it iterates;
`mock.test.ts:83` does too. Five sibling tests in the same file do not, and the
one e2e that would have caught C2 needed one more URL — a URL the fixture was
deliberately built to make available. This unit's judgement is good and its
instincts are right. What is missing is the last turn of the same crank.

Nothing here threatens the demo. C1 and C4 are guard repairs; C2 is two lines;
C3 is most honestly a reconciliation row rather than a test. None of them changes
a pixel of screen 1f.

**Recommended next**: `sdd-apply` for C1–C4 and the W1/W3/W4 guard repairs, then
re-verify. **Do not archive** — and note that U9 cannot be the change's last word
while U7's own re-verify (R18/W9) is still outstanding against its settled
screen.

---
