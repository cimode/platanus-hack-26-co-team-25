# The form's response — what intake produces, step by step

> The expected shape of everything a participant submits, and of the aggregate that is
> stored at the end. Derived from `docs/domain.md` §3/§7 and mirrored 1:1 by the types in
> `src/lib/domain/participant/` and `src/lib/domain/quiz/` (issue #4). If this file and
> those files disagree, the code wins.
> Last updated: 2026-08-23 (D20).

The form is **two kinds of submission** since **D20** (2026-08-23): one registration, then
the quiz. Each block is its own Server Action with its own payload, saved as soon as it is
answered, so abandonment keeps everything before it. A participant is rankable the moment
registration is complete (the *floor*); the quiz adds the measured traits.

```
1 registration (photo · name · gender · birthdate) ─> 2 quiz ×15 ─> done
   └──────────── the floor ────────────┘
```

Nothing on any of these screens names a pillar, a lens, consent, a gate, a team, a track,
the wordmark or a step number. One `Progress` bar spans the whole 16-step flow (1
registration + 15 blocks) and is the only progress copy there is.

## 1. `register` — creates the participant, the session and the photo

One screen, one action (D18). The photo is stored inside it: the row is created first
(the store namespaces the object by participant id), then `photo_url` is set. When the
store refuses, the row is left without a photo and **without a cookie pointing at it**, so
the flow resumes on the same screen and no half-written row is reachable.

```ts
interface RegisterInput {
  room: string;          // slug from ?room=, falls back to HOOKAI_ROOM_SLUG
  name: string;          // 1..80 chars
  gender: "M" | "F" | "NB";
  birthdate: string;     // YYYY-MM-DD; 18 ≤ age ≤ 100, evaluated against a `today` passed in
  photo: Blob;           // ≤ 512 px re-encoded client-side; ≤ 1 MiB and JPEG/PNG/WebP on the server
  dataConsent: "on";     // the data-treatment checkbox; absent when unticked (#49)
}
// → participants row with gender, birthdate, photo_url, data_consent_at and the three consents `true`
// → sets the httpOnly cookie `dipia_session`; the token never appears in any payload
// → adopts one pre-written set of first questions from the room's pool (D20), then redirects to /quiz
```

`dataConsent` is the ONE authorisation this version asks for (issue #49): the box is
unticked by default, the action refuses with `reason: "data-consent"` when it is missing —
before any row is written — and `participants.data_consent_at` records **when** it was
given, which is what Ley 1581 de 2012 expects. The per-lens consents below are a different
thing entirely and stay unasked.

`birthdate` is asked because the engine wants an age band and nobody should have to pick
one: `ageBandOf(birthdate, today)` maps 18–24 → 0, 25–31 → 1, 32–39 → 2, 40+ → 3.

**What happens around the submit (D20).** Opening the form tops up a per-room pool of
first batches in the background, so by the time the person taps *Empezar* there is usually
a set of five questions waiting; the action moves it into their own `generated_blocks` as
batch 1 and redirects. Whatever is still missing — batch 1 when the pool was empty, then
batches 2 and 3 — is authored after the response under a database claim. The quiz never
generates on a read: a block that is not stored yet shows a "writing your questions" state
until the rows land.

## 2. the per-lens consents — not asked (D18)

`consent_romantic`, `consent_business` and `consent_friendship` are written `true` by the
registration itself: participating *is* consenting for this version. There is no consent
screen, no switch and no consent copy anywhere in the product — the decision is recorded
in `docs/domain.md` D18, not shown.

## 3. the declared round — not asked (D20)

The three declared screens are gone. The six band columns (`money_posture` …
`chronotype`), `tags` and `declared_at` stay in the schema and are simply never written
for a new participant — no destructive migration, nothing reads them as a requirement.
`DeclaredProfile` survives as a type with every band `null`:

```ts
type DeclaredBand = 0 | 1 | 2 | 3;

interface DeclaredProfile {
  moneyPosture: DeclaredBand | null;      // null for everyone registered since D20
  rootedness: DeclaredBand | null;
  familyGravity: DeclaredBand | null;
  capacityHoursBand: DeclaredBand | null;
  distanceBand: DeclaredBand | null;
  chronotype: DeclaredBand | null;
  tags: string[];                         // []
  acquaintances: ParticipantId[];         // []
}
```

The engine treats a null band as **unmeasured**: `toPerson` maps it to an absent field and
each declared term scores at its neutral midpoint with the weights untouched, the same
degraded path `distanceBand` always had (`AUDIT.md` S15). A pre-D20 row that did answer
still ranks on what it answered — `band / 3` for the Life Shape trio, the band itself for
capacity and chronotype (`docs/domain.md` §6).

## 4. gates — not asked (D18)

The gate screens are gone. `romantic_gates` and `business_gates` stay in the schema and
are simply not written any more; the engine's gate inputs are **derived** from
`src/lib/domain/participant/mvp-defaults.ts`:

```ts
mvpRomanticGate({ gender, birthdate }, today) // gender as asked, interestedIn = M, F, NB,
                                              // single true, wantsKids true,
                                              // ageBand = ageBandOf(birthdate, today)
mvpBusinessGate()                             // riskPosture 1, exitHorizon 1, redlinesOk true
```

Server-only, as they always were: never returned to any other participant, never in a room
or ranking payload.

## 5. the floor, restated

`photo_url is not null` · `gender` and `birthdate` are not null · `consent_<lens>` (always
true under D18). The gate-row clause went with the gate screens (D18); the `declared_at`
clause went with the declared screens (D20). Registration *is* the floor.

## 6. `quiz` — fifteen block responses, one submission each

Each participant answers **their own 15 blocks**, authored live at entry and stored in
`generated_blocks(participant_id, position)` (`docs/domain.md` D16, D20). What is fixed for
everyone is the structure — 15 positions, four text options per block, one per pillar,
exactly one reversed-keyed on the focus pillar — and `INSTRUMENT` (version `v1`) is the
structural contract. Since D20 the committed blocks are never served to a participant: a
stored row with `source = 'fallback'` counts as not authored. The form submits **keys**,
never text:

```ts
type OptionKey = "a" | "b" | "c" | "d";

interface BlockResponse {
  participantId: string;
  position: number;         // 1..15 — which block of the instrument
  mostKey: OptionKey;       // the one tap (single pick is the product default)
  leastKey: OptionKey | null; // "least like me"; only under HOOKAI_QUIZ_MOST_LEAST=1
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
{ "position": 1, "mostKey": "c", "leastKey": null, "shownOrder": "cbad",
  "instrumentVersion": "v1",
  "scenario": "Tu amigo movió la perilla del horno y el pollo lleva una hora crudo. Los invitados ya están tocando el timbre.",
  "mostText": "Tomo el mando: pedimos pizza y listo",
  "leastText": null }
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
  gender: "M" | "F" | "NB" | null;   // D18; null only on pre-D18 rows
  birthdate: string | null;          // D18; YYYY-MM-DD
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consent: Consent;
  declared: DeclaredProfile;   // every band null since D20
  declaredAt: Date | null;     // dormant since D20; never part of the floor any more
  quizCompletedAt: Date | null;// also the arrival-cohort timestamp
  createdAt: Date;
}
// + romanticGate?: RomanticGate  (own table; D18 stopped writing it — derived instead)
// + businessGate?: BusinessGate  (own table; D18 stopped writing it — derived instead)
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
    "gender": "F",
    "birthdate": "1999-05-04",
    "photoUrl": "https://….s3.…/photos/01a02a27…/face.jpg",
    "team": null,
    "track": null,
    "consent": { "romantic": true, "business": true, "friendship": true },
    "dataConsentAt": "2026-08-23T18:01:02.000Z",
    "declared": {
      "moneyPosture": null,
      "rootedness": null,
      "familyGravity": null,
      "capacityHoursBand": null,
      "distanceBand": null,
      "chronotype": null,
      "tags": [],
      "acquaintances": []
    },
    "declaredAt": null,
    "quizCompletedAt": "2026-08-23T18:07:40.000Z",
    "createdAt": "2026-08-23T18:01:02.000Z"
  },
  "romanticGate": null,
  "businessGate": null,
  "responses": [
    { "position": 1,  "mostKey": "c", "leastKey": null, "shownOrder": "cbad", "answeredAt": "2026-08-23T18:02:01.000Z" },
    { "position": 2,  "mostKey": "a", "leastKey": null, "shownOrder": "dacb", "answeredAt": "2026-08-23T18:02:19.000Z" },
    { "position": 3,  "mostKey": "d", "leastKey": null, "shownOrder": "bcda", "answeredAt": "2026-08-23T18:02:36.000Z" },
    { "position": 4,  "mostKey": "b", "leastKey": null, "shownOrder": "abdc", "answeredAt": "2026-08-23T18:02:52.000Z" },
    { "position": 5,  "mostKey": "a", "leastKey": null, "shownOrder": "cdab", "answeredAt": "2026-08-23T18:03:10.000Z" },
    { "position": 6,  "mostKey": "c", "leastKey": null, "shownOrder": "acbd", "answeredAt": "2026-08-23T18:04:02.000Z" },
    { "position": 7,  "mostKey": "d", "leastKey": null, "shownOrder": "bdca", "answeredAt": "2026-08-23T18:04:20.000Z" },
    { "position": 8,  "mostKey": "b", "leastKey": null, "shownOrder": "dcab", "answeredAt": "2026-08-23T18:04:41.000Z" },
    { "position": 9,  "mostKey": "a", "leastKey": null, "shownOrder": "badc", "answeredAt": "2026-08-23T18:05:00.000Z" },
    { "position": 10, "mostKey": "c", "leastKey": null, "shownOrder": "cadb", "answeredAt": "2026-08-23T18:05:22.000Z" },
    { "position": 11, "mostKey": "b", "leastKey": null, "shownOrder": "abcd", "answeredAt": "2026-08-23T18:06:15.000Z" },
    { "position": 12, "mostKey": "d", "leastKey": null, "shownOrder": "dbac", "answeredAt": "2026-08-23T18:06:33.000Z" },
    { "position": 13, "mostKey": "a", "leastKey": null, "shownOrder": "bacd", "answeredAt": "2026-08-23T18:07:01.000Z" },
    { "position": 14, "mostKey": "c", "leastKey": null, "shownOrder": "cdba", "answeredAt": "2026-08-23T18:07:24.000Z" },
    { "position": 15, "mostKey": "b", "leastKey": null, "shownOrder": "adbc", "answeredAt": "2026-08-23T18:07:40.000Z" }
  ]
}
```

`position` + `mostKey` resolve against that participant's `generated_blocks` row (the option
whose `key` matches) to the pillar and keying that the scorer (issue #7) reads.

## 9. Validation, in one place

| Field | Rule | Enforced by |
| --- | --- | --- |
| `name` | 1..80 chars | check + derived zod |
| `birthdate` | a real `YYYY-MM-DD`, 18 ≤ age ≤ 100 | `birthdateProblem` in the use case |
| `dataConsent` | present | zod literal + `reason: "data-consent"` before any write |
| every band (dormant) | integer 0..3 when present; `declared_at` only with all six | check + `isDeclaredComplete` |
| `position` | 1..15, unique per participant | check + unique |
| `mostKey` / `leastKey` | `a..d`, different | check + `validateResponse` |
| `shownOrder` | permutation of `abcd` | `validateResponse` |
| session token | never a field of `Participant` | own table; type-level test |

Where the types live: `src/lib/domain/participant/participant.ts`, `gates.ts`, `tags.ts`;
`src/lib/domain/quiz/response.ts`, `instrument.ts`. Tables: `docs/domain.md` §3.

## 10. The receiving contract (zod) — what each Server Action accepts

The client sends **keys**, never text. The server resolves the question and the chosen
option texts from the participant's `generated_blocks` row and stores them with the
answer (D15 as amended by D16); a key for a block the person was never shown is rejected.

```ts
import { z } from "zod";

const gender = z.enum(["M", "F", "NB"]);
const optionKey = z.enum(["a", "b", "c", "d"]);

// 1 · register (D18) — one screen: photo, name, gender, birthdate, the data-treatment
// box. The session token is NOT in the payload; it is born here as the httpOnly cookie.
// The photo rides the same FormData and is judged by the use case (JPEG/PNG/WebP, ≤ 1 MiB).
export const RegisterInput = z.object({
  room: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  gender,
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // 18 ≤ age ≤ 100, checked in the domain
  dataConsent: z.literal("on"),                         // absent when unticked (#49)
});

// consent — no payload at all (D18): the three flags are written `true` by the
// registration itself, and no screen mentions them.
// declared round — no payload at all (D20): not asked; the columns stay null.
// gates — no payload (D18): not asked; `mvp-defaults.ts` derives what the engine wants.

// 2 · one block answer — ×15. `leastKey` is read only under HOOKAI_QUIZ_MOST_LEAST=1,
// and the flag is read on the server, never from the form.
export const AnswerBlockInput = z
  .object({
    position: z.number().int().min(1).max(15),
    mostKey: optionKey,
    leastKey: optionKey.nullable(),
    shownOrder: z.string().regex(/^[abcd]{4}$/),
  })
  .refine((r) => r.leastKey !== r.mostKey, { message: "leastKey must differ from mostKey" })
  .refine((r) => new Set(r.shownOrder).size === 4, { message: "shownOrder is a permutation of abcd" });
```

What the server derives and stores per answer — none of it comes from the client:

```ts
{
  participantId: fromCookie("dipia_session"),
  instrumentVersion: INSTRUMENT.version,                  // "v1"
  position, mostKey, leastKey, shownOrder,                // as received
  scenario: block.scenario,                               // block = generated_blocks row for (participantId, position)
  mostText: block.options.find((o) => o.key === mostKey).text,
  leastText: leastKey ? block.options.find((o) => o.key === leastKey).text : null,
  answeredAt: now,
}
```

The composite, for reading the whole thing as one object (it is never submitted as one —
the form is sixteen submissions, and the database fills step by step):

```ts
export const IntakeSubmission = z.object({
  register: RegisterInput,
  answers: z
    .array(AnswerBlockInput)
    .max(15)
    .refine((a) => new Set(a.map((x) => x.position)).size === a.length, {
      message: "one answer per block",
    }),
});
```
