# Domain — intake, instrument, responses

> What the database holds for the intake flow, why each table exists, and which issue
> lands it. Derives from `CONTEXT.md` §3–§4 (the flow), `PILLARS.md` §2/§8 (what must be
> captured), `AUDIT.md` S14–S17 (floor, consent, frozen parameters) and the engine's input
> contract in `src/lib/domain/matching/engine.ts` (`Person`). Where this file and the
> engine disagree, the engine's types win — the schema exists to feed them.
>
> Reviewed adversarially from five lenses (engine fidelity, data access, 36-hour
> pragmatism, CI migrations, safety); 17 findings were adopted, the largest being that the
> instrument lives in code, not in tables. Last updated: 2026-08-22.

---

## 0. The flow this models

```
register ──> photo ──> consent ──> declared round ──> gates ──> quiz (15 blocks, 3 batches) ──> scored ──> ranked
   │           │          │            │               │              │                            │          │
 participants  photo_url  consent_*   money/rooted/…   romantic_gates  quiz_responses        latent_estimates  (computed
 + session                            tags, chronotype business_gates   (one per block)          (I7)        on request, I8)
```

A participant is a row that fills in over ~8 minutes, left to right. Every step is
resumable: a respondent who closes the tab at block 7 is identified by the session cookie
and lands back on block 8. Nothing is derived from "status" columns — progress is read from
the data itself (`photo_url is null`, `declared_at is null`, `count(responses)`), so the
database can never claim a state the rows do not support.

The declared round runs **before** the quiz on purpose (`PILLARS.md` §8): someone who
abandons at block 4 still has gates, tags, capacity and proximity — still ranks, still
renders a panel. Photo and consent come first with their own minute (`AUDIT.md` S16).

**The floor, stated once.** A participant is rankable under a lens only when *all* of:
`photo_url is not null` · `consent_<lens>` · `declared_at is not null` · for romantic /
business, the lens gate row exists. Anyone below the floor is **suppressed with a reason,
never ranked** (`AUDIT.md` S15). `declared_at` is in the floor because the engine's
`LifeShape` and `chronotype` are required numbers with no degraded path: a friendship-
consented person who quit during the declared round would otherwise be ranked on fabricated
zeros, or on `NaN` that `bandOf()` labels `high`. Quiz abandoners rank; declared-round
abandoners do not.

## 1. Decisions this file makes

