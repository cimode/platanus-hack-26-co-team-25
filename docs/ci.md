# CI/CD

One workflow: `.github/workflows/ci.yml`. Runs on every PR and on push to `main`.

## Jobs

Six checks fan out in parallel from a shared npm cache. Wall clock ~90s.

| Job | Runs | Gates merge |
| --- | --- | --- |
| `typecheck` | `next typegen && tsc --noEmit` | ✅ |
| `biome` | `biome check .` — format + lint + imports, incl. the `next`, `react`, `tailwind` and `test` rule domains | ✅ |
| `audit` | `npm audit --audit-level=high` | ✅ |
| `unit` | `vitest run --coverage`, posts a coverage comment | ✅ |
| `build` | `next build` | ✅ |
| `e2e` | `playwright test` | ✅ |
| `deploy-preview` | Vercel preview, PR only | ❌ |
| `deploy-production` | Vercel production, `main` only | ❌ |

**Concurrency:** a new push to the same ref cancels the in-flight run. No queue
of stale red checks while three people iterate.

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
  npx playwright test --update-snapshots
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
   npx vercel link          # choose your PERSONAL scope (Hobby), name it "hookai"
   cat .vercel/project.json # -> projectId, orgId
   ```

   When `vercel link` asks for a scope, pick your own username, **not** a team.

2. Create a token at <https://vercel.com/account/tokens>.

3. Add three repository secrets under **Settings → Secrets and variables →
   Actions**:

   | Secret | Value |
   | --- | --- |
   | `VERCEL_TOKEN` | the token from step 2 |
   | `VERCEL_ORG_ID` | `orgId` from step 1 |
   | `VERCEL_PROJECT_ID` | `projectId` from step 1 |

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
