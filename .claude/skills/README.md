# Skills

## What exists

| Skill | Used by |
| --- | --- |
| `quest-skill` | `create_quest` workflow — authoring quiz blocks |
| `issue-status` | `/work`, and any agent moving an issue between statuses |

## What `/work` stage 2 is missing

`code-writer` and `adversarial-reviewer` both open with "load the architecture
skill for the area you are touching". **No such skill exists yet**, so both
currently fall back to the conventions of the nearest existing module. That
fallback is deliberate and it is honest — the agents report when they used it —
but it means stage 2's output is only as consistent as whatever it happened to
read first.

These are blocked on decisions nobody has made, not on writing time:

| Skill to write | Blocked on deciding |
| --- | --- |
| `engine-architecture` | Where the matching engine lives. `matching/` is at the repo root today and its tests are a standalone runner; `docs/testing.md` assumes `src/lib/`. Until that is settled, two agents will disagree about where a new engine module goes. |
| `data-access` | Whether route handlers call Drizzle directly or go through a repository layer; who owns transactions; where `getDb()` may be called (see `docs/database.md`). |
| `ui-composition` | Server vs client component boundaries, where `src/components/ui/**` (shadcn-owned, lint-exempt) stops and our components start, how lens theming is threaded. |
| `llm-usage` | Which call sites get fixtures, when a prompt change means re-recording, where prompts live as source. |

Write these before running `/work` on anything structural. A stage-2 agent with
no architecture skill is not blocked — it is worse than blocked, because it will
confidently produce something plausible and inconsistent, and the tests will
pass, and nobody will notice until the third module disagrees with the first
two.

## Writing one

Match `quest-skill`'s shape: frontmatter with `name` and a `description` that
opens with `Trigger:` and the phrases that should activate it, then an
"Activation Contract" saying exactly what the skill produces, then "Hard Rules".
Keep the rules falsifiable — "prefer composition" is not a rule an agent can
check itself against; "a module under src/lib/ may not import an SDK" is.