| # | Decision | Why |
| --- | --- | --- |
| D1 | ⚠️ **SUPERSEDED by D16** — was: **One fixed instrument for the whole room** — the 15 blocks in `quiz/batch-{1,2,3}.json`. Not generated per participant. | `PILLARS.md` §7.2: the precision claim rests on a *fixed balanced form* — every person answers the same 15 blocks, so every between-person contrast is on the same items. Per-person items destroy linking, and with it the 25% technical-depth argument. `AUDIT.md` F1: "irreversible once the form ships". The content exists and has passed the desirability judge. Generation (DeepSeek → Qwen) is an **offline pipeline that produces a versioned instrument**, not a request-time job. |
| D2 | ⚠️ **PARTLY SUPERSEDED by D16** — the constant survives as the structural contract and as the per-participant *fallback*; it is no longer what everyone answers. Was: **The instrument is a domain constant, not three tables.** `src/lib/domain/quiz/instrument.ts` builds it from the JSON at import, validates every block, carries `INSTRUMENT.version` (`v1`), and a unit test pins the content hash — version included. Responses reference `(position, key)`; the room records which version it administered, and the quiz (I6) and scoring (I7) use cases **throw when `room.instrument_version !== INSTRUMENT.version`**. | Sixty rows of committed, already-validated JSON that the engine never reads do not need a `QuizRepository`, a seed, a status enum, a partial unique index and a freeze-diff guard. The hash test plus the room↔version check *are* the freeze: editing a block means bumping the version, and a bumped version can only be administered and scored in a room created for it — never re-scored onto an existing room's responses. The quiz screen reads a constant — zero database reads per block on venue wifi. |
| D3 | Blocks are delivered in **three batches of five**. Between-batch screens are *transitions* (a "batch 2 of 3" beat), not waits. | The staged experience the product wants, without any generation latency in it (`docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md` §9). **Amended 2026-08-22 (D14):** the original rationale was prefetching the next five option images; with text-only options there is nothing to preload, so the batching survives purely as pacing. |
| D4 | Identity is a **session token in an httpOnly cookie**, stored in its own table. No email, no login. | `CONTEXT.md` §5: "auth beyond the minimum needed to identify a participant" is out of scope. The token is what makes "a ranking is visible only to the person who ran it" enforceable. A new device loses the session; acceptable for a one-evening demo. Its own table means no read of `participants` can return it *structurally* — not by convention. |
| D5 | **Gates live in their own tables, one per lens.** No row ⇔ never asked. | `PILLARS.md` §2: Eligibility Gates is "the only pillar with genuinely lens-partitioned content"; A8 says asking is a disclosure event. Gender and orientation are asked *only* of people who consented to the romantic lens, and the absent row maps 1:1 to the engine's `gates.romantic === undefined` → suppressed. |
| D6 | Declared values are stored **as the band that was tapped** (`smallint 0..3`), never as the `0..1` float the engine consumes. | Store what was asked, derive what the model needs. The band→float map is one pure function and can change without a migration. |
| D7 | Ids are `uuid` `default uuidv7()`; app-generated `crypto.randomUUID()` when a batch needs the parent id up front. | `data-access` skill §3. Verified: PG 18.6 on this project has `uuidv7()` natively. |
| D8 | `drizzle-kit generate` + committed `drizzle/*.sql` from the first table. **`db:push` is deleted**, from `package.json` and from every document that mentions it. | Migrations must replay on a fresh CI branch; a pushed schema has no history. `drizzle.config.ts` stops throwing when `DATABASE_URL` is unset so `db:generate` / `db:check` work without a database. |
| D9 | Rooms exist, carry the instrument version, and tests create their own. | A `room` is the isolation boundary between the demo's real responses and anything automated. The intake route resolves the room from `?room=<slug>`, falling back to `HOOKAI_ROOM_SLUG`. E2E creates `e2e-<run>` and never touches `platanus-hack-26-bogota`. |
| D10 | Option display order is shuffled per participant per block and recorded (`shown_order`). | `AUDIT.md` minor: a fixed form repeating one quadruple fifteen times becomes readable; shuffling breaks the mapping, and recording the shuffle keeps position bias analysable. |
| D11 | Photos go to **Vercel Blob** (`@vercel/blob`, `BLOB_READ_WRITE_TOKEN`), `photo_url` on the participant; tests use a fake `PhotoStore`. | GA, CDN-served, one env var, no Postgres egress for a room view that loads a hundred faces. Blob URLs are unguessable and are only ever embedded in pages the viewer is authorised to see; withdrawal deletes the blob. Fallback if provisioning becomes a problem at hour N: `photo bytea` served by a private route handler — same port, different adapter. |
| D12 | Romantic consent covers the ranking **and** the AI-offspring render, and the copy says so. | `AUDIT.md` S17: face-merge renders only for mutually opted-in pairs. One switch, explicitly worded. |
| D14 | **Option cards are text, not images.** No `public/quiz/*.png`, no image-generation pipeline, no `imagePathOf`. The `imagePrompts` already in `quiz/batch-*.json` stay in the file as authored history and are ignored by the domain type. | Confirmed by the user 2026-08-22. Cuts the entire image budget (60 renders per instrument version, and ~6,000 under the per-participant design §10.1 rejects), removes the model's least reliable capability — Spanish caption text baked into an image — from the critical path, and deletes issue I3 outright. Options are ≤8 words by the authoring rules, which is a card; the 2×2 grid in `docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md` renders them as type. |
| D16 | **Each participant gets their own generated form, authored live, batch by batch.** Reverses D1/D2. Fixed for everyone: 15 positions, the 4/4/4/3 focus-pillar rotation, four pillars once each, exactly one reversed option on the focus pillar. Varies per person: which everyday domain each position is set in, and the writing. Authored at entry and rolled forward — batch N+1 while batch N is answered. Stored in `generated_blocks(participant_id, position)`. **The committed 15 blocks become the per-participant fallback**, served whenever authoring fails, the model is down, or `AI_GATEWAY_API_KEY` is absent. | Confirmed by the user 2026-08-22, after §10.1 had been recorded the other way and built on — see the note below. The linking objection in D1 was **overstated**: the estimator uses *authored*, not calibrated, item parameters (`AUDIT.md` S8), so a block's likelihood depends on which pillar was chosen and how it was keyed, never on the scenario text. Identical structure is identical measurement, and `validateBlock()` enforces the structure on every generated block. D14 is what makes it affordable — text-only options mean ~1,500 short completions for 100 attendees rather than ~6,000 image renders. Residual risk is content quality with no human in the loop, carried by the structural validator, a repair pass and the fallback. Measured: ~38–70s per batch of five, 15/15 blocks correctly keyed first attempt. |
| D15 | **Every answer row carries its question.** ⚠️ The `instruments(version pk, hash, blocks jsonb, seeded_at)` **half is SUPERSEDED by D16** — there is no such table, no seed writes one, and the constant is mirrored nowhere; `generated_blocks(participant_id, position)` is the stored question set, per person. **What was kept, and shipped in I9/#13:** `quiz_responses` gains `instrument_version`, `scenario`, `most_text`, `least_text`, captured at answer time — now resolved from *that participant's* `generated_blocks` row rather than from the constant, with `save` rejecting when the block or the key is missing. | Requested by the user 2026-08-22: answers must be readable in the database together with the questions, without the code. Under D16 (same day, later) the question is not derivable from the code at *all*, so the answer-row columns became the whole of this decision instead of half of it — and a shared mirror became meaningless, because no two participants answer the same 15 scenarios. `INSTRUMENT` is still hash-pinned by its unit test and is still the per-participant fallback (D2). Cost: ~150 bytes per answer, and one extra read per `save` (the block, by its unique index). |
| D13 | **Rankings are computed on request, not stored.** Latent estimates *are* stored — they are the avatar. | `rankRoom` is pure and ranks a 100-person room in milliseconds; persisting its output was ceremony on the last issue. The loading moment is `loading.tsx` narrating "scoring 15 blocks · ranking N people". The projected room view, when it exists, computes mutual top-k from the same in-memory array behind an operator credential. `latent_estimates` stays: it is `CONTEXT.md` §3 step 2, and the timeline will read it. |

