import { ConsentStep } from "@/components/intake/consent-step";
import { PhotoStep } from "@/components/intake/photo-step";
import { RegisterForm } from "@/components/intake/register-form";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";

/**
 * `/intake` -- register, photo, consent (docs/domain.md §0, issue #6).
 *
 * A Server Component. It resolves the room, resolves the participant from the
 * httpOnly cookie and picks the step FROM THE ROWS: no cookie or an unknown
 * token is step 1, a null `photo_url` is step 2, anything else is step 3. There
 * is no step column and there must never be one -- a status field can claim a
 * state the data does not support, and this way a reload always lands exactly
 * where the data says (§0, §5).
 *
 * Everything a participant sees here is their own row, read through
 * `bySessionToken`. Nobody else's name or photo is fetched, so none can leak.
 */
export default async function IntakePage(props: PageProps<"/intake">) {
  const searchParams = await props.searchParams;
  const deps = serverDeps();

  // `?room=` comes off the QR code; HOOKAI_ROOM_SLUG is the venue default.
  // Either way it is a slug resolved against `rooms`, never an id (D9).
  const slug = firstValue(searchParams.room) ?? process.env.HOOKAI_ROOM_SLUG;
  const room = slug ? await deps.rooms.bySlug(slug) : null;

  if (!room) {
    return (
      <Shell>
        <section className="flex flex-1 flex-col justify-center gap-3">
          <h2 className="font-display text-2xl font-extrabold text-ink">
            This room doesn&apos;t exist.
          </h2>
          <p className="text-sm text-ink-muted">
            Scan the QR code on the wall again, or ask whoever handed you this
            link for the right one.
          </p>
        </section>
      </Shell>
    );
  }

  const token = await readSessionToken();
  const me = token ? await deps.participants.bySessionToken(token) : null;

  if (!me) {
    return (
      <Shell>
        <RegisterForm roomSlug={room.slug} />
      </Shell>
    );
  }

  if (!me.photoUrl) {
    return (
      <Shell>
        <PhotoStep roomSlug={room.slug} />
      </Shell>
    );
  }

  // Step 3 is the resting place of this issue until #8 adds step 4, and there
  // is deliberately no URL for the done screen. "You have just saved" is the
  // result of `consentAction` (which renders it), not a state these rows can
  // express -- so a `?done=1` a friend could paste cannot show "You're in /
  // Romantic off / Business off / Friendship off" to someone who was never
  // asked about the three lenses.
  return (
    <Shell>
      <ConsentStep
        consent={me.consent}
        name={me.name}
        photoUrl={me.photoUrl}
        roomSlug={room.slug}
      />
    </Shell>
  );
}

/**
 * 390x844 is the target; the column is the same on every step.
 *
 * The `<h1>` lives here rather than in the steps, and says the same thing on
 * all four screens on purpose: Next's route announcer reads the first `<h1>`
 * whenever `document.title` is empty at commit time, so a per-step `<h1>` is
 * announced twice -- once as the heading, once as live-region text.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-10 pb-8">
      <h1 className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        hookai · intake
      </h1>
      {children}
    </main>
  );
}

/** `?room=a&room=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
