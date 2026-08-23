import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LENS_COOKIE } from "@/app/lens";
import { AvatarStage } from "@/components/profile/avatar-stage";
import { mockBio } from "@/components/profile/bio";
import { ProfileCard } from "@/components/profile/profile-card";
import { StandingPill } from "@/components/profile/standing-pill";
import type { ProfileView } from "@/components/profile/view";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import { isLens, type Lens } from "@/lib/domain/room/layout";
import { enterRoom } from "@/lib/use-cases/enter-room";
import { cn } from "@/lib/utils";

/**
 * Screen 1d -- one other person, as this viewer is allowed to see them.
 *
 * A Server Component. `personId` comes from the segment and the viewer from
 * `resolveViewerId` -- the impersonation cookie, else the participant behind
 * `dipia_session` -- never the other way around: the URL names WHO you are
 * looking at and the cookies name WHO IS LOOKING, and the second is not
 * something a request may assert. Adding the session fallback widens who can
 * be identified, never what an identified viewer may see: everything below
 * still runs through `profiles.byId` with that id as the VIEWER.
 *
 * Every suppression cause reaches the same `notFound()`. Unknown id, yourself,
 * someone absent from your ranking under this lens -- one 404, byte-identical,
 * because a distinguishable 404 is an oracle for who is in the room
 * (AC-PROF-2). That is why the whole page is one `null` check and not four.
 *
 * The layout is the design's: name and standing in the header, the dashed card,
 * the CTA immediately under it, a hairline, and the sprite taking the whole
 * lower half. The CTA is HIGH on purpose -- it is the only thing to do here,
 * and burying it under the art makes the screen look like a dead end.
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

  const deps = serverDeps();
  const meId = await resolveViewerId(deps);
  const { me } = await enterRoom(meId ?? undefined, deps);
  if (!me) redirect("/");

  /*
   * `byId` collapses every suppression cause into ONE `null` -- unknown id,
   * yourself, below the §0 floor, gate-failed, not consented to this lens --
   * so the `notFound()` below cannot become an oracle for who is in the room
   * (AC-PROF-2). `standing` is carried across from the same ranking `/rank`
   * renders rather than recomputed, so the two screens cannot drift.
   */
  const person = await deps.profiles.byId(id, me.id, lens);
  if (person === null) notFound();

  /*
   * `bio` is the one thing on this screen that is still a stand-in, and it
   * stays off `PersonProfile` on purpose: the ranking produces no prose, and
   * the real sentence comes from an AI step over intake's declared data that
   * does not exist yet.
   *
   * It is written from the tags the PORT returned, which are already
   * intersected with the viewer's. The fixture wrote from the person's own
   * tags; those never cross the port, and reaching for a second source to
   * recover them would be exactly the disclosure `tags` exists to prevent.
   */
  const profile: ProfileView = {
    ...person,
    bio: mockBio(person.id, person.tags),
  };

  return (
    <main
      className={cn(
        `lens-${lens}`,
        "relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden"
      )}
    >
      <VenueFloor />

      <header className="relative flex shrink-0 items-center gap-1.5 px-6 pt-5 pb-3">
        <Link
          aria-label="Volver al ranking"
          className="-ml-1 shrink-0 text-ink-muted transition-colors hover:text-ink"
          href="/rank"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="truncate font-display font-extrabold text-[23px] text-ink leading-none">
          {profile.name}
        </h1>
        <span className="ml-auto">
          <StandingPill
            band={profile.standing.band}
            position={profile.standing.position}
          />
        </span>
      </header>

      <ProfileCard profile={profile} />

      {/*
        One control, high on the screen, and it carries nothing.
        `/simulate/{id}` with no query string: the lens travels by cookie and
        the viewer is never in a URL, so a link that leaks out of this session
        names a person and nothing about who was looking at them (AC-PROF-5).
      */}
      <div className="relative shrink-0 px-6 pt-4">
        <Link
          className={cn(
            "flex w-full items-center justify-center rounded-[16px] bg-primary px-5 py-3.5",
            "font-display font-bold text-[16px] text-primary-foreground shadow-toy",
            "transition-transform hover:-translate-y-px hover:shadow-toy-lg active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
          )}
          href={`/simulate/${profile.id}`}
        >
          Simular vida {LENS_LIFE[lens]}
        </Link>
      </div>

      <div className="relative mt-5 h-px shrink-0 bg-ink-faint/20" />

      <AvatarStage name={profile.name} photoUrl={profile.photoUrl} />
    </main>
  );
}

/**
 * The same room as 1b and 1c, so the flow never leaves the venue.
 *
 * The veil is OPAQUE across the top third and only opens up below the CTA.
 * Screen 1c could afford a lighter wash because its content is short chips and
 * big ordinals; this screen's content is a paragraph, and a paragraph read over
 * a sponsor wall is not atmospheric, it is unreadable. The room shows where
 * there is nothing to read -- which is where the person is standing anyway.
 */
function VenueFloor() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated pointer-events-none absolute inset-0 bg-cover opacity-[0.2]"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 74%",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, var(--background) 22%, color-mix(in oklab, var(--background) 84%, transparent) 46%, color-mix(in oklab, var(--background) 55%, transparent) 100%)",
        }}
      />
    </>
  );
}

/** The CTA names the life it simulates, so the lens is visible in the verb. */
const LENS_LIFE: Record<Lens, string> = {
  romantic: "romántica",
  business: "de negocios",
  friendship: "de amistad",
};