## 2. Aggregates (`src/lib/domain/`)

```
domain/
├─ participant/   Participant (own, full) · RoomMember { id, name, photoUrl } (what others see)
│                 Consent, DeclaredProfile, RomanticGate, BusinessGate, TAGS (picker vocabulary)
│                 bandToUnit(), meetsFloor(p, lens) — §0 rule, one function, used by every rankable read
├─ quiz/          INSTRUMENT (15 blocks from quiz/batch-*.json, validated at import)
│                 Block { position, batch, focusPillar, scenario, options[4] }  Option { key, text, pillar, keyed }
│                 validateBlock()  — four pillars once each, exactly one reversed, reversed ∈ focusPillar
│                 instrumentHash() — pinned by a test; changing content after responses exist is a new version
│                 BlockResponse { participantId, position, mostKey, leastKey?, shownOrder, answeredAt }
│                 validateResponse() — most ≠ least, keys ∈ a..d, position ∈ 1..15
│                 batchOf(position)   — no imagePathOf: options are text (D14)
├─ matching/      (exists) Person, scorePair, rankRoom
│                 toPerson(rankable, latents, cohort) — I8; throws on any null declared field (cannot happen past the floor)
└─ scoring/       (I7) responses → LatentEstimate per pillar
```

Rules of the house apply (`docs/architecture.md`): nothing in `domain/` imports anything
but `domain/` (and its own JSON); repositories return these types, never Drizzle rows.

## 3. Tables — lands with issue **I1**

Enums in SQL: `gender` (M | F | NB) · `option_key` (a | b | c | d). Pillars, keying and
lenses are TypeScript unions; nothing in the database stores them.

