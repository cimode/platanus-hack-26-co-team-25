---
description: Turn a rough description of work into a spec issue plus its skipped test stubs
argument-hint: <rough description of the work>
allowed-tools: Bash(gh:*), Bash(grep:*), Bash(rg:*), Read, Write, Edit, Grep, Glob, AskUserQuestion
---

Turn `$ARGUMENTS` into ONE spec issue and the skipped tests that will verify it.

`REPO` is `platanus-hack/platanus-hack-26-co-team-25`. This repo has multiple
remotes, so **every `gh` call needs `-R "$REPO"`**.

## The one rule that outranks the others

**Never open an issue that still contains an unanswered question.** An issue
with open questions is a conversation, not a spec, and it will be picked up by
someone who then has to stop and ask anyway. If something is genuinely
undecided, use `AskUserQuestion` and resolve it *now*, before the issue exists.

If the user cannot answer, say so and stop. Do not create a placeholder.

## Procedure

### 1. Ground it

Read the relevant part of `CONTEXT.md` (and `PILLARS.md` / `AUDIT.md` if the
work touches scoring). A spec that cannot name the section it derives from is
usually a spec for something nobody asked for.

### 2. Draft the acceptance criteria first

Everything else in the issue exists to support these, so write them first.

- **At least one `happy`, one `sad`, and one `edge`.** If you cannot describe
  the sad path, you do not understand the feature yet.
- **A `safety` entry is mandatory** if the work touches rankings, photos,
  consent, or anything visible to a participant other than its author. This
  product ranks real people by romantic compatibility in public; those are the
  criteria worth writing before the feature exists.
- **`id` is the join key.** `AC-1`, `AC-2`, … unique within the issue, and it
  will appear verbatim in the test name.
- **`file` decides the test layer at spec time**, so whoever picks the issue up
  does not have to: `src/**/*.test.ts` for engine logic (pure functions, node
  env, Vitest), `e2e/*.spec.ts` for anything a participant sees (Playwright).
  See `docs/testing.md` for which question each layer answers.
- **`then:` describes what a person observes** — roles and visible text, never
  DOM structure or class names. A test that breaks on a `className` change is a
  test the team deletes.

### 3. Work out dependencies and collisions

```bash
gh issue list -R "$REPO" --state open \
  --json number,title,labels,body \
  -q '.[] | {n:.number, t:.title, s:[.labels[].name|select(startswith("status:"))][0]}'
```

Two separate checks, and they catch different things:

- **`Depends on:`** — logical ordering. Ranking cannot be built before scoring.
  Write `Depends on: #12, #15`, or `Depends on: none`.
- **Files affected** — merge collisions. If a path in your table also appears
  in an issue that is `status:in-progress`, say so in the issue body. Two specs
  that both edit `src/lib/db/schema/index.ts` will collide even when neither
  depends on the other.

### 4. Pick a priority

`prio:high` if it is on the demo path in `CONTEXT.md` (intake → lens → ranking
→ timeline → baby) or blocks something that is. Otherwise ask.

### 5. Create the issue

Body structure must match `.github/ISSUE_TEMPLATE/spec.md` exactly — the
`Depends on:` line, then `## Context`, `## Scope`, `## Files affected`,
`## Acceptance criteria` (one fenced `yaml` block), `## Data`.

```bash
gh issue create -R "$REPO" \
  --title "intake: participant completes the form on a phone" \
  --label "status:draft" --label "prio:high" \
  --body-file /tmp/spec-body.md
```

Titles read `area: what a person can do`, lowercase after the colon. Write the
body to a file rather than inlining it — `--body` mangles the fenced block.

Every new issue starts at `status:draft`. It is **not** this command's job to
approve it; a human does that. See the `issue-status` skill.

### 6. Write the stubs

Every AC becomes exactly one skipped test, in the `file` its yaml names, with
the id verbatim at the front of the name so `grep -rn "AC-2"` links them.

Match the house style in `e2e/demo-path.spec.ts`: a comment block above each
stub naming what it waits on, then the skipped test.

Playwright (`e2e/*.spec.ts`):

```ts
// TODO: un-skip when the intake form exists.
// Blocked on: intake screen (form + photo capture).
test.skip("AC-2 · submission is blocked with no photo", async ({ page }) => {});
```

Vitest (`src/**/*.test.ts`) — `describe` / `it`, imported from `vitest`:

```ts
describe("persistResponse", () => {
  // TODO: un-skip when persistResponse exists.
  it.skip("AC-3 · surfaces the error and writes no partial row", () => {});
});
```

**`kind: safety` stubs are NOT skipped.** Write them as running tests that
assert the invariant holds — vacuously true today is fine, and it stays true as
the feature lands. A silently-skipped safety test is the most expensive kind of
green in this product.

Creating a new spec file is fine; adding to an existing one is better when the
subject matches. Do not reformat a file you are only appending to.

### 7. Verify before reporting

```bash
npm run verify
```

Skipped tests must not break the suite, and a new e2e file must still compile.
Then report: the issue URL, each AC id with the file its stub landed in, and
anything you noted as a file collision.

## Hard Rules

1. No issue with an unanswered question. Ask first, always.
2. Happy + sad + edge minimum; safety when it touches other participants.
3. The AC id appears verbatim in the test name. Traceability is a `grep`.
4. Stubs land in the same change as the issue. An issue whose tests do not
   exist yet is a doc someone has to re-read later.
5. One issue per invocation. If `$ARGUMENTS` describes two things, say so and
   ask which to spec first.
