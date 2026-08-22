# Skills

| Skill | Loaded by | Covers |
| --- | --- | --- |
| `hexagonal-architecture` | `code-writer`, `adversarial-reviewer` | The general Ports & Adapters pattern. Third-party (`affaan-m/ecc`), pinned in `skills-lock.json`. |
| `data-access` | same | Repository ports, `batch()` vs `transaction()`, id strategy, derived validators, migrations. |
| `ui-composition` | same | Server/Client boundary, Server Actions, shadcn, tokens, lens theming, accessible names. |
| `issue-status` | `/work` and any agent moving an issue | The five status labels and the legal transitions between them. |
| `quest-skill` | `create_quest` workflow | Authoring quiz blocks. |

`docs/architecture.md` records what is hookai-specific and what the linter
enforces; the skills say how to work inside it.

## How they reach the agents

`.claude/agents/code-writer.md` and `.claude/agents/adversarial-reviewer.md`
each carry a load table keyed on what the change touches, so every `/work` run
picks up the right ones. The reviewer treats a violation as a finding rather
than a nitpick — several of these rules cannot fail CI, which is exactly why
they need a reader.

## Writing another one

Match `quest-skill`'s shape: frontmatter with `name` and a `description` opening
`Trigger:` plus the phrases that should activate it, an "Activation Contract"
stating exactly what the skill produces, then "Hard Rules".

Keep every rule **falsifiable**. "Prefer composition" is not something an agent
can check itself against. "A use case may not name a Drizzle type" is — and that
one is enforced by `biome.json` besides.

Prefer rules verified against the installed libraries over rules recalled from
training data. `db.transaction()` throwing on `neon-http` and `useFormState`
being gone in Next 16 are both in these skills because they were checked in this
repo, and both would otherwise have been written wrong.

## Still unwritten

| Skill | Blocked on |
| --- | --- |
| `llm-usage` | Which call sites get fixtures, when a prompt change forces re-recording, where prompts live as source. Defer until scoring or the timeline calls a model — intake does not. |