### `rooms`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | `uuidv7()` |
| slug | text unique not null | `platanus-hack-26-bogota`; e2e rooms are `e2e-<runId>` |
| name | text not null | |
| instrument_version | text not null | `v1` — which instrument this room administered |
| created_at | timestamptz not null | |

### `participants`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| room_id | uuid → rooms not null | index |
| name | text not null | check `length(name) between 1 and 80` |
| photo_url | text | null until uploaded; part of the floor |
| team | text | structural proximity (`PILLARS.md` §8 — must be a form field) |
| track | text | idem |
| consent_romantic | bool not null default false | **opt-out by default** |
| consent_business | bool not null default false | |
| consent_friendship | bool not null default false | |
| money_posture | smallint | 0..3, null until declared |
| rootedness | smallint | 0..3 |
| family_gravity | smallint | 0..3 |
| capacity_hours_band | smallint | 0..3 — discretionary hours *actually spent* in the last four weeks |
| distance_band | smallint | 0..3 — re-contact latency after closeness or conflict (3 = longest) |
| chronotype | smallint | 0..3 |
| tags | text[] not null default '{}' | slugs from `TAGS`; check `cardinality(tags) <= 12` |
| declared_at | timestamptz | set when the declared round is complete; **part of the floor** |
| quiz_completed_at | timestamptz | set on block 15; also the **arrival cohort** timestamp (`PILLARS.md` §2) |
| created_at | timestamptz not null | |

Checks: every band column `is null or between 0 and 3`. `declared_at` may only be set when
all six bands are non-null (check).

Why not a `declared_profiles` table: it would be 1:1, written once, read with the
participant every time. A join that buys nothing.

### `participant_sessions` — the credential, kept out of the aggregate

| column | type | notes |
| --- | --- | --- |
| token | uuid pk | `gen_random_uuid()`; travels only in the `hookai_session` httpOnly cookie |
| participant_id | uuid unique not null → participants cascade | one live session per participant |
| created_at | timestamptz not null | |

`create()` returns `{ participant, sessionToken }`; `sessionToken` is a branded string that
is never a field of `Participant`, so no `select`, relation or serialiser can leak it.

### `romantic_gates` — one row ⇔ the participant answered the romantic gates

| column | type | notes |
| --- | --- | --- |
| participant_id | uuid pk → participants cascade | |
| gender | gender not null | asked **only** here (D5) |
| interested_in | gender[] not null | check `cardinality(interested_in) >= 1` |
| single | bool not null | |
| age_band | smallint not null | check 0..3 |
| wants_kids | bool not null | desire only; timing was cut (`AUDIT.md` S11) |
| updated_at | timestamptz not null | |

### `business_gates`

| column | type | notes |
| --- | --- | --- |
| participant_id | uuid pk → participants cascade | |
| risk_posture | smallint not null | check 0..2 |
| exit_horizon | smallint not null | check 0..2 |
| redlines_ok | bool not null | |
| updated_at | timestamptz not null | |

### `acquaintances` — capped declared list (`PILLARS.md` §2 Structural Proximity)

| column | type | notes |
| --- | --- | --- |
| participant_id | uuid → participants cascade | |
| knows_id | uuid → participants cascade | |
| | pk (participant_id, knows_id) · check `participant_id <> knows_id` | cap of 5 enforced in the use case |

The table is cheap; the picker UI is not, and it is **cut from I5**. `saveDeclared` batches
the participant update with delete + insert of acquaintances; the insert is included only
when the list is non-empty (an empty `values()` throws), and the update keeps the batch
non-empty.

### `quiz_responses`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| participant_id | uuid → participants cascade | |
| position | smallint not null | check 1..15 |
| most_key | option_key not null | |
| least_key | option_key | null under the single-pick fallback; check `least_key is null or least_key <> most_key` |
| shown_order | text not null | e.g. `cbad`; check `length = 4` |
| instrument_version | text not null | **I9** — `INSTRUMENT.version`, the *structural* version under D16 |
| scenario | text not null | **I9** — this participant's block-`position` scenario, as answered |
| most_text | text not null | **I9** — the text of the option `most_key` named |
| least_text | text | **I9** — null exactly when `least_key` is; check `(least_key is null) = (least_text is null)` |
| answered_at | timestamptz not null | |
| | unique (participant_id, position) | |

