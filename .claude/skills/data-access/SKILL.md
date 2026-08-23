---
name: data-access
description: "Trigger: database, schema, table, migration, drizzle, repository, persistence, query, save, store, participant data. How persistence is shaped and how it reaches a use case in the dipia hexagon."
license: Apache-2.0
metadata:
  version: "1.0"
---

## Activation Contract

Governs `src/lib/ports/*-repository.ts` and everything under
`src/lib/adapters/db/`. Read `docs/architecture.md` and `docs/database.md`
first; this skill decides the things those two leave open.

## 1. Use cases depend on repository ports, never on Drizzle

A use case may **not name a Drizzle type**. This is not a preference — it is
already mechanically true, and you will hit it as a lint error:

```
src/lib/use-cases/…  × Dependencies point inward. The core defines ports;
                       adapters implement them. Take what you need as a parameter.
```

`biome.json` blocks `src/lib/{domain,use-cases,ports}/**` from importing
`**/adapters/**`, `**/composition`, or any SDK. So `Db` and `Deps` are
unreachable from inside the hexagon, by design.

The shape:

```ts
// src/lib/ports/response-repository.ts — owned by the core
export interface ResponseRepository {
  save(response: BlockResponse, opts?: { completedAt: Date }): Promise<void>;
  //  upserts on (participant_id, position); when `completedAt` is given — the
  //  15th distinct position — the SAME db.batch() sets
  //  participants.quiz_completed_at, so a participant can never hold fifteen
  //  responses and no completion timestamp
  byParticipant(id: ParticipantId): Promise<BlockResponse[]>;
}

// src/lib/use-cases/answer-block.ts — depends on the port
export async function answerBlock(
  input: BlockAnswer,
  deps: { responses: ResponseRepository }
): Promise<QuizProgress> { … }

// src/lib/adapters/db/response-repository.ts — implements it with Drizzle
// src/lib/composition.ts — wires the two together
```

Note the shape of that signature: the *caller* decides that this response
completes the set and passes `completedAt`; it never follows up with a second
`markQuizCompleted` call. A port method that needs two calls to leave the data
consistent is a port method with a half-written state between them.

**A repository never returns a Drizzle row type.** It returns a domain type
defined in `src/lib/domain/`. Returning the row leaks the schema into the core
and every column rename becomes a domain change. `byRoom()` returns
`RoomMember` — id, name, photoUrl — because what the type cannot carry, no
serialiser downstream can leak.

## 2. Atomic writes use `batch()`. `transaction()` throws.

Verified against the installed driver, at runtime:

```
db.transaction(...)  →  Error: No transactions support in neon-http driver
db.batch([...])      →  works
```

`db.transaction()` is the idiomatic Drizzle API and it will **throw in
production**, not fail at compile time. Never write it. Neon runs a `batch()`
as a single non-interactive transaction in one HTTP round trip, which is the
atomicity you want:

```ts
await db.batch([
  db.insert(quizResponses).values(answer).onConflictDoUpdate({ … }),
  db.update(participants).set({ quizCompletedAt }).where(eq(participants.id, id)),
]);
```

There are exactly three batched writes in this codebase (`docs/domain.md` §7),
and each one exists because the rows it touches are meaningless apart:

| Batch | Statements | What a partial write would mean |
| --- | --- | --- |
| `participants.create` | insert participant + insert `participant_sessions` row | a participant nobody can log back in as, or a credential pointing at nothing |
| `participants.saveDeclared` | update the six bands + delete acquaintances + (conditionally) insert them | a declared round whose acquaintance list is half the old one and half the new |
| `responses.save(r, { completedAt })` | upsert the 15th response + set `quiz_completed_at` | fifteen responses and no completion timestamp, or a timestamp with fourteen |

The conditional insert in `saveDeclared` is conditional because an empty
`values()` throws; the update keeps the batch non-empty either way.

Everything else is a single statement. A per-block response upsert does **not**
need a batch — wrapping one statement in a transaction buys nothing and costs a
round trip on venue wifi.

If a call site genuinely needs interactive transaction semantics — reading a
value mid-transaction and branching on it — that call site needs the
`neon-serverless` (WebSocket) driver. Raise it rather than working around it.

## 3. Ids are generated so `batch` is possible

`batch` is **non-interactive**: statements cannot read each other's results, so
you cannot insert a participant, read its generated id, and use that id for the
child rows within one batch.

Therefore:

- Column: `uuid` primary key, default `uuidv7()`. Postgres 18 has it natively —
  verified on this project's branch.
- When a batch needs the parent id up front, **generate it in the application**
  with `crypto.randomUUID()` and pass it explicitly. It is v4 rather than v7, so
  it is not time-sortable; `created_at` carries ordering and that is enough.

Never a serial/auto-increment id. Sequential ids in a URL leak how many people
signed up and let anyone enumerate participants. This product ranks real people
by romantic compatibility in public — that is not a cosmetic concern.

## 4. Validators are derived, never written

```ts
export const insertParticipant = createInsertSchema(participants);
```

`drizzle-zod` produces zod 4 schemas from the table, and zod 4 is already what
`LlmPort` validates model output with. A hand-written zod schema beside a table
drifts within a day, and the drift is silent. The intake form's
`@hookform/resolvers` schema comes from the same derivation.

## 5. Migrations and queries

**`db:push` does not exist** (`docs/domain.md` D8). Every schema change is
generate → commit → migrate, in that order and in one commit:

```bash
pnpm run db:generate     # drizzle/NNNN_<name>.sql + drizzle/meta/
git add drizzle src/lib/adapters/db/schema
pnpm run db:migrate      # applies it to the branch in .env
```

A pushed schema has no history, so it cannot replay on a fresh CI branch and
cannot be reviewed in a diff. `db:generate` and `db:check` need no database —
`drizzle.config.ts` carries `dbCredentials` only when `DATABASE_URL` is set —
so "I have no branch right now" is never a reason to skip the migration file.

Queries:

- Select the columns you need. `select *` is billed egress on Neon, and the
  room view reads every participant.
- No N+1. One query per table, joined in memory: `byRoomForRanking` reads
  participants, romantic gates, business gates and acquaintances as four
  statements and assembles them, never one query per person.

## Hard Rules

1. A use case may not name a Drizzle type. Depend on a port.
2. A repository returns domain types, never Drizzle rows.
3. Never `db.transaction()`. Use `db.batch()`.
4. Never a serial primary key.
5. Every table exports a derived insert schema beside it.
6. Never change the schema without `db:generate`; commit the migration with the
   schema change that produced it, then `db:migrate`.
