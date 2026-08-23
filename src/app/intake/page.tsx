import { redirect } from "next/navigation";
import { FLOW_REGISTER_STEP } from "@/components/intake/flow-progress";
import { IntakeShell } from "@/components/intake/intake-shell";
import { RegisterForm } from "@/components/intake/register-form";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { intakeStepOf } from "@/lib/domain/participant";

/**
 * `/intake` -- the one registration screen (issue #42, docs/domain.md D18).
 *
 * A Server Component. It resolves the room, resolves the participant from the
 * httpOnly cookie and picks the screen FROM THE ROWS: `intakeStepOf` is the
 * whole rule, and there is no step column and there must never be one -- a
 * status field can claim a state the data does not support, and this way a
 * reload always lands exactly where the data says (§0, §5).
 *
 * Everything a participant sees here is their own row, read through
 * `bySessionToken`. Nobody else's name or photo is fetched, so none can leak.
 *
 * A plain render, and nothing behind it. This page used to warm a per-room
 * pool of authored forms in `after()` and carry a 300s `maxDuration` to pay
 * for it; the questions come from the committed bank now (docs/domain.md D21),
 * so there is nothing to warm, nothing to schedule and nothing to budget for.
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
            Esta sala no existe.
          </h2>
          <p className="text-sm text-ink-muted">
            Escanea otra vez el código de la pared, o pídele el enlace bueno a
            quien te lo pasó.
          </p>
        </section>
      </IntakeShell>
    );
  }

  const token = await readSessionToken();
  const me = token ? await deps.participants.bySessionToken(token) : null;

  if (intakeStepOf(me) === "quiz") redirect("/quiz");

  return (
    <IntakeShell step={FLOW_REGISTER_STEP}>
      <RegisterForm roomSlug={room.slug} />
    </IntakeShell>
  );
}

/** `?room=a&room=b` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
