import { TagChips } from "@/components/profile/tag-chips";
import type { PersonProfile } from "@/lib/domain/reveal/profile";

/**
 * The dashed card: why the two of you, in the design's own shape.
 *
 * The design labels this "SMALL BIO" and fills it with free prose. **We do not
 * have a bio and do not invent one** -- `PersonProfile` carries no such field,
 * and adding one would widen a contract issue #10 implements, on our own
 * authority, to put fabricated sentences in a named participant's mouth (R17).
 * Fabricating a band is a fixture doing its job; fabricating someone's
 * self-description is not.
 *
 * So the card keeps the design's shape and holds what we actually have: the
 * named reasons AC-PROF-3 requires, and the shared tags as chips inside the
 * card rather than loose beneath it.
 */
export function ProfileCard({ profile }: { profile: PersonProfile }) {
  return (
    <section
      aria-label="Por qué encajan"
      className="mx-6 rounded-[18px] border-2 border-ink-faint/30 border-dashed px-4 pt-3 pb-3.5"
    >
      <p className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.1em]">
        por qué encajan
      </p>

      <p className="mt-2 font-display text-[15px] text-ink leading-relaxed">
        {profile.standing.bond.label}
      </p>
      {profile.standing.friction ? (
        <p className="mt-0.5 font-display text-[15px] text-ink-muted leading-relaxed">
          {profile.standing.friction.label}
        </p>
      ) : null}

      <div className="mt-3">
        <TagChips tags={profile.tags} />
      </div>
    </section>
  );
}
