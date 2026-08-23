import { redirect } from "next/navigation";
import { after } from "next/server";
import { FLOW_REGISTER_STEP } from "@/components/intake/flow-progress";
import { IntakeShell } from "@/components/intake/intake-shell";
import { RegisterForm } from "@/components/intake/register-form";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { intakeStepOf } from "@/lib/domain/participant";
import { topUpQuizPool } from "@/lib/use-cases/ensure-quiz-batch";
import { poolSlots, poolTarget } from "./pool-target";

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
 * Rendering the form is also the earliest moment we know someone is about to
 * register, so it schedules `topUpQuizPool` in `after()` (docs/domain.md D20):
 * whole forms are written for the room while the person is still filling
 * this one, and `registerAction` adopts one on submit -- so the quiz never
 * waits on a model, not even at block 6 or 11. Only the
 * form branch schedules it -- a redirect means the person already has rows.
 * The callback reads nothing from `cookies()` / `headers()`: a Server
 * Component's `after()` may not touch request APIs, so the room id is read
 * during render and closed over.
 */

/**
 * Server Actions take the *page's* `maxDuration`, not their own (the Next
 * route-segment config doc is explicit), and so does `after()`.
 * `registerAction` chains up to three batches of authoring in `after()` --
 * batch 1 when no pool set could be adopted, then 2 and 3 -- at ~40-70s each,
 * so the budget has to cover the whole chain or it is cut off mid-batch.
 * 300s is the Fluid Compute ceiling on the Pro project this deploys to;
 * `continueQuizGeneration` stops itself at 240s so the last batch it starts
 * still finishes inside it.
 */
export const maxDuration = 300;

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

  // Closed over as a plain string: nothing request-scoped inside the callback.
  const roomId = room.id;
  const target = poolTarget();
  const slots = poolSlots();
  after(() => topUpQuizPool({ roomId, target, slots }, serverDeps()));

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
