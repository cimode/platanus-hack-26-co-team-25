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