A participant answers a block once; re-answering is an update (the back affordance), not a
second row — and the update moves the **texts** with the keys, or the row would describe an
answer nobody gave. The instrument the keys refer to is the room's `instrument_version`.

The four I9 columns are resolved inside `ResponseRepository.save`, at write time, from
`generated_blocks(participant_id, position)` — **that participant's** block, never the
fallback constant (under D16 most people did not answer the constant). No block row at that
position, or a key that block never offered, makes `save` **reject**, naming the participant
and the position, and write nothing: an answer to a block nobody was shown is a bug, not a
degraded mode. `pillar`/`keyed` never appear on an answer row (§10.1).

### ~~`instruments`~~ — **I9** (D15): superseded by D16, columns kept

There is no `instruments` table. D15 mirrored one shared question set per version; under D16
the question set is per participant, and `generated_blocks(participant_id, position)` already
*is* that record — cascading with the participant, which a version-keyed mirror never would.
Mirroring the constant in SQL would store the one form almost nobody answered.

What D15 asked for survives whole in the four columns above, and matters more under D16 than
it did under D2: the question a row answers is no longer derivable from the code at all, so
the row has to carry it. The constant stays hash-pinned by its unit test and stays the
per-participant fallback (D2); it is seeded nowhere.

## 4. Tables that land later

### `latent_estimates` — **I7** (scoring)

`(participant_id pk-part → participants cascade, pillar text pk-part check in (…), mean real
check 0..1, se real check > 0, scorer_version text, computed_at)`. One row per measured
pillar; a missing row is the engine's degraded mode (`AUDIT.md` S15 — prior mean, wide se,
weights untouched). Maps onto `Person.latents: Partial<Record<LatentName, LatentEstimate>>`.

Nothing else. Rankings are computed (D13).

## 5. Invariants and where each is enforced

| Invariant | Source | Enforced by |
| --- | --- | --- |
| No stored progress state — progress is read from the rows | §0 | schema (no status column); `declared_at` check |
| Below-floor participants are never ranked (§0 rule, incl. `declared_at`) | `AUDIT.md` S15 | `meetsFloor(p, lens)` applied inside `byRoomForRanking(room, lens)`; `toPerson` throws on a null declared field; I8 safety test with the abandoned-participant fixture |
| Romantic consent defaults to **off** | `CONTEXT.md` §7.3 | column default + a **running** safety test from I1 on |
| The session token never leaves the server | D4 | own table; `SessionToken` is not a field of `Participant`; type-level test |
| Other participants' gate rows, consent flags, declared bands and latents never leave the server | A8, `PILLARS.md` §2 Consent & Disclosure | `byRoom()` returns `RoomMember` only; full rows flow only through `byRoomForRanking()` → `toPerson()` inside `prepare-results`. **I1**: a type-level test that `RoomMember` has exactly `id`, `name`, `photoUrl`. **I8**: a serialisation test greps the results payload for `interested_in`, `gender`, `single`, `wants_kids`, `consent_` |
| A ranking is visible only to its subject | `e2e/demo-path.spec.ts` | `rank-room` takes `subjectId` from `bySessionToken()` only, never from the request; running safety test from I1 on |
| Gates only for consented lenses | D5 / A8 | use case refuses a gate upsert when `consent_<lens>` is false |
| Bands in range (declared 0..3, age 0..3, risk/exit 0..2) | D6 | check constraints + derived zod |
| Four pillars once each per block; exactly one reversed, on the focus pillar | `PILLARS.md` §7.2, `AUDIT.md` F1 | `validateBlock()` at import — the app does not boot on an invalid instrument |
| The instrument is frozen once the form ships | `AUDIT.md` F1 "irreversible" | `instrumentHash()` (content + `INSTRUMENT.version`) pinned by a unit test; `quiz-progress`, `answer-block` and `score-participant` throw when `room.instrument_version !== INSTRUMENT.version`, so an edited instrument needs a new room |
| most ≠ least; keys valid; one response per (participant, position) | §3 | checks + unique |
| A participant's photo URL is returned only to its own session, or inside a ranking whose subject is the viewer | D11 | I4 safety test: no route or payload carries `photoUrl` except `bySessionToken()`'s own participant and `prepare-results` for its subject; the serialisation test also greps for `photo_url` / `photoUrl` |
| Only mutual matches surface publicly | `CONTEXT.md` §7.3 | the room view (not in this split) checks an operator credential in its action and returns mutual pairs only — no scores, drivers, friction or flags; a **running** (vacuous) safety test from I1 on, un-skipping the two safety stubs in `e2e/demo-path.spec.ts` |
| Real room never touched by automation | D9 | e2e fixtures create their own room; the seed only creates the demo room if absent |

