---
name: data-access
description: "Trigger: database, schema, table, migration, drizzle, repository, persistence, query, save, store, participant data. How persistence is shaped and how it reaches a use case in the hookai hexagon."
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
// src/lib/ports/participants.ts — owned by the core
export interface ParticipantRepository {
  save(participant: NewParticipant, responses: BlockResponse[]): Promise<void>;
  byRoom(roomId: RoomId): Promise<Participant[]>;
}

// src/lib/use-cases/submit-intake.ts — depends on the port
export async function submitIntake(
  input: IntakeSubmission,
  deps: { participants: ParticipantRepository }
): Promise<ParticipantId> { … }

// src/lib/adapters/db/participant-repository.ts — implements it with Drizzle
// src/lib/composition.ts — wires the two together
```

**A repository never returns a Drizzle row type.** It returns a domain type
defined in `src/lib/domain/`. Returning the row leaks the schema into the core
and every column rename becomes a domain change.

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
  db.insert(participants).values(p),
  db.insert(responses).values(rows),
]);
```

Intake writes a participant plus fifteen block responses. A half-written
participant appearing in a room ranking is a visible failure on stage, so that
write is one `batch`, always.

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

- `pnpm run db:push` while the schema is molten, against a **dev branch**
  (`neon checkout dev-…`). Never `push` at the branch holding real responses.
- `db:generate` + `db:migrate` once the shape settles.
- Select the columns you need. `select *` is billed egress on Neon, and the
  room view reads every participant.
- No N+1. One query per screen where possible; the room ranking loads the room.

## Hard Rules

1. A use case may not name a Drizzle type. Depend on a port.
2. A repository returns domain types, never Drizzle rows.
3. Never `db.transaction()`. Use `db.batch()`.
4. Never a serial primary key.
5. Every table exports a derived insert schema beside it.
6. Never `push` against a branch holding real intake responses.
