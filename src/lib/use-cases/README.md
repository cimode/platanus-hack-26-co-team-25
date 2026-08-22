# Use cases

Application-layer orchestration. One file per thing a person can do:
`submit-intake.ts`, `rank-room.ts`, `simulate-life.ts`.

The shape is always the same — inputs first, dependencies last:

```ts
export async function submitIntake(
  input: IntakeSubmission,
  deps: Pick<Deps, "db">
): Promise<ParticipantId> { … }
```

Dependencies arrive as a **parameter**, never an import. `biome.json` enforces
this: nothing here may import `src/lib/adapters/**` or an SDK. Call a port, and
let `src/lib/composition.ts` decide what implements it.

Empty until `submit-intake.ts` needs to exist. A use case written before there
is a screen calling it is a guess about an interface nobody has used yet.
