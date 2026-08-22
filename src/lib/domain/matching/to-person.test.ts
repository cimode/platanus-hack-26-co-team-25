import { describe, it } from "vitest";

/**
 * `toPerson(rankable, latents, cohort)` (issue #10, docs/domain.md §6): the
 * seam between a `RankableParticipant` row that has already passed the §0
 * floor and the engine's `Person` in ./engine.ts. Money posture, rootedness
 * and family gravity become `band / 3`; the capacity band, distance band,
 * chronotype and tags are copied as-is; `team` / `track` null ⇒ undefined;
 * the cohort is passed in (30-minute windows computed by the use case); gate
 * rows map to `gates.*` and an absent row ⇒ undefined; absent latent rows ⇒
 * undefined so the engine imputes the prior (AUDIT.md S15); `hasPhoto` is
 * `photo_url is not null`. It throws on any null declared field -- the second
 * guard behind the repository's floor, never the first (docs/domain.md §5).
 *
 * The happy criterion is skipped until the mapper exists. The throw on the
 * abandoned row is asserted by the `kind: safety` criterion AC-4 in
 * src/lib/use-cases/prepare-results.test.ts, which runs today.
 */

describe("toPerson", () => {
  // TODO: un-skip when toPerson exists.
  // Blocked on: src/lib/domain/matching/to-person.ts, the RankableParticipant
  // type and bandToUnit in src/lib/domain/participant (#4), and the stored
  // latent row shape from #7's latent-estimate port.
  it.skip("AC-2 · maps a floor-passing participant to a Person: bands / 3, capacity as-is, gate rows to gates.*, absent rows to undefined, consent and hasPhoto copied", () => {});
});
