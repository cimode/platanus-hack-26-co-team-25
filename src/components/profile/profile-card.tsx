import type { ProfileView } from "@/components/profile/mock";
import { TagChips } from "@/components/profile/tag-chips";

/**
 * The dashed card: who this person is, then why the two of you.
 *
 * Near-opaque, not translucent. The venue sits behind this screen and the first
 * attempt let it through at 55% -- which looked atmospheric in a thumbnail and
 * made the bio unreadable at arm's length, with the sponsor wall showing between
 * the lines. Text gets a solid ground. Everything else can be atmosphere.
 *
 * The bio leads because it is what you read first when you are deciding whether
 * to spend a life with someone -- the compatibility reasons are the machine's
 * opinion, and the machine goes second. The reasons stay in the card anyway:
 * AC-PROF-3 requires one bond line and at most one friction line on this
 * screen, and a card that dropped them to look cleaner would be prettier and
 * wrong.
 *
 * The bio is MOCKED and stands in for an AI step over intake's declared data.
 * It is composed from this person's own tags, so the sentence and the chips
 * below it can never contradict each other.
 */
export function ProfileCard({ profile }: { profile: ProfileView }) {
  return (
    <section
      aria-label="Quién es y por qué encajan"
      className="mx-6 rounded-[18px] border-2 border-ink-faint/45 border-dashed bg-background/95 px-4 pt-3 pb-3.5 backdrop-blur-[2px]"
    >
      <p className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.1em]">
        small bio
      </p>

      <p className="mt-2 font-display text-[15px] text-ink leading-relaxed">
        {profile.bio}
      </p>

      <p className="mt-3 font-mono text-[10.5px] text-ink-muted leading-relaxed">
        {profile.standing.bond.label}
      </p>
      {profile.standing.friction ? (
        <p className="font-mono text-[10.5px] text-ink-faint leading-relaxed">
          {profile.standing.friction.label}
        </p>
      ) : null}

      <div className="mt-3">
        <TagChips tags={profile.tags} />
      </div>
    </section>
  );
}
