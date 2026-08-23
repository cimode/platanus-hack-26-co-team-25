# Testing dipia

dipia is a **non-deterministic LLM wrapped in deterministic mechanics**. Those are two
unrelated testing problems, and conflating them is how a 36-hour team wastes an afternoon.

| Layer        | Question it answers                                                                           | Tool                          | In CI?        |
| ------------ | --------------------------------------------------------------------------------------------- | ----------------------------- | ------------- |
| Engine       | Is the maths right? Is the ordering right? Does the coherence validator catch contradictions? | Vitest                        | ✅            |
| LLM contract | Does the model's output parse, and hold its invariants?                                       | Vitest + recorded fixtures    | ✅            |
| LLM quality  | _How good_ is the output? Coherence rate, ranking stability, latency.                         | Evals (scored, not pass/fail) | ❌ on demand  |
| Demo path    | Does the flow that runs on stage still work?                                                  | Playwright                    | ✅            |
| Design drift | Does `/design` still look right?                                                              | Playwright snapshots          | ❌ macOS only |

## Commands

| Command                | Does                                              |
| ---------------------- | ------------------------------------------------- |
| `pnpm test`            | Vitest once                                       |
| `pnpm run test:watch`  | Vitest in watch mode                              |
| `pnpm run test:cov`    | Coverage over `src/lib/**`                        |
| `pnpm run test:e2e`    | Playwright, on **:3000** — reuses a running `pnpm run dev` |
| `pnpm run test:e2e:ui` | Playwright UI mode — best for debugging a flake   |
| `pnpm run verify`      | typecheck → lint → format:check → Vitest          |

`verify` deliberately excludes E2E: it needs a build and a browser, which is CI's job.

## Where each check runs

Three rings, deliberately different. The principle: **pre-commit is about the feature in
front of you; CI is about the whole project.**

| Check                          | Pre-commit                       | CI (PR)                  | Gates merge     |
| ------------------------------ | -------------------------------- | ------------------------ | --------------- |
| Biome `check` (format + lint + imports + next/react/tailwind domains) | staged files | whole project | ✅ |
| Vitest                         | **related to staged files only** | full suite               | ✅              |
| `tsc --noEmit`                 | —                                | whole project            | ✅              |
| `next build`                   | —                                | whole project            | ✅              |
| Playwright E2E                 | —                                | full suite               | ✅              |
| Visual snapshots               | local, on demand                 | skipped (Linux)          | ❌              |
| Coverage                       | **never**                        | reported as a PR comment | ❌ no threshold |
| Evals                          | —                                | —                        | ❌ manual       |

`vitest related` walks the module graph, so editing `src/lib/ports/llm.ts` runs every suite
that imports it transitively, and nothing else. Editing a file with no tests exits 0 rather
than blocking the commit. Measured: ~3.4s with related tests, ~2.7s without.

**Coverage is never computed locally and never gates a merge.** A percentage threshold in a
36-hour build has two outcomes: it blocks a legitimate PR at hour 30, or someone lowers it
until it asserts nothing. It is reported so the trend is visible. If a gate is ever wanted,
put it on `src/lib/engine/**` alone -- the only place the number means anything.

## The rule that makes any of this possible

**Engine functions take the LLM as a parameter. They never import an SDK.**

```ts
// untestable
async function generateTimeline(a: Profile, b: Profile) {
  const res = await anthropic.messages.create({ ... });
}

// testable
async function generateTimeline(a: Profile, b: Profile, deps: { llm: LlmPort });
```

If a module under `src/lib/` imports an SDK, it is not an engine module. Beyond testing,
this is what lets the engine run headless from a CLI — which is how you iterate on prompts
without clicking through the UI.

The seam is `src/lib/ports/llm.ts`; see `docs/architecture.md`.

## Testing against the model

Three fakes, in `src/lib/adapters/llm/fake.ts`:

| Fake                         | Use when                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| `createFixtureLlm(fixtures)` | "Does the engine handle **real** model output?" Replays recorded responses. |
| `stubLlm({ id: value })`     | "Does the engine handle **this**?" Empty results, boundaries, weird shapes. |
| `failingLlm()`               | "What happens when the model is down?"                                      |

