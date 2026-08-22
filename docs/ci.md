# CI/CD

One workflow: `.github/workflows/ci.yml`. Runs on every PR and on push to `main`.

## Package manager

pnpm, pinned by the `packageManager` field in `package.json`. Corepack locally and
`pnpm/action-setup` in CI both read that one field, so the version that wrote the
lockfile is the version that installs it.

```bash
corepack enable                 # once per machine
pnpm install                    # local -- may update pnpm-lock.yaml
pnpm install --frozen-lockfile  # what CI runs -- fails rather than drifting
```

**Adding a dependency with a postinstall script?** pnpm 10 refuses to run
dependency lifecycle scripts unless the package is listed under
`pnpm.onlyBuiltDependencies`. The install still *succeeds* -- it prints a warning
and hands you a package that silently does not work. The list currently holds
`esbuild` (transitive, via drizzle-kit and vitest) and `lefthook` (its postinstall
fetches the Go binary the git hooks run). Use `pnpm approve-builds` to extend it,
and commit the change.

## Jobs

Seven checks fan out in parallel from a shared pnpm store cache; `unit` and
`e2e` additionally wait on the run's own database branch — they *wait* on it,
they are never *gated* by it (see "When the Neon settings are missing" below).

| Job | Runs | Gates merge |
| --- | --- | --- |
| `typecheck` | `next typegen && tsc --noEmit` | ✅ |
| `biome` | `biome check .` — format + lint + imports, incl. the `next`, `react`, `tailwind` and `test` rule domains | ✅ |
| `audit` | `pnpm audit --audit-level=high` | ✅ |
| `db-check` | `drizzle-kit check` — migration history, **no database** | ✅ |
| `neon-branch` | Creates/resets this run's Neon branch, `db:migrate` + `db:seed` | ✅ (via `unit`/`e2e`) |
| `unit` | `vitest run --coverage` against that branch, posts a coverage comment | ✅ |
| `build` | `next build` | ✅ |
| `e2e` | `playwright test` against that branch (dev server included) | ✅ |
| `neon-branch-delete` | Deletes `ci/main-<run_id>`, `if: always()`, push only | ❌ |
| `migrate-production` | `db:migrate` + `db:seed` on **production**, `main` only | ❌ (blocks the deploy) |
| `deploy-preview` | Vercel preview, PR only | ❌ |
| `deploy-production` | Vercel production, `main` only, after every gate; a *failed* `migrate-production` stops it, a *skipped* one does not | ❌ |

**Concurrency:** a new push to the same ref cancels the in-flight run. No queue
of stale red checks while three people iterate.

## A database per run

`docs/domain.md` §8 is the design; this is what it looks like in the workflow.

| Event | Branch | Parent | Deleted by |
| --- | --- | --- | --- |
| `pull_request` | `preview/pr-<n>` — reused across pushes, **reset to parent** each time | `ci-base` | `neon-branch-cleanup.yml`, on PR close |
| `push` to `main` | `ci/main-<run_id>` — ephemeral | `ci-base` | `neon-branch-delete`, `if: always()` |
| — | `production` | never a parent | never |

`neon-branch` runs first, migrates and seeds; `unit`, `e2e` and
`deploy-preview` each **re-invoke** `create-branch-action@v6` with the same
`branch_name` (which returns the existing branch) to read its pooled URL. The
URL is never a job output: Actions drops any output containing a masked value,
and the action masks the branch password — so only the branch *name* travels
between jobs. When that URL is there, both test jobs run with `DB_REQUIRED=1`,
which turns the integration suites' "no DATABASE_URL, skipping" notice into a
failure (`docs/database.md` → Integration tests): CI can never go green over
tests that touched no table.

The reset only fires when the create step reports `created == 'false'`, i.e.
the branch already existed. That is what stops a rewritten migration on a
re-pushed PR from meeting the schema the previous push left behind.

### When the Neon settings are missing

The branch is an **enhancement, never a gate**. `NEON_API_KEY` and
`NEON_PROJECT_ID` are read by a step-level gate (a secret is unreadable in a
job-level `if:`), exactly like `VERCEL_TOKEN` in the deploy jobs. Without them:

| Job | What happens |
| --- | --- |
| `neon-branch` | Skips its steps, logs a `::notice`, **succeeds** |
| `unit`, `e2e` | Run anyway — `if: ${{ !cancelled() && needs.neon-branch.result != 'failure' }}` — without `DATABASE_URL` and without `DB_REQUIRED`, so the database-backed suites skip themselves and everything else still gates the PR |
| `deploy-preview` | Skips the deploy with a notice: a preview whose every page fails its first query is not worth an alias |
| `neon-branch-delete`, `neon-branch-cleanup.yml` | Skip; the cleanup step is also `continue-on-error`, because a branch that was never created is nothing to clean up |

