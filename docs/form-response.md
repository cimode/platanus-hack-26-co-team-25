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

Each participant answers **their own 15 blocks**, authored live at entry and stored in
`generated_blocks(participant_id, position)` (`docs/domain.md` D16). What is fixed for
everyone is the structure — 15 positions, four text options per block, one per pillar,
exactly one reversed-keyed on the focus pillar — and `INSTRUMENT` (version `v1`) is the
structural contract plus the fallback served when authoring fails. The form submits
**keys**, never text:

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

**Stored with the answer (D15, issue #13)** — resolved by the server, never sent by the client:
`instrumentVersion` (`v1`), `scenario`, `mostText`, `leastText`. So the row for the first
answer above reads, on its own:

```json
{ "position": 1, "mostKey": "c", "leastKey": "b", "shownOrder": "cbad",
  "instrumentVersion": "v1",
  "scenario": "Tu amigo movió la perilla del horno y el pollo lleva una hora crudo. Los invitados ya están tocando el timbre.",
  "mostText": "Tomo el mando: pedimos pizza y listo",
  "leastText": "Anuncio que la cena está oficialmente arruinada" }
```

The question a person saw lives in their own `generated_blocks` row (with each option's
pillar and keying, which never appear on an answer row); the texts are copied onto the
answer from that row, so a deleted participant's cascade never orphans an answer.

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

`position` + `mostKey` resolve against that participant's `generated_blocks` row (the option
whose `key` matches) to the pillar and keying that the scorer (issue #7) reads.

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

## 10. The receiving contract (zod) — what each Server Action accepts

The client sends **keys**, never text. The server resolves the question and the chosen
option texts from the participant's `generated_blocks` row and stores them with the
answer (D15 as amended by D16); a key for a block the person was never shown is rejected. This is the shape
`src/lib/domain/intake/contract.ts` takes in issues #6 / #8 / #9:

```ts
import { z } from "zod";
import { TAGS } from "../participant/tags";

const band = z.number().int().min(0).max(3);
const gender = z.enum(["M", "F", "NB"]);
const optionKey = z.enum(["a", "b", "c", "d"]);

// 1 · register — identity is NOT in the payload; it is born here as the httpOnly cookie
export const RegisterInput = z.object({
  room: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  team: z.string().trim().max(80).optional(),
  track: z.string().trim().max(80).optional(),
});

// 3 · consent — everything off by default
export const ConsentInput = z.object({
  romantic: z.boolean().default(false),
  business: z.boolean().default(false),
  friendship: z.boolean().default(false),
});

// 4 · declared round — saved per screen, hence partial/nullable
export const DeclaredInput = z
  .object({
    moneyPosture: band.nullable(),
    rootedness: band.nullable(),
    familyGravity: band.nullable(),
    capacityHoursBand: band.nullable(),
    distanceBand: band.nullable(),
    chronotype: band.nullable(),
    tags: z.array(z.enum(TAGS)).max(12).default([]),
  })
  .partial();

// 5 · gates — accepted only when consent.<lens> is true (the use case refuses otherwise)
export const RomanticGateInput = z.object({
  gender,
  interestedIn: z.array(gender).min(1),
  single: z.boolean(),
  ageBand: band,
  wantsKids: z.boolean(),
});
export const BusinessGateInput = z.object({
  riskPosture: z.number().int().min(0).max(2),
  exitHorizon: z.number().int().min(0).max(2),
  redlinesOk: z.boolean(),
});

// 6 · one block answer — ×15
export const AnswerBlockInput = z
  .object({
    position: z.number().int().min(1).max(15),
    mostKey: optionKey,
    leastKey: optionKey.nullable(), // null under the single-pick fallback
    shownOrder: z.string().regex(/^[abcd]{4}$/),
  })
  .refine((r) => r.leastKey !== r.mostKey, { message: "leastKey must differ from mostKey" })
  .refine((r) => new Set(r.shownOrder).size === 4, { message: "shownOrder is a permutation of abcd" });
```

What the server derives and stores per answer — none of it comes from the client:

```ts
{
  participantId: fromCookie("hookai_session"),
  instrumentVersion: INSTRUMENT.version,                  // "v1"
  position, mostKey, leastKey, shownOrder,                // as received
  scenario: block.scenario,                               // block = generated_blocks row for (participantId, position)
  mostText: block.options.find((o) => o.key === mostKey).text,
  leastText: leastKey ? block.options.find((o) => o.key === leastKey).text : null,
  answeredAt: now,
}
```

The composite, for reading the whole thing as one object (it is never submitted as one —
the form is seven submissions, and the database fills step by step):

```ts
export const IntakeSubmission = z.object({
  register: RegisterInput,
  consent: ConsentInput,
  declared: DeclaredInput,
  romanticGate: RomanticGateInput.optional(), // only when consent.romantic
  businessGate: BusinessGateInput.optional(), // only when consent.business
  answers: z
    .array(AnswerBlockInput)
    .max(15)
    .refine((a) => new Set(a.map((x) => x.position)).size === a.length, {
      message: "one answer per block",
    }),
});
```