## 6. Mapping to the engine (`Person`) — lands with I8

Only participants that pass `meetsFloor(p, lens)` reach `toPerson`. For them, every
declared field is non-null by construction.

| `Person` field | Source |
| --- | --- |
| `latents[p]` | `latent_estimates` rows, absent ⇒ undefined |
| `declared.distanceBand` | `distance_band` |
| `declared.lifeShape.{moneyPosture,rootedness,familyGravity}` | `band / 3` |
| `declared.lifeShape.capacityHoursBand` | `capacity_hours_band` as-is (engine takes the band) |
| `declared.tags` / `declared.chronotype` | as-is |
| `structural.team` / `track` | as-is; null ⇒ undefined |
| `structural.cohort` | rank of `quiz_completed_at` within the room, bucketed into 30-minute windows from the room's first completion; null ⇒ undefined |
| `structural.acquaintances` | `acquaintances.knows_id[]` |
| `gates.romantic` / `gates.business` | the gate row, absent ⇒ undefined |
| `consent.*` | the three booleans |
| `hasPhoto` | `photo_url is not null` |

## 7. Ports and repositories (I1)

```ts
// src/lib/ports/participant-repository.ts
interface ParticipantRepository {
  create(input: NewParticipant): Promise<{ participant: Participant; sessionToken: SessionToken }>;
  bySessionToken(token: SessionToken): Promise<Participant | null>;
  setPhoto(id, url): Promise<void>;
  setConsent(id, consent: Consent): Promise<void>;
  saveDeclared(id, declared: DeclaredProfile): Promise<void>;       // one batch(); sets declared_at when complete
  upsertRomanticGate(id, gate): Promise<void>;
  upsertBusinessGate(id, gate): Promise<void>;
  markQuizCompleted(id, at: Date): Promise<void>;
  byRoom(roomId): Promise<RoomMember[]>;                            // id, name, photoUrl — nothing else
  byRoomForRanking(roomId, lens): Promise<RankableParticipant[]>;   // applies the FULL §0 floor for `lens` (photo, consent_<lens>, declared_at, gate row);
                                                                    // full rows + gates + acquaintances; one query per table, joined in memory (no N+1)
}

// src/lib/ports/room-repository.ts
interface RoomRepository {
  bySlug(slug): Promise<Room | null>;
  byId(id: RoomId): Promise<Room | null>;                           // the quiz reads participant.roomId → room.instrumentVersion
  create(room: NewRoom): Promise<Room>;                             // seed + e2e fixtures
}
```

`Participant` carries `roomId`. The instrument-version guard (§5) is applied by
`quiz-progress` / `answer-block` through `rooms.byId(participant.roomId)` (I6), and by
`score-participant` on a `room` its caller passes in — I8's `prepare-results` already
holds it — so scoring owns no room read and no repository file beyond `latent_estimates`.

```ts

// src/lib/ports/response-repository.ts
interface ResponseRepository {
  save(r: BlockResponse, opts?: { completedAt: Date }): Promise<void>;
  //  upsert on (participant, position); when `completedAt` is given (the 15th distinct
  //  position), the same batch() also sets participants.quiz_completed_at — one round trip,
  //  so a participant can never have 15 responses and no completion timestamp.
  //  The adapter first reads generated_blocks(participant, position) and stores scenario /
  //  most_text / least_text on the row (D15, §3); a missing block or an unknown key rejects
  byParticipant(id): Promise<BlockResponse[]>;   // keys only — the texts are for humans and SQL
}
```

