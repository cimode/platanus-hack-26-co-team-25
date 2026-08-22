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
two files, `db:push` migrates one branch while the app queries another — and the
symptom is a missing table, not an error that names the cause. One file avoids
it. `.env*` is gitignored except the committed `.env.example`.

`getDb()` reads the variable lazily, so `next build` prerenders with no database
configured. CI needs no new secret.

## Commands

| Command | Does |
| --- | --- |
| `pnpm run db:push` | Push the schema straight to the branch — **use this during the hack** |
| `pnpm run db:generate` | Emit a versioned migration into `drizzle/` |
| `pnpm run db:migrate` | Apply pending migrations |
| `pnpm run db:check` | Detect conflicting/corrupt migration history |
| `pnpm run db:studio` | Browse the data |

**Use `push` while the schema is molten**, against a dev branch — no migration
files to review at hour 20. Switch to `generate` + `migrate` once the shape
settles, and never `push` at the branch holding real intake responses. `strict`
and `verbose` are on in `drizzle.config.ts`, so a destructive statement prints
and asks first.

## Branch-first flow

A Neon branch is a copy-on-write clone. Take one whenever you would take a git
branch, so a bad `push` costs a branch instead of the room's responses:

```bash
neon link                     # once per checkout; also pulls the branch env
neon checkout dev-add-quiz    # per feature; creates it if new, pulls env
neon diff                     # schema diff against the parent before committing
```

The CLI is `neon` (`pnpm add -g neon`) — *not* the older `neonctl`.
