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
