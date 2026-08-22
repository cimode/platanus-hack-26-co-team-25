---
name: issue-status
description: "Trigger: start working on an issue, pick up an issue, open a PR for an issue, block an issue, move issue status. Advances a spec issue through draft -> approved -> in-progress -> review -> completed, enforcing exactly one status label and rejecting illegal transitions."
license: Apache-2.0
metadata:
  version: "1.0"
---

## Activation Contract

Move ONE issue between status labels. This skill is a state machine, not a
label setter: it reads the current status first and **refuses any transition
not on the arrow list below**. If you find yourself wanting to force a move,
the answer is to fix the issue, not to bypass the guard.

`REPO` is `platanus-hack/platanus-hack-26-co-team-25`. The repo has multiple
remotes, so **every `gh` call must pass `-R "$REPO"`** or it errors.

## The state machine

```
draft ──approve──> approved ──start──> in-progress ──pr-opened──> review ──merged──> completed
  ^                                         ^                        │
  └────────── block ────────────────────────┴──changes-requested──────┘
```

| From | To | Trigger | Who runs it |
| --- | --- | --- | --- |
| `draft` | `approved` | A human approved the spec | Human, via this skill |
| `approved` | `in-progress` | An agent picks the issue up | **Agent (this skill)** |
| `in-progress` | `review` | PR opened with `Closes #N` | Workflow; skill is fallback |
| `review` | `in-progress` | Changes requested | Workflow; skill is fallback |
| `review` | `completed` | PR merged / issue closed | Workflow; skill is fallback |
| any | `draft` | A blocking question surfaced | **Agent (this skill)** |

Only two transitions genuinely need an agent: `start` and `block`. The rest are
driven by `.github/workflows/issue-status.yml`, because a workflow fires even
when a human opens the PR or an agent dies mid-task. Running the skill for one
of those anyway is safe -- every step below is idempotent.

## Procedure

### 1. Read the current status. Never skip this.

```bash
REPO=platanus-hack/platanus-hack-26-co-team-25
gh issue view "$N" -R "$REPO" --json labels \
  -q '[.labels[].name | select(startswith("status:"))]'
```

Three outcomes:

- **Exactly one** — the normal case. Continue.
- **Zero** — the issue predates the convention. Apply `status:draft`, say so,
  and **stop**. Do not guess where it was.
- **Two or more** — the mutual-exclusion invariant is already broken. **Stop
  and report.** Do not "fix" it by picking one; a human needs to know how it
  happened, because it means something wrote a label without this skill.

### 2. Check the transition is legal

Compare `(current, target)` against the table. If the pair is not listed,
refuse and print both. `draft -> review` is not a shortcut, it is a bug: it
means work started on a spec nobody approved.

### 3. Swap the label in one call

Remove and add together, so the issue is never briefly statusless or
double-labelled:

```bash
gh issue edit "$N" -R "$REPO" \
  --remove-label "status:approved" \
  --add-label    "status:in-progress"
```

### 4. Record why

```bash
gh issue comment "$N" -R "$REPO" \
  --body "status: \`approved\` → \`in-progress\` — picked up by an agent."
```

For a `block`, the comment is **mandatory and must contain the question**:

```bash
gh issue comment "$N" -R "$REPO" --body "status: \`in-progress\` → \`draft\` — blocked.

**Question:** does an abandoned intake response count toward the room, or only completed ones?

AC-4 cannot be written until this is answered."
```

## Hard Rules

1. **Never** add a status label without removing the previous one in the same
   `gh issue edit` call.
2. **Never** invent a status. The five are exactly: `draft`, `approved`,
   `in-progress`, `review`, `completed`.
3. **Never** move an issue to `completed` by hand. That belongs to the merge
   event. If an issue is closed without a merged PR, it should be closed as
   not-planned, not marked completed.
4. **Blocking requires a question.** Moving to `draft` without a comment
   naming what is unanswered turns the board into noise.
5. Priority (`prio:*`) and status are orthogonal. This skill never touches
   `prio:*`.
