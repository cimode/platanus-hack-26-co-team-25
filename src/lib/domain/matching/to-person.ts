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
 *   - `tags` copied; `team` / `track` null ⇒ undefined; `acquaintances` from the
 *     rankable row; `cohort` passed in (the 30-minute window is the use case's
 *     to compute, because it needs the whole room to find the earliest).
 *   - a gate row ⇒ `gates.*`, an absent row ⇒ undefined (D5: no row means never
 *     asked, which the engine reads as suppressed under that lens).
 *   - an absent latent pillar ⇒ an ABSENT KEY, never a fabricated 0.5: the
 *     engine imputes PRIOR_MEAN / PRIOR_SE from the missing key and computes
 *     `bothMeasured` from row presence (AUDIT.md S15).
 *   - `hasPhoto = participant.photoUrl !== null`.
 *
 * It throws on any null declared field. That is the SECOND guard behind
 * `byRoomForRanking`'s floor and never the first (docs/domain.md §5): past the
 * floor every declared field is non-null by construction, so reaching the throw
 * means a caller skipped the floor — and ranking on fabricated zeros, or on the
 * `NaN` that `bandOf()` labels `high`, is the failure it exists to prevent.
 */
import type { RankableParticipant } from "../participant/floor";
import type { DeclaredBand, DeclaredProfile } from "../participant/participant";
import { bandToUnit } from "../participant/participant";
import type { LatentName, Person } from "./engine";

/**
 * Structurally `LatentPosteriors` (`ports/latent-source.ts`), said in domain
 * terms so the mapper depends on no port: `Partial` is the point — a missing
 * pillar is the engine's degraded mode, not a posterior of zero.
 */
export type PersonLatents = Person["latents"];

/** The declared keys `Person` reads. All six are non-null past the floor. */
type BandKey = {
  [K in keyof DeclaredProfile]: DeclaredProfile[K] extends DeclaredBand | null
    ? K
    : never;
}[keyof DeclaredProfile];

/**
 * The band, or an Error naming the field.
 *
 * The message names the FIELD and not the participant: a below-floor row
 * reaching here is a caller bug, and an id in a log line is a disclosure the
 * floor exists to prevent (engine.ts:782's `unknown subject id` is the
 * anti-pattern this use case is written to avoid triggering at all).
 */
function requireBand(declared: DeclaredProfile, key: BandKey): DeclaredBand {
  const band = declared[key];
  if (band === null) {
    throw new Error(
      `toPerson: declared "${key}" is null — a row below the §0 floor reached ` +
        "the mapper, and ranking it would score fabricated zeros"
    );
  }
  return band;
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

export function toPerson(
  rankable: RankableParticipant,
  latents: PersonLatents,
  cohort: number | undefined
): Person {
  const { participant } = rankable;
  const { declared } = participant;

  return {
    id: participant.id,
    name: participant.name,
    latents: copyLatents(latents),
    declared: {
      distanceBand: requireBand(declared, "distanceBand"),
      lifeShape: {
        moneyPosture: bandToUnit(requireBand(declared, "moneyPosture")),
        rootedness: bandToUnit(requireBand(declared, "rootedness")),
        familyGravity: bandToUnit(requireBand(declared, "familyGravity")),
        // NOT divided: the engine takes this one as a 0..3 band (§6).
        capacityHoursBand: requireBand(declared, "capacityHoursBand"),
      },
      tags: [...declared.tags],
      chronotype: requireBand(declared, "chronotype"),
    },
    structural: {
      team: participant.team ?? undefined,
      track: participant.track ?? undefined,
      cohort,
      acquaintances: [...rankable.acquaintances],
    },
    gates: {
      romantic: rankable.romanticGate,
      business: rankable.businessGate,
    },
    consent: { ...participant.consent },
    hasPhoto: participant.photoUrl !== null,
  };
}
