# The form's response — what intake produces, step by step

> The expected shape of everything a participant submits, and of the aggregate that is
> stored at the end. Derived from `docs/domain.md` §3/§7 and mirrored 1:1 by the types in
> `src/lib/domain/participant/` and `src/lib/domain/quiz/` (issue #4). If this file and
> those files disagree, the code wins.
> Last updated: 2026-08-22.

The form is **seven submissions**, not one. Each step is its own Server Action with its
own payload, saved as soon as it is answered, so abandonment keeps everything before it.
A participant is rankable once steps 1–5 are complete (the *floor*); step 6 adds the
measured traits.

```
1 register ─> 2 photo ─> 3 consent ─> 4 declared ─> 5 gates (per consented lens) ─> 6 quiz ×15 ─> done
                                                      └──────── the floor ────────┘
```

## 1. `register` — creates the participant and the session

```ts
interface RegisterInput {
  room: string;          // slug from ?room=, falls back to HOOKAI_ROOM_SLUG
  name: string;          // 1..80 chars
  team?: string | null;  // structural proximity (PILLARS §8) — free text, optional
  track?: string | null; // idem
}
// → sets the httpOnly cookie `hookai_session`; the token never appears in any payload
```

## 2. `photo`

```ts
interface PhotoInput {
  file: Blob;            // ≤ 512 px, re-encoded client-side
}
// → participant.photoUrl (Vercel Blob URL). Required for the floor.
```

## 3. `consent` — one switch per lens, all **off** by default

```ts
interface Consent {
  romantic: boolean;     // default false; covers the ranking AND the AI-offspring render (D12)
  business: boolean;     // default false
  friendship: boolean;   // default false
}
```

A participant who consents to nothing is stored, never ranked.

## 4. `declared` — the free pillars, as the band that was tapped

Saved per screen; any field may still be `null` until the round is complete.

```ts
type DeclaredBand = 0 | 1 | 2 | 3;

interface DeclaredProfile {
  moneyPosture: DeclaredBand | null;      // Life Shape
  rootedness: DeclaredBand | null;        // Life Shape
  familyGravity: DeclaredBand | null;     // Life Shape
  capacityHoursBand: DeclaredBand | null; // discretionary hours ACTUALLY spent, last 4 weeks
  distanceBand: DeclaredBand | null;      // re-contact latency after closeness/conflict (3 = longest)
  chronotype: DeclaredBand | null;        // Common Ground
  tags: string[];                         // ≤ 12 slugs from the fixed vocabulary below
  acquaintances: ParticipantId[];         // ≤ 5; picker is cut from the first build — stays []
}
```

`declaredAt` is set only when all six bands are non-null. The engine consumes `band / 3`
for the Life Shape trio; the band itself for capacity and chronotype (`docs/domain.md` §6).

**Tag vocabulary (30 slugs, five groups of six):**

| group | slugs |
| --- | --- |
| interests | `fotografia` `ajedrez` `astronomia` `plantas` `videojuegos` `manualidades` |
| media | `anime` `k-pop` `reggaeton` `podcasts` `cine-de-culto` `fantasia` |
| food | `ramen` `arepas` `cafe-de-especialidad` `picante` `reposteria` `vegetariano` |
| activity | `tango` `running` `escalada` `ciclismo` `natacion` `senderismo` |
| pets | `perros` `gatos` `aves` `reptiles` `peces` `sin-mascotas` |

## 5. `gates` — only for lenses the participant consented to

Asked **only** after the matching consent (A8: asking is a disclosure event). No row means
"never asked", which the engine treats as *suppressed* for that lens.

```ts
type Gender = "M" | "F" | "NB";

interface RomanticGate {            // requires consent.romantic
  gender: Gender;
  interestedIn: Gender[];           // ≥ 1
  single: boolean;
  ageBand: 0 | 1 | 2 | 3;
  wantsKids: boolean;               // desire only — timing was cut (AUDIT S11)
}

interface BusinessGate {            // requires consent.business
  riskPosture: 0 | 1 | 2;
  exitHorizon: 0 | 1 | 2;
  redlinesOk: boolean;
}
// friendship has no gate: consent + floor only
```

Server-only. Never returned to any other participant, never in a room or ranking payload.

## 6. `quiz` — fifteen block responses, one submission each

The instrument is a constant (`INSTRUMENT`, version `v1`, 15 blocks × 4 text options, one
option per pillar, exactly one reversed-keyed). The form submits **keys**, never text:

```ts
type OptionKey = "a" | "b" | "c" | "d";

interface BlockResponse {
  participantId: string;
  position: number;         // 1..15 — which block of the instrument
  mostKey: OptionKey;       // "most like me"
  leastKey: OptionKey | null; // "least like me"; null under the single-pick fallback
  shownOrder: string;       // the shuffled display order, e.g. "cbad" — a permutation of "abcd"
  answeredAt: Date;
}
```

Rules: `mostKey ≠ leastKey`; one response per `(participant, position)` — re-answering
updates the row; the 15th distinct position sets `quizCompletedAt` in the same write.
Blocks 1–5, 6–10, 11–15 are delivered as three batches; the batch is derived, never stored.

## 7. What is stored — the aggregate

```ts
interface Participant {
  id: string;                  // uuid v7
  roomId: string;
  name: string;
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consent: Consent;
  declared: DeclaredProfile;
  declaredAt: Date | null;     // floor
  quizCompletedAt: Date | null;// also the arrival-cohort timestamp
  createdAt: Date;
}
// + romanticGate?: RomanticGate  (own table, row ⇔ answered)
// + businessGate?: BusinessGate  (own table, row ⇔ answered)
// + responses: BlockResponse[]   (0..15)
// + latents (issue #7): { regulation, politeness, reliability, agency }: { mean, se }
```

What *other* people can ever see of a participant is only:

```ts
interface RoomMember { id: string; name: string; photoUrl: string | null }
```

## 8. A complete response, as JSON

```json
{
  "participant": {
    "id": "01a02a27-7af6-7dfe-ac61-6a93bfef6c1a",
    "roomId": "01a02a27-0000-7000-8000-000000000001",
    "name": "Ana Ramírez",
    "photoUrl": "https://….public.blob.vercel-storage.com/p/01a02a27…-ana.jpg",
    "team": "team-25",
    "track": "simulations",
    "consent": { "romantic": true, "business": false, "friendship": true },
    "declared": {
      "moneyPosture": 2,
      "rootedness": 1,
      "familyGravity": 3,
      "capacityHoursBand": 1,
      "distanceBand": 0,
      "chronotype": 3,
      "tags": ["ramen", "escalada", "podcasts", "gatos"],
      "acquaintances": []
    },
    "declaredAt": "2026-08-22T18:04:11.000Z",
    "quizCompletedAt": "2026-08-22T18:11:40.000Z",
    "createdAt": "2026-08-22T18:01:02.000Z"
  },
  "romanticGate": {
    "gender": "F",
    "interestedIn": ["M", "NB"],
    "single": true,
    "ageBand": 1,
    "wantsKids": false
  },
  "businessGate": null,
  "responses": [
    { "position": 1,  "mostKey": "c", "leastKey": "b", "shownOrder": "cbad", "answeredAt": "2026-08-22T18:05:01.000Z" },
    { "position": 2,  "mostKey": "a", "leastKey": "d", "shownOrder": "dacb", "answeredAt": "2026-08-22T18:05:19.000Z" },
    { "position": 3,  "mostKey": "d", "leastKey": "c", "shownOrder": "bcda", "answeredAt": "2026-08-22T18:05:36.000Z" },
    { "position": 4,  "mostKey": "b", "leastKey": "a", "shownOrder": "abdc", "answeredAt": "2026-08-22T18:05:52.000Z" },
    { "position": 5,  "mostKey": "a", "leastKey": "b", "shownOrder": "cdab", "answeredAt": "2026-08-22T18:06:10.000Z" },
    { "position": 6,  "mostKey": "c", "leastKey": "a", "shownOrder": "acbd", "answeredAt": "2026-08-22T18:07:02.000Z" },
    { "position": 7,  "mostKey": "d", "leastKey": "b", "shownOrder": "bdca", "answeredAt": "2026-08-22T18:07:20.000Z" },
    { "position": 8,  "mostKey": "b", "leastKey": "c", "shownOrder": "dcab", "answeredAt": "2026-08-22T18:07:41.000Z" },
    { "position": 9,  "mostKey": "a", "leastKey": "d", "shownOrder": "badc", "answeredAt": "2026-08-22T18:08:00.000Z" },
    { "position": 10, "mostKey": "c", "leastKey": "d", "shownOrder": "cadb", "answeredAt": "2026-08-22T18:08:22.000Z" },
    { "position": 11, "mostKey": "b", "leastKey": "a", "shownOrder": "abcd", "answeredAt": "2026-08-22T18:09:15.000Z" },
    { "position": 12, "mostKey": "d", "leastKey": "c", "shownOrder": "dbac", "answeredAt": "2026-08-22T18:09:33.000Z" },
    { "position": 13, "mostKey": "a", "leastKey": "b", "shownOrder": "bacd", "answeredAt": "2026-08-22T18:10:01.000Z" },
    { "position": 14, "mostKey": "c", "leastKey": "a", "shownOrder": "cdba", "answeredAt": "2026-08-22T18:10:24.000Z" },
    { "position": 15, "mostKey": "b", "leastKey": "d", "shownOrder": "adbc", "answeredAt": "2026-08-22T18:11:40.000Z" }
  ]
}
```

`position` + `mostKey` resolve against `INSTRUMENT.blocks[position - 1].options` to the
pillar and keying that the scorer (issue #7) reads; the text is never stored twice.

## 9. Validation, in one place

| Field | Rule | Enforced by |
| --- | --- | --- |
| `name` | 1..80 chars | check + derived zod |
| every band | integer 0..3 (`riskPosture`, `exitHorizon`: 0..2) | check + `validateRomanticGate` / `validateBusinessGate` |
| `tags` | ≤ 12, each in the vocabulary, no duplicates | check `cardinality ≤ 12` + `validateTags` |
| `interestedIn` | ≥ 1 | check + validator |
| gate | only when `consent.<lens>` | use case refuses |
| `declaredAt` | only when all six bands set | check + `isDeclaredComplete` |
| `position` | 1..15, unique per participant | check + unique |
| `mostKey` / `leastKey` | `a..d`, different | check + `validateResponse` |
| `shownOrder` | permutation of `abcd` | `validateResponse` |
| session token | never a field of `Participant` | own table; type-level test |

Where the types live: `src/lib/domain/participant/participant.ts`, `gates.ts`, `tags.ts`;
`src/lib/domain/quiz/response.ts`, `instrument.ts`. Tables: `docs/domain.md` §3.
