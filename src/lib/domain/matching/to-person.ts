/**
 * `toPerson(rankable, latents, cohort)` — the seam between a row that has
 * already passed the §0 floor and the engine's `Person` (issue #10,
 * docs/domain.md §6).
 *
 * The mapping, field by field (§6):
 *
 *   - `moneyPosture` / `rootedness` / `familyGravity` ⇒ `bandToUnit` (band / 3),
 *     because the engine's `LifeShape` is 0..1 and the database stores the band
 *     that was tapped (D6).
 *   - `capacityHoursBand`, `distanceBand`, `chronotype` are copied AS-IS: the
 *     engine takes those three as 0..3 bands and dividing them would silently
 *     move every capacity gap, chronotype overlap and distance term.
 *   - a null declared band ⇒ an ABSENT field (D20). The declared round is no
 *     longer asked, so every band is null for everyone registered since; the
 *     engine reads an absent band as unmeasured and scores that term at its
 *     neutral midpoint with the weights untouched — the same degraded path
 *     `distanceBand` always had (AUDIT.md S15). Never a fabricated 0: a zero
 *     band is a real answer ("not at all"), and it would sort the room on it.
 *   - `tags` copied; `team` / `track` null ⇒ undefined; `acquaintances` from the
 *     rankable row; `cohort` passed in (the 30-minute window is the use case's
 *     to compute, because it needs the whole room to find the earliest).
 *   - **D18**: no gate row is written any more, so the gate inputs are DERIVED
 *     from the identity registration asks for -- `mvpRomanticGate({ gender,
 *     birthdate }, today)` and `mvpBusinessGate()`. A stored row still wins
 *     where one exists (pre-D18 rows), and a participant with no gender or no
 *     birthdate gets `undefined`, which the engine reads as suppressed under
 *     the romantic lens (D5) -- the same thing the §0 floor already says.
 *   - an absent latent pillar ⇒ an ABSENT KEY, never a fabricated 0.5: the
 *     engine imputes PRIOR_MEAN / PRIOR_SE from the missing key and computes
 *     `bothMeasured` from row presence (AUDIT.md S15).
 *   - `hasPhoto = participant.photoUrl !== null`.
 *
 * It no longer throws on a null declared field: the floor is registration, and
 * a row past it is rankable whatever the declared columns hold.
 */
import type { RankableParticipant } from "../participant/floor";
import { mvpBusinessGate, mvpRomanticGate } from "../participant/mvp-defaults";
import type { DeclaredBand, Participant } from "../participant/participant";
import { bandToUnit } from "../participant/participant";
import type { LatentName, Person, RomanticGate } from "./engine";

/**
 * Structurally `LatentPosteriors` (`ports/latent-source.ts`), said in domain
 * terms so the mapper depends on no port: `Partial` is the point — a missing
 * pillar is the engine's degraded mode, not a posterior of zero.
 */
export type PersonLatents = Person["latents"];

/** A stored band as the engine's 0..3 number, or absent when never asked. */
function bandOrAbsent(band: DeclaredBand | null): number | undefined {
  return band === null ? undefined : band;
}

/** A stored band as the engine's 0..1 float (D6), or absent when never asked. */
function unitOrAbsent(band: DeclaredBand | null): number | undefined {
  return band === null ? undefined : bandToUnit(band);
}

/**
 * Copy only the pillars that are actually present.
 *
 * Rebuilt rather than spread so an explicit `{ regulation: undefined }` from a
 * caller cannot become a PRESENT key holding undefined: `engine.ts` reads key
 * presence as "measured" (AUDIT.md S15), so the difference is whether
 * `flags.bothHighAgency` may fire at zero data.
 */
function copyLatents(latents: PersonLatents): PersonLatents {
  const copied: PersonLatents = {};
  for (const [pillar, estimate] of Object.entries(latents)) {
    if (estimate !== undefined) copied[pillar as LatentName] = estimate;
  }
  return copied;
}

/** The D18 romantic gate, or undefined for a row that predates the identity. */
function derivedRomanticGate(
  participant: Participant,
  today: Date
): RomanticGate | undefined {
  if (participant.gender === null || participant.birthdate === null) {
    return undefined;
  }
  return mvpRomanticGate(
    { gender: participant.gender, birthdate: participant.birthdate },
    today
  );
}

export function toPerson(
  rankable: RankableParticipant,
  latents: PersonLatents,
  cohort: number | undefined,
  /** Passed in so the derived age band is testable on any day (D18). */
  today: Date = new Date()
): Person {
  const { participant } = rankable;
  const { declared } = participant;

  return {
    id: participant.id,
    name: participant.name,
    latents: copyLatents(latents),
    declared: {
      distanceBand: bandOrAbsent(declared.distanceBand),
      lifeShape: {
        moneyPosture: unitOrAbsent(declared.moneyPosture),
        rootedness: unitOrAbsent(declared.rootedness),
        familyGravity: unitOrAbsent(declared.familyGravity),
        // NOT divided: the engine takes this one as a 0..3 band (§6).
        capacityHoursBand: bandOrAbsent(declared.capacityHoursBand),
      },
      tags: [...declared.tags],
      chronotype: bandOrAbsent(declared.chronotype),
    },
    structural: {
      team: participant.team ?? undefined,
      track: participant.track ?? undefined,
      cohort,
      acquaintances: [...rankable.acquaintances],
    },
    gates: {
      // A stored row still wins; under D18 there is none, and the engine's
      // inputs come from `mvp-defaults.ts` instead (docs/domain.md §6).
      romantic:
        rankable.romanticGate ?? derivedRomanticGate(participant, today),
      business: rankable.businessGate ?? mvpBusinessGate(),
    },
    consent: { ...participant.consent },
    hasPhoto: participant.photoUrl !== null,
  };
}
