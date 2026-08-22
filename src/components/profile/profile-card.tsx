import { BandPill } from "@/components/rank/band-pill";
import type { PersonProfile } from "@/lib/domain/reveal/profile";

/**
 * The reasons, named and never numbered.
 *
 * `standing.position` is deliberately NOT rendered as "3rd best" or as any
 * wording that implies an ordering you could climb. It is shown the way screen
 * 1c shows it -- as this person's place in YOUR ranking -- and nothing on the
 * page turns it into a score (AC-PROF-3).
 */
export function ProfileCard({ profile }: { profile: PersonProfile }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <BandPill band={profile.standing.band} />

      <p className="text-center font-mono text-[11px] text-ink-muted leading-relaxed">
        {profile.standing.bond.label}
      </p>

      {profile.standing.friction ? (
        <p className="text-center font-mono text-[11px] text-ink-faint leading-relaxed">
          {profile.standing.friction.label}
        </p>
      ) : null}
    </div>
  );
}
