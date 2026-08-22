---
description: Approve an issue, start it, and drive it through test-writer → code-writer → tester → adversarial-reviewer to a PR
argument-hint: "#12 [#15 ...] | a description of the work"
allowed-tools: Bash(gh:*), Bash(git:*), Bash(pnpm:*), Read, Write, Edit, Grep, Glob, Agent, Workflow, Skill, AskUserQuestion
---

Take `$ARGUMENTS` from an approved spec to an open PR.

`REPO` is `platanus-hack/platanus-hack-26-co-team-25`. Every `gh` call needs
`-R "$REPO"` — this repo has multiple remotes.

## 1. Resolve the arguments

**Issue numbers** (`#12`, `12`, several of them) — use them directly.

**A description** — there is no issue yet. Run `/intake` on it first, so the
spec and its stubs exist, then work the issue it created. Do not skip this:
without an AC block, stage 1 has no specification and the whole pipeline is
just an agent guessing.

## 2. Validate before touching anything

For each issue:

```bash
gh issue view "$N" -R "$REPO" --json title,body,labels,state
```

Refuse, and say why, if:

- it is closed
- it has no `## Acceptance criteria` yaml block — it is not a spec
- its ACs lack a `happy`, a `sad`, or an `edge`
- it is already `status:in-progress` — someone or something is on it
- its `Depends on:` names an issue that is still open

## 3. Approve and start

Invoking `/work` **is** the human approval. Use the `issue-status` skill, one
transition at a time, so the guard runs:

```
draft → approved      (you are approving it)
approved → in-progress
```

## 4. Decide sequential or parallel

```bash
pnpm run issues:ready
```

For more than one issue, compare their **Files affected** tables:

- **No overlap** → parallel, via the `work_issues` workflow, each issue in its
  own git worktree (`isolation: "worktree"`) and its own branch.
- **Any overlap** → sequential, in dependency order. Say which path collided.
  Two agents editing one file is not parallelism, it is a merge conflict with
  extra steps.

One issue is always sequential — run the agents directly so the user can watch
and interrupt. The workflow exists for fan-out, not for ceremony.

## 5. Branch, or worktree

**Sequential (one issue):** a branch in the current checkout.

```bash
git checkout -b "feat/$N-<short-slug>"
```

**Parallel:** one git worktree per issue, created here — *not* via the Workflow
tool's `isolation: "worktree"`. That option gives each **agent** its own tree,
which would hand stage 2 a checkout with none of stage 1's tests in it. All four
stages for an issue must share one tree.

```bash
WT="../.hookai-worktrees/issue-$N"
git worktree add -b "feat/$N-<short-slug>" "$WT" HEAD

# A fresh worktree has no node_modules, and every stage runs `pnpm run verify`.
# Symlink when the issue has no e2e ACs: typecheck, Biome, ESLint and Vitest
# all follow it. Turbopack does NOT -- `next dev` aborts with "Symlink
# [project]/node_modules is invalid, it points out of the filesystem root", so
# Playwright cannot boot its server in a symlinked worktree. If any AC lives in
# e2e/*.spec.ts, install for real instead -- seconds, since pnpm hardlinks
# from the global store rather than unpacking tarballs.
if grep -q "e2e/" <<< "$AC"; then (cd "$WT" && pnpm install --frozen-lockfile --prefer-offline); \
else ln -s "$(git rev-parse --show-toplevel)/node_modules" "$WT/node_modules"; fi
# Same for the env the db scripts read, and the Neon branch pin.
ln -s "$(git rev-parse --show-toplevel)/.env"  "$WT/.env"
ln -s "$(git rev-parse --show-toplevel)/.neon" "$WT/.neon"
```

Sibling directory, deliberately outside the repo: a `.worktrees/` inside it
would need excluding from Biome, Vitest and Playwright separately, and
whichever one you forget scans a duplicate copy of the whole codebase.

Pass each issue to the `work_issues` workflow as
`{ number, worktree, branch, ac }`, where `ac` is the acceptance-criteria yaml
**verbatim**.

Clean up after the PRs are open:

```bash
git worktree remove "$WT"        # add --force only if you know what is uncommitted
```

Never work on `main`.

## 6. The pipeline

Four stages, each a subagent with its own definition in `.claude/agents/`:

| Stage | Agent | Must end with |
| --- | --- | --- |
| 1 | `test-writer` | Every AC has a test, and every one **fails on an assertion** |
| 2 | `code-writer` | `pnpm run verify` green, no test file touched |
| 3 | `tester` | Green, or a routed failure with a reason |
| 4 | `adversarial-reviewer` | A PR, or findings back to stage 2 |

Pass each agent the issue number and the full AC yaml — do not paraphrase it.
Stage 1's AC→failure table is stage 2's input. Stage 3's routing decision names
its own next stage. Stage 4 returns either a PR URL or findings.

### Loops are bounded

Stages 3 and 4 both route back to stage 2. Allow **at most 3 returns to
`code-writer` per issue**. On the fourth, stop and use the `issue-status` skill
to move the issue back to `status:draft` with a comment naming what could not be
made to pass. An unbounded loop burns the budget and produces worse code each
pass, because each pass is patching the last one's patch.

Route to `test-writer` only when stage 3 or 4 **quoted the AC** and named how
the test diverged from it. Without that, the test stands and the code is wrong.

## 7. Report

Per issue: the PR URL, the AC table (id → test file → passing), how many
code-writer cycles it took, anything the reviewer flagged but accepted, and any
file touched that was not in the **Files affected** table.

## Hard rules

1. The pipeline order is fixed. No skipping stage 1 because "the tests are
   obvious", no skipping stage 4 because "it looks fine".
2. Only `test-writer` may write to a test file. Ever.
3. The PR body must contain `Closes #N`, or the status workflow stops tracking
   the issue.
4. Never `git push --force` a branch you did not create in this run.
5. If stage 1 reports an AC as untestable, stop the whole pipeline for that
   issue and take it back to `status:draft`. Building against a spec you know
   is ambiguous wastes all four stages.