`needs:` alone would have made it a gate — Actions skips every dependent of a
job that failed or was skipped, so a missing secret silently turned "unit
tests" into "unit tests: skipping" and a PR could merge having run none. That
is the failure mode `!cancelled()` exists to prevent here. A `neon-branch` that
**fails** (a broken migration) does still stop `unit` and `e2e`: the branch it
left behind is not a database anything should be tested against.

**`preview/pr-<n>` is deleted when the PR closes**, in its own workflow, because
`ci.yml` does not run on `closed`. The Neon plan caps how many branches a
project may hold; a merged PR that left its branch behind eventually costs the
next PR its database.

### Production

`migrate-production` is the only job that can see
`secrets.DATABASE_URL_PRODUCTION`, and it `needs` **every** gate —
`typecheck`, `biome`, `audit`, `db-check`, `unit`, `build`, `e2e`. A gate it
did not wait on would be a migration that can outrun a failing check.

It **fails** when the secret is empty rather than skipping the way the deploy
jobs do (first step: "Refuse to migrate without DATABASE_URL_PRODUCTION"). A
repo with no `VERCEL_TOKEN` simply does not deploy, which is harmless; a
production deploy that silently skipped its migration ships code against a
table that is not there. `deploy-production` waits on it, so that failure stops
the deploy too — **a push to `main` without `DATABASE_URL_PRODUCTION` is a red
build that does not deploy**, by design.

`deploy-production` spells out every gate in its own `needs` and `if:` rather
than inheriting them through `migrate-production`. It has to: `!cancelled()` —
which is what lets a *skipped* `migrate-production` through — also switches off
Actions' implicit "every need succeeded". The rule it encodes is: deploy when
every check is green and the migration did not fail.

## Actions settings

Under **Settings → Secrets and variables → Actions**. Every one of them has a
skip-gate, so a repo that has none of them still runs the whole pipeline; what
they buy is what the pipeline can *prove*. `DATABASE_URL_PRODUCTION` is the
exception and deliberately so: a push to `main` without it fails at
`migrate-production` rather than deploying unmigrated code.

| Name | Kind | Value |
| --- | --- | --- |
| `NEON_PROJECT_ID` | variable | `floral-bread-20641106` |
| `NEON_API_KEY` | secret | Neon → Account settings → API keys |
| `DATABASE_URL_PRODUCTION` | secret | **pooled** connection string of the `production` branch |
| `VERCEL_TOKEN` | secret | <https://vercel.com/account/tokens> |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | variables | `.vercel/project.json` |

Add them in this order:

1. `NEON_PROJECT_ID` and `NEON_API_KEY` — without them every run still goes
   green, but nothing it ran touched a table.
2. Create `ci-base` by hand (`docs/database.md` → "The CI branches"). Nothing
   automated works until the parent exists — add it in the same sitting as
   step 1, because `NEON_API_KEY` with no `ci-base` is the one combination that
   *does* go red: `neon-branch` then fails on a parent that is not there.
3. `DATABASE_URL_PRODUCTION` — only `migrate-production` reads it, and only on
   `main`, but a push to `main` without it is a red build by design.

### Vercel environments (manual, and deliberately so)

Not automated — three clicks that must be got right once, in the Vercel
dashboard under **Settings → Environment Variables**:

