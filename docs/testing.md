# Testing hookai

hookai is a **non-deterministic LLM wrapped in deterministic mechanics**. Those are two
unrelated testing problems, and conflating them is how a 36-hour team wastes an afternoon.

| Layer        | Question it answers                                                                           | Tool                          | In CI?        |
| ------------ | --------------------------------------------------------------------------------------------- | ----------------------------- | ------------- |
| Engine       | Is the maths right? Is the ordering right? Does the coherence validator catch contradictions? | Vitest                        | ✅            |
| LLM contract | Does the model's output parse, and hold its invariants?                                       | Vitest + recorded fixtures    | ✅            |
| LLM quality  | _How good_ is the output? Coherence rate, ranking stability, latency.                         | Evals (scored, not pass/fail) | ❌ on demand  |
| Demo path    | Does the flow that runs on stage still work?                                                  | Playwright                    | ✅            |
| Design drift | Does `/design` still look right?                                                              | Playwright snapshots          | ❌ macOS only |

## Commands

| Command               | Does                                              |
| --------------------- | ------------------------------------------------- |
| `npm test`            | Vitest once                                       |
| `npm run test:watch`  | Vitest in watch mode                              |
| `npm run test:cov`    | Coverage over `src/lib/**`                        |
| `npm run test:e2e`    | Playwright, boots its own dev server on **:3100** |
| `npm run test:e2e:ui` | Playwright UI mode — best for debugging a flake   |
| `npm run verify`      | typecheck → lint → format:check → Vitest          |

`verify` deliberately excludes E2E: it needs a build and a browser, which is CI's job.

## Where each check runs

Three rings, deliberately different. The principle: **pre-commit is about the feature in
front of you; CI is about the whole project.**

| Check                          | Pre-commit                       | CI (PR)                  | Gates merge     |
| ------------------------------ | -------------------------------- | ------------------------ | --------------- |
| ESLint (Next + design guards only) | staged files | whole project | ✅ |
| Biome `check` (format + lint + imports) | staged files | whole project | ✅ |
| Vitest                         | **related to staged files only** | full suite               | ✅              |
| `tsc --noEmit`                 | —                                | whole project            | ✅              |
| `next build`                   | —                                | whole project            | ✅              |
| Playwright E2E                 | —                                | full suite               | ✅              |
| Visual snapshots               | local, on demand                 | skipped (Linux)          | ❌              |
| Coverage                       | **never**                        | reported as a PR comment | ❌ no threshold |
| Evals                          | —                                | —                        | ❌ manual       |

`vitest related` walks the module graph, so editing `src/lib/llm/port.ts` runs every suite
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

The seam is `src/lib/llm/port.ts`.

## Testing against the model

Three fakes, in `src/lib/llm/fake.ts`:

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

Playwright boots its own dev server on **:3100**, so a running `npm run dev` on :3000 does
not collide.

Two projects, both Chromium:

- **mobile** — 390×844 @2x, matching the design brief's target and how the reference
  screenshots were captured
- **desktop** — 1280×900 @2x, for the projected room view

WebKit is deliberately not installed. These snapshots test design tokens, not browser
engines, and WebKit is another ~90MB in CI. If iOS-specific rendering bugs appear, add a
webkit project and run `npx playwright install webkit` — do not chase them with snapshots.

### Visual snapshots are macOS-only

Playwright namespaces snapshots by platform (`brand-desktop-darwin.png`) and Linux renders
fonts differently, so every snapshot would fail in GitHub Actions with no real regression.
Pixel comparisons are gated behind `!process.env.CI`; the behavioural assertions in the same
file run everywhere.

To enable them in CI, generate Linux baselines in the Playwright container and commit them:

```bash
docker run --rm -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.62.1-noble \
  npx playwright test --update-snapshots
```

Accepting an intentional design change:

```bash
npm run test:e2e -- --update-snapshots
```

Then **look at the diff** before committing. A snapshot updated without review is worse than
no snapshot.

### Two E2E tests worth more than the snapshots

`e2e/design-system.spec.ts` asserts the _mechanism_, not the appearance:

- **each lens recolours its subtree** — all four contexts (pre-lens cyan + three lenses) must
  resolve `--primary` to four distinct values. If this breaks, every screen silently loses
  its accent.
- **the app is dark-only** — if `dark` falls off `<html>`, every surface inverts and nobody
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