All three **validate against the zod schema before returning**. That is the important part:
when a schema changes, every fixture describing the old shape fails loudly instead of
quietly lying.

### Fixtures

Recorded once from the real API, committed, replayed forever. Deterministic, free, offline.

Each fixture stores a `promptHash`. When the live prompt drifts from the recording, the fake
warns — because the failure mode of recorded fixtures is that they silently describe a prompt
you no longer send. Configurable per test:

```ts
createFixtureLlm(fixtures, { onPromptDrift: "throw" }); // strict
createFixtureLlm(fixtures, { onPromptDrift: "ignore" }); // while iterating on prompts
```

**Re-record whenever a prompt changes meaningfully.** A stale fixture suite is worse than
none, because it is green.

## Evals are not tests

A coherence score of 0.85 is not pass/fail. Putting it in CI leads to one of two bad
outcomes: a permanently red build everyone ignores, or a threshold lowered until it asserts
nothing.

Evals belong in a separate script that prints a scored report — coherence rate across N
generated timelines, ranking stability across repeated runs, p95 latency. Run them when you
change a prompt, read the number, decide.

## E2E

Playwright boots its own dev server on **:3000** — the same port as `pnpm run dev`, on
purpose: Next 16 refuses a second dev server for the same directory whatever the port, so
locally `reuseExistingServer` picks up a running one instead of fighting it. Before any test
runs, `e2e/global-setup.ts` creates the `e2e-<run>` room the intake specs register into.
It is guarded the same way as the Vitest integration suites (`src/lib/adapters/db/test-db.ts`):
with no `DATABASE_URL` it prints one `::warning` and creates nothing, and the specs that need
the room (`e2e/intake.spec.ts`) skip on that same variable while the page-only safety tests
keep running. `DB_REQUIRED=1` makes the missing database a failure instead — CI sets it on
every run that got a migrated Neon branch (#5), so there the skip can never hide a
regression; on a repo with no `NEON_API_KEY` the suite runs without it and skips, rather
than the whole job disappearing.

Two projects, both Chromium:

- **mobile** — 390×844 @2x, matching the design brief's target and how the reference
  screenshots were captured
- **desktop** — 1280×900 @2x, for the projected room view

WebKit is deliberately not installed. These snapshots test design tokens, not browser
engines, and WebKit is another ~90MB in CI. If iOS-specific rendering bugs appear, add a
webkit project and run `pnpm exec playwright install webkit` — do not chase them with snapshots.

### Visual snapshots are macOS-only

Playwright namespaces snapshots by platform (`brand-desktop-darwin.png`) and Linux renders
fonts differently, so every snapshot would fail in GitHub Actions with no real regression.
Pixel comparisons are gated behind `!process.env.CI`; the behavioural assertions in the same
file run everywhere.

To enable them in CI, generate Linux baselines in the Playwright container and commit them:

```bash
docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.62.1-noble \
  ./node_modules/.bin/playwright test --update-snapshots
```

Accepting an intentional design change:

```bash
pnpm run test:e2e -- --update-snapshots
```

Then **look at the diff** before committing. A snapshot updated without review is worse than
no snapshot.

### Two E2E tests worth more than the snapshots

`e2e/design-system.spec.ts` asserts the _mechanism_, not the appearance:

- **each lens recolours its subtree** — all four contexts (pre-lens cyan + three lenses) must
  resolve `--primary` to four distinct values. If this breaks, every screen silently loses
  its accent.
- **the app is light-only** — `globals.css` still declares the `dark` variant (the shadcn primitives carry 44 `dark:` utilities and an undeclared variant fails the build), but nothing may apply the class. If it ever lands on `<html>`, every surface inverts and nobody
  notices until it is projected.

## Acceptance criteria become tests

`e2e/demo-path.spec.ts` is a checklist, not dead code. Each `test.skip` names the screen it
waits on and lists the acceptance criteria to assert. When the screen lands, delete one word.

The safety invariants are already written down as skipped tests, before the features exist:

- a ranking is visible only to the person who ran it
- only mutual matches appear in the public room view

Those are the two that matter most when you are ranking real people by romantic
compatibility in front of them, so they were worth writing first.

Keep E2E assertions **behaviour-level** — roles and visible text, not class names. The design
is still being iterated externally, and a test that breaks on a `className` change is a test
the team will delete.

### Where those criteria come from

Issues are the source. `/intake` turns a rough description into one spec issue **and** its
skipped stubs in the same change, so a criterion is executable the moment it is written
rather than after someone re-reads the issue. The format is
`.github/ISSUE_TEMPLATE/spec.md`; the rules live in `.claude/commands/intake.md`.

The join key is the AC id. It appears verbatim in the issue and verbatim at the front of
the test name, so traceability is a `grep`:

```bash
grep -rn "AC-2" e2e src
```

```yaml
- id: AC-2
  kind: sad            # happy | sad | edge | safety
  file: e2e/intake.spec.ts
  given: a participant who answered all 15 blocks but attached no photo
  when: they submit
  then: submission is blocked with a visible reason and nothing is persisted
```

Three rules earn their keep:

- **Happy, sad and edge are all required.** A feature whose sad path nobody can describe is
  not understood yet. `failingLlm()` and `stubLlm()` exist precisely to make the sad ones
  cheap to write.
- **`file` picks the layer at spec time.** `src/**/*.test.ts` for engine logic,
  `e2e/*.spec.ts` for anything a participant sees — decided by whoever writes the spec, not
  by whoever happens to pick it up.
- **`kind: safety` stubs are never skipped.** They land as running tests asserting the
  invariant holds, vacuously at first. Everything else in this file argues for writing tests
  before features; this is the case where a skipped test is actively dangerous, because it
  reads green while guarding nothing.

An issue must not be opened with unanswered questions — that is a conversation, not a spec.
If one surfaces mid-build, the `issue-status` skill moves it back to `status:draft` with the
question in a comment, rather than someone guessing.

### Status and readiness

Five mutually exclusive labels, `status:draft → approved → in-progress → review → completed`.
Agents own only `start` and `block` (the `issue-status` skill); PR-opened and merged are
driven by `.github/workflows/issue-status.yml`, because a workflow fires even when a human
opens the PR or an agent dies mid-task.

```bash
pnpm run issues:ready
```

Readiness is computed, never stored — a `blocked` label would go stale the moment a
dependency closed. It reports what is approved with dependencies met, and warns when a
candidate's **Files affected** table overlaps something already in progress. Declared
dependencies catch ordering; the files table catches the merge conflicts nobody declared.

### Building against those tests

`/work #12` takes an approved spec to an open PR through four subagents, each
with its own definition in `.claude/agents/`:

| Stage | Agent | Model | Ends with |
| --- | --- | --- | --- |
| 1 | `test-writer` | opus | Every AC has a test, and every one **fails on an assertion** |
| 2 | `code-writer` | opus | `pnpm run verify` green, no test file touched |
| 3 | `tester` | sonnet | Green, or a failure routed with a reason |
| 4 | `adversarial-reviewer` | fable | A PR, or findings back to stage 2 |

Three rules make it more than ceremony:

- **Only stage 1 may write to a test file.** Stages 2 and 3 are forbidden from
  touching one, because the cheap way out of a red suite is always to soften the
  test, and it is always wrong. Stage 3 may route a test back to stage 1 only by
  **quoting the AC** and naming how the test diverges from it. Absent that, the
  test stands and the code is wrong.
- **The red phase must fail for the right reason.** A test failing with
  `Cannot find module` proves a path was misspelled, nothing more. Stage 1
  writes the signatures too — bodies throwing `not implemented` — so every
  failure is an assertion the implementation has to earn.
- **The loop is bounded.** Stages 3 and 4 both route back to stage 2, at most
  three times. On the fourth the issue goes back to `status:draft` with the
  reason, because each extra pass is patching the previous pass's patch.

Parallel issues each get their own git worktree, created by `/work` rather than
by the Workflow tool's per-agent `isolation` option — all four stages have to
share one checkout, or stage 2 receives a tree without stage 1's tests in it.
