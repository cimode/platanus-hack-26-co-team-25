import { redirect } from "next/navigation";
import { ConsentStep } from "@/components/intake/consent-step";
import { IntakeShell } from "@/components/intake/intake-shell";
import { PhotoStep } from "@/components/intake/photo-step";
import { RegisterForm } from "@/components/intake/register-form";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { DECLARED_BAND_KEYS } from "@/lib/domain/participant";

/**
 * `/intake` -- register, photo, consent (docs/domain.md §0, issue #6).
 *
 * A Server Component. It resolves the room, resolves the participant from the
 * httpOnly cookie and picks the step FROM THE ROWS: no cookie or an unknown
 * token is step 1, a null `photo_url` is step 2, a declared round that has
 * begun is step 4's business, and anything else is step 3. There is no step
 * column and there must never be one -- a status field can claim a state the
 * data does not support, and this way a reload always lands exactly where the
 * data says (§0, §5).
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
      <IntakeShell>
        <section className="flex flex-1 flex-col justify-center gap-3">
          <h2 className="font-display text-2xl font-extrabold text-ink">
            This room doesn&apos;t exist.
          </h2>
          <p className="text-sm text-ink-muted">
            Scan the QR code on the wall again, or ask whoever handed you this
            link for the right one.
          </p>
        </section>
      </IntakeShell>
    );
  }

  const token = await readSessionToken();
  const me = token ? await deps.participants.bySessionToken(token) : null;

  if (!me) {
    return (
      <IntakeShell>
        <RegisterForm roomSlug={room.slug} />
      </IntakeShell>
    );
  }

  if (!me.photoUrl) {
    return (
      <IntakeShell>
        <PhotoStep roomSlug={room.slug} />
      </IntakeShell>
    );
  }

  // The declared round has begun, so this participant is past consent: one
  // tapped band or one picked tag is the row-level fact that says so
  // (docs/domain.md §0 -- progress is read from the rows). `declaredAt` is
  // included for the participant who finished the round and came back here.
  const declaredStarted =
    me.declaredAt !== null ||
    me.declared.tags.length > 0 ||
    DECLARED_BAND_KEYS.some((band) => me.declared[band] !== null);
  if (declaredStarted) redirect("/intake/declared");

  return (
    <IntakeShell>
      <ConsentStep
        consent={me.consent}
        name={me.name}
        photoUrl={me.photoUrl}
        roomSlug={room.slug}
      />
    </IntakeShell>
  );
}

/** `?room=a&room=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
