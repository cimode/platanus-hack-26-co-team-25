# Database

Lakebase Postgres on Neon (project `hookai`, `aws-us-east-2`, PG 18), accessed
through **Drizzle** over the `neon-http` driver.

## Why Drizzle

Three reasons specific to this repo, not a general preference:

1. **No codegen in the critical path.** `typecheck` already had to grow
   `next typegen` because a clean checkout lacked generated types (see
   `docs/ci.md`). Prisma would reintroduce that at larger scale: `prisma
   generate` before `tsc --noEmit`, before `next build`, before Vitest, and
   before the `vitest related` pre-commit hook — four CI jobs and a git hook,
   each with a stale-generation failure mode. A Drizzle schema *is* TypeScript.
2. **zod 4 is already the vocabulary.** `LlmPort` validates every model response
   through `z.ZodType<T>`. `drizzle-zod` derives insert/select/update schemas
   from the same table definitions, so DB shapes and LLM contracts are checked
   by one library. Hand-written zod next to a table is zod that will drift.
3. **The handle is a value, not a singleton.** Which is what lets engine
   functions keep taking their dependencies as parameters.

## The rule

Same one `docs/testing.md` sets for the LLM:

> If a module under `src/lib/` imports an SDK, it is not an engine module.

```ts
// engine module — takes the handle
async function rankRoom(room: RoomId, deps: { db: Db; llm: LlmPort });
```

`getDb()` lives in `src/lib/adapters/db/client.ts` and is called from exactly
one place: `src/lib/composition.ts`. Use cases receive `db` as a parameter and
`biome.json` fails the build if anything inside the hexagon imports an adapter
directly. See `docs/architecture.md`.

## Environment

**`DATABASE_URL` lives in `.env`, not `.env.local`.** drizzle-kit bundles dotenv
and reads only `.env`; Next.js reads both but prefers `.env.local`. Split across
two files, a migration lands on one branch while the app queries another — and
the symptom is a missing table, not an error that names the cause. One file
avoids it. `.env*` is gitignored except the committed `.env.example`.

`getDb()` reads the variable lazily, so `next build` prerenders with no database
configured. `drizzle.config.ts` carries `dbCredentials` **only when
`DATABASE_URL` is set** (`docs/domain.md` D8), which is what lets `db:generate`
and `db:check` run in a fresh checkout, in CI, and in the build job — none of
which has a branch of its own. `db:migrate` still fails loudly there, because
drizzle-kit needs credentials it was not given.

Vitest does not read `.env` either, so `vitest.config.mts` calls
`process.loadEnvFile(".env")` inside a `try`. Without it the integration suites
under `src/lib/adapters/db/` would skip silently on a laptop that *has* a
database configured.

## Commands

| Command | Does |
| --- | --- |
| `pnpm run db:generate` | Emit a versioned migration into `drizzle/` — **the only way the schema changes** |
| `pnpm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm run db:check` | Detect conflicting/corrupt migration history; needs no database |
| `pnpm run db:seed` | Create the demo room if absent. That is all it does |
| `pnpm run db:studio` | Browse the data |

**There is no `db:push`.** It was deleted from `package.json` and from this file
(`docs/domain.md` D8). A pushed schema has no history, so it cannot replay on a
fresh CI branch, cannot be reviewed in a diff, and cannot tell you what the
branch holding real intake responses is actually running. Every schema change is
three steps, in this order:

```bash
pnpm run db:generate     # writes drizzle/NNNN_<name>.sql + drizzle/meta/
git add drizzle          # committed WITH the schema change that produced it
pnpm run db:migrate      # applies it to the branch in .env
```

The migration file and the `schema/` change are one commit. A migration that
lands in a later commit than its schema is a commit that does not build a
database. `strict` and `verbose` stay on in `drizzle.config.ts`, so a
destructive statement prints and asks first.

## Branch-first flow

A Neon branch is a copy-on-write clone. Take one whenever you would take a git
branch, so a bad migration costs a branch instead of the room's responses:

```bash
neon link                     # once per checkout; also pulls the branch env
neon checkout dev-add-quiz    # per feature; creates it if new, pulls env
neon diff                     # schema diff against the parent before committing
```

The CLI is `neon` (`pnpm add -g neon`) — *not* the older `neonctl`.

`docs/domain.md` §8 has the CI shape: one PII-free `ci-base` parent, a
`preview/pr-<n>` branch per pull request reset to parent before use, and
`migrate-production` as the only job that can see production's URL.

## Reading answers with their questions

Each `quiz_responses` row is self-describing (`docs/domain.md` D15/D16, §3), so nobody needs
the code — or a join — to read what a person was asked:

```sql
select position, scenario, most_text, least_text
from quiz_responses
where participant_id = '…'
order by position;
```

`scenario`, `most_text` and `least_text` are written by `ResponseRepository.save`, resolved
from **that participant's** `generated_blocks(participant_id, position)` row at write time —
under D16 each person answers their own generated form, so the constant in
`src/lib/domain/quiz/` is not what they saw. `instrument_version` on the row is
`INSTRUMENT.version`, the *structural* version (15 positions, the 4/4/4/3 rotation), not the
scenarios. `least_text` is null exactly when `least_key` is (the single-pick fallback), and
`pillar`/`keyed` are deliberately absent — they stay inside `generated_blocks.options`, so
reading the answers never puts the scoring key in front of the reader.

`save` **rejects** when the participant has no block at that position, or when the key is one
that block never offered: an answer to a block nobody was shown is a bug, not a degraded
mode. Any fixture, seed or script that writes responses must therefore write the blocks first
(`GeneratedBlockRepository.saveBatch`).

## Integration tests

The suites under `src/lib/adapters/db/` need a migrated branch. One helper,
`src/lib/adapters/db/test-db.ts`, decides whether they can run:

| `DATABASE_URL` | `DB_REQUIRED` | `integrationDb()` |
| --- | --- | --- |
| set | — | `{ mode: "run", db }` — no connection opened until a query |
| unset | unset | `{ mode: "skip", notice }` — the notice names the variable |
| unset | `1` | throws — CI never goes green over tests that touched no table |

They build their own `it-<runId>` room through `RoomRepository.create()` and
delete it on teardown; the cascade removes everything beneath it. Nothing
automated ever touches `platanus-hack-26-bogota`.
