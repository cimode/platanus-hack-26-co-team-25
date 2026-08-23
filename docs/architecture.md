# Architecture

Ports and adapters. `src/lib/` is the hexagon.

The general pattern is documented by the `hexagonal-architecture` skill in
`.claude/skills/`. This file records the parts specific to dipia: where things
actually live, what is enforced mechanically, and the two ways it goes wrong here.

## Shape

```
src/
├─ app/                       DRIVING ADAPTERS — routes, server actions
├─ components/                PRESENTATION — no I/O, ever
│  └─ ui/                     shadcn-owned, lint-exempt
└─ lib/                       ◆ THE HEXAGON ◆
   ├─ domain/                 PURE. No I/O, no SDK, no framework, no React.
   │  └─ matching/            the scoring + ranking engine
   ├─ ports/                  INTERFACES the core needs. Owned by the core.
   │  └─ llm.ts               LlmPort
   ├─ use-cases/              ORCHESTRATION. Ports arrive as parameters.
   ├─ adapters/               The ONLY place an SDK is imported.
   │  ├─ db/                  client.ts, schema/
   │  └─ llm/                 fake.ts (test doubles)
   └─ composition.ts          the ONLY place adapters meet ports
```

Dependencies point inward: `app → use-cases → ports ← adapters`. `domain/`
imports nothing but itself.

## Enforced, not suggested

`biome.json` scopes `style/noRestrictedImports` to `src/lib/{domain,use-cases,ports}/**`
and makes two things errors:

- importing an SDK (`drizzle-orm/**`, `@neondatabase/**`, `@anthropic-ai/**`,
  `next/**`, `react`)
- importing `**/adapters/**` or `**/composition`

```
src/lib/domain/…  × Inside the hexagon. Depend on a port from src/lib/ports/;
                    adapters live in src/lib/adapters/ …
src/lib/domain/…  × Dependencies point inward. The core defines ports; adapters
                    implement them. Take what you need as a parameter.
```

With several agents writing code in parallel, a rule that lives only in prose is
a suggestion. This one fails CI. It is also the mechanical form of the rule
`docs/testing.md` already stated in words:

> If a module under `src/lib/` imports an SDK, it is not an engine module.

Adapters are deliberately *not* in scope — they must import SDKs, or the rule is
a ban rather than a boundary.

## The composition root

`src/lib/composition.ts` is the only module that knows which adapter implements
which port. Driving adapters call it and pass the result into a use case:

```ts
const result = await submitIntake(input, serverDeps());
```

`serverDeps()` returns `{ db, participants, responses, generatedBlocks, latents,
rooms, roster, photos, llm }`. Every member is a lazy getter, so a screen that
never touches the model never builds a gateway client.

`llm` is real — `adapters/llm/gateway.ts` — but **nothing on the quiz path
reaches it**. Since `docs/domain.md` D21 the questions are the committed bank
(`quiz/bank/`), dealt by `formFor(participantId)`, so a block costs zero model
calls; `llm` survives for the timeline narrator and the offspring reveal, which
are the only two workloads that still ask a model for anything at request time.
D21 also removed two members that existed only for live authoring: `claims`
(`GenerationClaims`) and `pool` (`QuizPoolRepository`), along with their tables.

## Two ways this goes wrong here

**A server component queries the database directly.** This is the one violation
that feels idiomatic in App Router — `await db.select(...)` inside a page is
normal Next.js and silently puts logic where no test can reach it. Pages and
route handlers call use cases. Only `composition.ts` builds adapters.

**A port with one implementation.** A port earns its place at a real external
boundary: network, disk, model, clock. `fake + real` counts as two, so `llm` and
a future `participants` repository qualify; wrapping a pure function does not.
In a 36-hour build, speculative ports are the main way this becomes ceremony.

## Deliberately empty

`use-cases/` holds `list-participants.ts` and `enter-room.ts` so far — both added
when a screen actually needed them. That is the rule: a use case written before a
screen calls it is a guess about an interface nobody has used.
