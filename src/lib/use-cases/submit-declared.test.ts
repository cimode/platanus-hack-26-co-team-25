import { describe, it } from "vitest";

/**
 * `submitDeclared` use case (issue #8): resolves the participant by session
 * token, merges a partial declared profile onto the saved one, validates the
 * bands (0..3) and the tags (subset of TAGS, at most 12), calls `saveDeclared`
 * once with `acquaintances: []` and reports `complete` only when all six bands
 * are present (docs/domain.md §3, D6).
 *
 * Both tests use an inline in-memory ParticipantRepository -- no adapter
 * import, so the biome.json hexagon rule holds -- and refer to the vocabulary
 * by `TAGS[0]` from src/lib/domain/participant, never by a literal slug.
 */

describe("submitDeclared", () => {
  // TODO: un-skip when submitDeclared exists.
  // Blocked on: src/lib/use-cases/submit-declared.ts, TAGS in
  // src/lib/domain/participant and ParticipantRepository (#4).
  it.skip("AC-5 · refuses 13 tags, a tag outside TAGS and an unknown session without calling saveDeclared", () => {});

  // TODO: un-skip when submitDeclared exists.
  // Blocked on: src/lib/use-cases/submit-declared.ts, TAGS in
  // src/lib/domain/participant and ParticipantRepository (#4).
  it.skip("AC-6 · merges each screen onto the saved profile and reports complete only when all six bands exist", () => {});
});