| Environment | Holds |
| --- | --- |
| Production | `DATABASE_URL` (production's pooled URL) and `BLOB_READ_WRITE_TOKEN` |
| Preview | **neither** — no `DATABASE_URL` at all |

Preview deployments receive their database per deployment:
`vercel deploy --prebuilt -e DATABASE_URL=…` sets the deployment's run-time
environment from the PR's own Neon branch. Putting production's URL in the
Preview environment would hand every preview — and every PR from anyone — the
room's real names, photos and consent flags (`docs/domain.md` §3, §5).

## What CI catches today

Being honest about the thin spots, because two rows look better than they are:

| Fully covered | Thin |
| --- | --- |
| Type errors, formatting, import order | **E2E covers only `/` and `/design`** — the demo-path specs are still skipped, so a broken intake flow is not caught because intake does not exist yet |
| Raw hex, unknown Tailwind classes, conflicting classes | **Visual regression contributes nothing** — see below |
| Unawaited promises (`noFloatingPromises`) | Coverage is 96% of 50 statements: a number, not a signal |
| Next Core Web Vitals | |
| Build + prerender of all routes | |

### Visual snapshots do not gate CI

Playwright namespaces snapshots by platform (`brand-desktop-darwin.png`) and
Linux renders fonts differently, so all 18 baselines would fail in Actions with
zero real regressions. The pixel assertions skip themselves when `CI` is set;
the behavioural assertions in the same spec still run.

To make them gate, generate Linux baselines in the Playwright container and
commit them:

```bash
docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.62.1-noble \
  ./node_modules/.bin/playwright test --update-snapshots
```

## Coverage

Reported as a sticky PR comment, scoped to `src/lib/**`. **No threshold.** A
coverage gate in a 36-hour build either blocks a legitimate PR at hour 30 or
gets lowered until it asserts nothing. If a gate is ever wanted, put it on
`src/lib/engine/**` alone — the only path where the number means anything.

## Deploy — one-time setup required

Vercel's Git integration needs its GitHub App installed on the `platanus-hack`
org, which only the organisers can do. So **this repo cannot be imported in the
Vercel dashboard** — that is what the root README is warning about.

Deploying from CI with a token sidesteps it entirely: Vercel becomes a deploy
target of the pipeline rather than a GitHub-integrated app, and **no mirror repo
is needed**. Preview per PR, production on `main`.

Until `VERCEL_TOKEN` exists, both deploy jobs succeed with every step skipped
and log a notice — CI stays green rather than red while waiting on setup.

### To enable it

1. Create the Vercel project (once, locally):

   ```bash
   pnpm dlx vercel link          # choose your PERSONAL scope (Hobby), name it "hookai"
   cat .vercel/project.json # -> projectId, orgId
   ```

   When `vercel link` asks for a scope, pick your own username, **not** a team.

2. Create a token at <https://vercel.com/account/tokens>.

3. Add three entries under **Settings → Secrets and variables → Actions** —
   one secret, two variables (the workflow reads the IDs as `vars.`):

   | Name | Kind | Value |
   | --- | --- | --- |
   | `VERCEL_TOKEN` | secret | the token from step 2 |
   | `VERCEL_ORG_ID` | variable | `orgId` from step 1 |
   | `VERCEL_PROJECT_ID` | variable | `projectId` from step 1 |

   Both IDs come out of `.vercel/project.json`. **Do not hand-copy a team ID
   here.** This project deploys on a **Hobby (personal) scope**, where `orgId`
   is your personal account ID -- not a `team_...` value. Picking the wrong
   scope during `vercel link` is the usual cause of a 403 from the deploy step.

4. Push. The preview URL is commented on the PR.

`.vercel/` is gitignored — it holds local link state, not shared config.

Once production has deployed once, put that URL in `deploy-url` in
`platanus-hack-project.jsonc`, which is still `<FILL THIS>`.

## Hobby plan — the one limit that can bite this product

Deploying on Hobby is fine for CI and for the demo, with one caveat worth
knowing before the engine is written rather than after.

**Function duration is capped lower on Hobby than on Pro**, and hookai's
workload is exactly the shape that hits a duration ceiling: generating a full
timeline of canonical events, then an offspring image, inside one request. A
single blocking route handler that waits for all of it is the risky design on
any plan and especially here.

Two mitigations, both of which you want regardless of plan:

1. **Stream.** Send canonical events to the client as they are produced rather
   than after the last one. This also happens to be the better product -- the
   timeline arriving beat by beat is the demo, per the choreography ask in
   `docs/design/CLAUDE_DESIGN_BRIEF.md`.
2. **Split the work.** Generate the timeline and the offspring image in separate
   requests, so neither has to fit one budget.

Where to raise the limit if a route still needs longer:

```ts
// src/app/api/simulate/route.ts
export const maxDuration = 60; // seconds; the plan ceiling still applies
```

I did not confirm Hobby's exact ceiling from the docs, and the number has
changed more than once -- check
<https://vercel.com/docs/functions/configuring-functions/duration> against your
plan before relying on a specific value, or just measure it once deployed.

Other Hobby facts that matter less but are worth knowing: one concurrent build
(CI deploys queue rather than run in parallel), and no team members -- only the
account owner can use the dashboard. Neither affects CI, which deploys with a
token.

## Why `typecheck` runs `next typegen` first

`LayoutProps<"/">` and `PageProps` are **generated** into `.next/types` by Next's
typed routes. A fresh checkout has no `.next/`, so `tsc --noEmit` alone fails with
`Cannot find name 'LayoutProps'` — which passes locally only because you have
already built. `next typegen` takes about a second and makes the check behave
identically on a clean clone, in CI, and on your machine.

## Node version

Pinned in `.nvmrc` to major `24` — not an exact patch, since `setup-node` would
otherwise download a specific build that may not be prebuilt for the runner.