`answer-block` decides whether a response completes the set (count of distinct positions
after this upsert = 15) and passes `completedAt`; it never calls `markQuizCompleted`
separately. After a re-answer via the back affordance the next screen is always the
**first unanswered position** (or the hand-off if none). The single-pick fallback flag is
read from the environment **inside the server action**, never from the submitted form.

`loading.tsx` for `/results/[lens]` must not await anything: it renders the narrated
moment without the room size (or with a size passed as a search param by the previous
screen) — a Suspense fallback that suspends on a database read is not a loading screen.

Implementations in `src/lib/adapters/db/*-repository.ts`, wired in `composition.ts`.
Multi-row writes inside one adapter method use `db.batch()` — `db.transaction()` throws on
neon-http (`data-access` §2). Per-block response upserts are the unit of write; the batched
writes are declared + acquaintances, the last response + `quiz_completed_at`, and the seed.

## 8. Migrations and environments

- `pnpm run db:generate` emits `drizzle/NNNN_<name>.sql` + `meta/`, committed with the
  schema change that produced it. `pnpm run db:migrate` applies. `pnpm run db:check` guards
  history and needs no database. `db:push` no longer exists.
- **Locally:** against the Neon branch in `.neon` (`dev-domain` today). `neon diff` before
  committing.
- **Seed (`pnpm run db:seed`):** creates the demo room if absent. That is all it does.
- **CI (I2).** One long-lived, PII-free branch `ci-base` (empty schema) is the parent of
  everything automated; `production` is never a parent.
  - *Pull request:* `neondatabase/create-branch-action@v6` creates or returns
    `preview/pr-<n>` from `ci-base`; when it already existed it is **reset to parent**
    before use (the reset-branch action or `POST …/branches/{id}/reset_to_parent`), so a
    rewritten migration never meets a stale schema. Then `db:migrate` + `db:seed`; the pooled
    URL becomes `DATABASE_URL` (with `DB_REQUIRED=1`) for `unit` and `e2e` — the e2e dev
    server inherits it — and is passed to `deploy-preview` as the deployment's runtime env.
    `pull_request: closed` deletes the branch (`neondatabase/delete-branch-action@v3`).
  - *Push to `main`:* an ephemeral `ci/main-<run_id>` from `ci-base` for `unit`/`e2e`,
    deleted `if: always()`; then `migrate-production` (`needs` every gate; the only job that
    can see `secrets.DATABASE_URL_PRODUCTION`), then `deploy-production`
    (`needs: migrate-production`). Tests never receive production's URL; the Vercel Preview
    environment never holds it either.
  - Settings: `NEON_API_KEY` (secret), `DATABASE_URL_PRODUCTION` (secret, pooled),
    `NEON_PROJECT_ID` (variable, `floral-bread-20641106`); the Vercel production env must
    carry `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`.
- **Integration tests** (`src/lib/adapters/db/*.test.ts`) use `DATABASE_URL`; when it is
  unset they skip with a visible notice, unless `DB_REQUIRED=1`, in which case they fail.
  The guard lives in one helper, `src/lib/adapters/db/test-db.ts`.

## 9. Issue map

