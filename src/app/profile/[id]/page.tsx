import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { LENS_COOKIE } from "@/app/lens";
import { AvatarStage } from "@/components/profile/avatar-stage";
import { mockProfile } from "@/components/profile/mock";
import { ProfileCard } from "@/components/profile/profile-card";
import { TagChips } from "@/components/profile/tag-chips";
import { mockRankedRoom, type RankCandidate } from "@/components/rank/mock";
import { serverDeps } from "@/lib/composition";
import { isLens } from "@/lib/domain/room/layout";
import { enterRoom } from "@/lib/use-cases/enter-room";
import { cn } from "@/lib/utils";

/**
 * Screen 1d -- one other person, as this viewer is allowed to see them.
 *
 * A Server Component. `personId` comes from the segment and the viewer from the
 * impersonation cookie, never the other way around: the URL names WHO you are
 * looking at and the cookie names WHO IS LOOKING, and the second is not
 * something a request may assert.
 *
 * Every suppression cause reaches the same `notFound()`. Unknown id, yourself,
 * someone absent from your ranking under this lens -- one 404, byte-identical,
 * because a distinguishable 404 is an oracle for who is in the room
 * (AC-PROF-2). That is why the whole page is one `null` check and not four.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await cookies();
  const lens = store.get(LENS_COOKIE)?.value;

  // No lens is not a 404 -- it is a question nobody asked yet, same as on 1c.
  if (!isLens(lens)) redirect("/room");

  const { me, others } = await enterRoom(
    store.get(IMPERSONATION_COOKIE)?.value,
    serverDeps()
  );
  if (!me) redirect("/");

  const candidates: readonly RankCandidate[] = others.map((spot) => ({
    id: spot.participant.id,
    name: spot.participant.name,
    photoUrl: spot.sprite,
    team: spot.participant.team,
  }));

  // The SAME room screen 1c painted, so `standing` cannot disagree with it.
  const profile = mockProfile(
    id,
    mockRankedRoom(lens, me, candidates),
    candidates
  );
  if (!profile) notFound();

  return (
    <main
      className={cn(
        `lens-${lens}`,
        "relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden"
      )}
    >
      <VenueFloor />

      <header className="relative shrink-0 px-6 pt-5 pb-1">
        <Link
          aria-label="Volver al ranking"
          className="-ml-1 inline-flex items-center gap-1 text-ink-muted transition-colors hover:text-ink"
          href="/rank"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
          <span className="font-mono text-[11px] lowercase">el ranking</span>
        </Link>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6">
        <AvatarStage name={profile.name} photoUrl={profile.photoUrl} />

        <h1 className="font-display font-extrabold text-[26px] text-ink leading-none">
          {profile.name}
        </h1>
        {profile.team ? (
          <p className="font-mono text-[10.5px] text-ink-faint lowercase">
            {profile.team}
          </p>
        ) : null}

        <ProfileCard profile={profile} />
        <TagChips tags={profile.tags} />
      </div>

      {/*
        One control, and it carries nothing. `/simulate/{id}` with no query
        string: the lens travels by cookie and the viewer is never in a URL,
        so a link that leaks out of this session names a person and nothing
        about who was looking at them (AC-PROF-5).
      */}
      <div className="relative shrink-0 px-6 pt-2 pb-7">
        <Link
          className={cn(
            "flex w-full items-center justify-center rounded-[16px] bg-primary px-5 py-3.5",
            "font-display font-bold text-[16px] text-primary-foreground shadow-toy",
            "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          href={`/simulate/${profile.id}`}
        >
          Simular una vida juntos
        </Link>
      </div>
    </main>
  );
}

/** The same room as 1b and 1c, so the flow never leaves the venue. */
function VenueFloor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated pointer-events-none absolute inset-x-0 bottom-0 h-[86%] bg-cover opacity-[0.26]"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 74%",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[86%]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, color-mix(in oklab, var(--background) 60%, transparent) 24%, color-mix(in oklab, var(--background) 50%, transparent) 100%)",
        }}
      />
    </>
  );
}