| Issue | Lands | Depends on |
| --- | --- | --- |
| I1 · [#4](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/4) `domain: intake schema, migrations, repositories and seed` | §2 types + instrument constant (with `version`) + hash test, §3 tables, §7 ports/adapters, first migration, demo-room seed; **three running safety tests** (romantic consent defaults off; ranking visible only to its subject; only mutual matches in the room view — un-skipping the two safety stubs in `e2e/demo-path.spec.ts` as vacuous assertions) plus the `RoomMember` type-level test and the `SessionToken`-not-a-field test; **D8 in full**: delete `db:push` from `package.json`, make `dbCredentials` optional in `drizzle.config.ts` so `db:generate` / `db:check` run with `DATABASE_URL` unset, rewrite `docs/database.md`; update `.claude/skills/data-access/SKILL.md` (§1 port example → the §7 `ResponseRepository.save(r)` shape, §2 batch rationale → the §7 list of batched writes, §5 and hard rule 6 → generate + commit + migrate) | — |
| I2 · [#5](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/5) `ci: migrate a Neon branch per PR and production on main` | §8 CI | I1 |
| I3 · **cancelled 2026-08-22 (D14)** — was `quiz: render the 60 caption-free option cards into public/quiz`. Options are text; there is no image pipeline, no image-generator port and no `public/quiz/`. | — | — |
| I4 · [#6](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/6) `intake: register with a photo and per-lens consent on a phone` | `/intake` steps 1–3, session cookie, `PhotoStore` + Vercel Blob adapter, the photo-exposure safety test (§5) | I1 |
| I5 · [#8](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/8) `intake: declared round and lens gates` | `/intake` steps 4–5 | I4 |
| I6 · [#9](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/9) `quiz: answer 15 blocks in three batches` | `/quiz` against the instrument constant; typographic option cards (D14), batch beats as pacing | I1, I4 |
| I7 · [#7](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/7) `scoring: turn 15 block responses into latent posteriors` | `domain/scoring`, `latent_estimates` | I1 |
| I8 · [#10](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/10) `matching: rank the room under a lens and show the result` | `prepare-results` (score if missing → `byRoomForRanking(room, lens)` → `toPerson` → `rankRoom`), `/results/[lens]` with `loading.tsx`, the results-payload serialisation test (§5) and the abandoned-participant safety test | I5, I6, I7 |
| I9 · [#13](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/13) `quiz: persist the question set and resolved answers` | `instruments` table + the four answer columns, migration `0001`, `InstrumentRepository`, seed writes/refuses by hash, `save` resolves texts | #4 |

Waves: **I1** → **{I2, I4, I9}** → **{I5, I6, I7}** → **I8**. I9 and I7 both add a migration and both touch `schema/index.ts`, so they run sequentially, I9 first. Each wave touches disjoint
paths and can run in parallel through `/work`. I3 has no code dependency and no
**I3 is cancelled** (D14): options are text, so there is no image work to file. I6 renders
typographic option cards; that is the only mode.

Not in this split, noted so nobody forgets them: the operator-gated projected room view
(mutual pairs only, no scores — reads the same in-memory ranking), withdrawal ("delete me":
cascade delete + blob delete), the timeline and the offspring render.

## 10. Assumptions awaiting the user's confirmation

These are decided above so work can start; each is one line to reverse.

1. **D1/D2 — REVERSED by the user 2026-08-22, see D16.** This entry previously read
   "confirmed", and #4/#11/#14 were built against that reading. The reversal came after.
   Nothing merged is wasted — `INSTRUMENT` is still hash-pinned and still the fallback, and
   `quiz_responses(participant_id, position)` joins `generated_blocks(participant_id,
   position)` unchanged — but two things need a second look:
   **(a) D15's `instruments` table** mirrors one shared question set per version; under D16
   the per-participant blocks are the record, and `generated_blocks` already holds them, so
   I9/#13 should mirror *that* instead. D15's other half — denormalising `scenario`,
   `most_text`, `least_text` onto the answer row — becomes *more* valuable under D16, not
   less, because the question is no longer derivable from the constant.
   **Settled in #13:** no `instruments` table at all (`generated_blocks` is the record), and
   the four answer-row columns ship resolved from the participant's own block — see D15 and
   §3.
   **(b) `rooms.instrument_version`** now identifies the *structural* version (rotation and
   rules), which really is shared, rather than the exact 15 scenarios.
2. **D11 — Vercel Blob for photos**, `bytea` as the fallback.
3. ~~**Which gateway serves the image model** for I3.~~ **Moot 2026-08-22 (D14)** — there
   is no image model. `AI_GATEWAY_API_KEY` is set on Vercel (Preview and Production) and
   serves the offline *text* authoring path only.
4. **Where the issues live.** The `status:*` / `prio:*` labels exist on the org repo; CI,
   `main` and deploys live on the `cimode` repo; `/intake`, `/work` and `issue-status`
   point at the org repo.
