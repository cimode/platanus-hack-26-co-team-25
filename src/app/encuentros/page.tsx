import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { respondMeetAction } from "@/app/encuentros/actions";
import { MeetPoll } from "@/components/meet/poll";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import type { MeetRequestView } from "@/lib/domain/meet/meet";
import { placeLabel, timeLabel } from "@/lib/domain/meet/meet";
import { cn } from "@/lib/utils";

/**
 * `/encuentros` — the meet loop's one screen.
 *
 * BOTH halves live here on purpose. The recipient's inbox and the sender's
 * status are the same two lists over the same rows, and splitting them would
 * mean two routes, two polls and two things to open in the gate. One screen
 * also makes the round trip legible: you ask from `/simulate`, and everything
 * that happens afterwards happens in one place you can keep open.
 *
 * OPEN IN THE GATE (`src/lib/site-gate/gate.ts`), like `/results`. Every other
 * screen past the quiz is behind the password, so a gated inbox would be an
 * inbox no participant could reach during the only window that matters.
 * Identity is still `dipia_session` through `resolveViewerId`, so opening the
 * route opens nobody's requests but your own.
 *
 * Dynamic by construction: `resolveViewerId` reads cookies, so this never
 * prerenders and every visitor gets their own rows.
 */
export default async function EncuentrosPage() {
  const deps = serverDeps();
  const viewerId = await resolveViewerId(deps);

  // No session and no impersonation is a browser that has not registered.
  // `/intake` is open too, so this is a road onward rather than a wall.
  if (!viewerId) redirect("/intake");

  const { received, sent } = await deps.meets.inbox(viewerId);

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-6 pt-5 pb-14">
      <MeetPoll />

      <header className="flex items-center gap-1.5">
        <Link
          aria-label="Volver"
          className="-ml-1 shrink-0 text-ink-muted transition-colors hover:text-ink"
          href="/results"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="font-display font-extrabold text-[26px] text-ink leading-none">
          Encuentros
        </h1>
      </header>

      <Received requests={received} />
      <Sent requests={sent} />

      <p className="mt-auto pt-4 font-mono text-[10px] text-ink-faint lowercase">
        esta pantalla se actualiza sola · déjala abierta
      </p>
    </main>
  );
}

function Received({ requests }: { requests: readonly MeetRequestView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10.5px] text-ink-faint uppercase tracking-[0.1em]">
        te escribieron
      </h2>

      {requests.length === 0 ? (
        <Empty>Todavía nadie te ha propuesto un encuentro.</Empty>
      ) : (
        requests.map((request) => (
          <article
            className="flex flex-col gap-3 rounded-[18px] border-2 border-primary/55 bg-card p-4 shadow-toy"
            key={request.id}
          >
            <div className="flex flex-col gap-1">
              <p className="font-display font-extrabold text-[17px] text-ink leading-tight">
                {request.counterpartName} quiere conocerte
              </p>
              <p className="font-display text-[13.5px] text-ink-muted leading-snug">
                {placeLabel(request.place)} · {timeLabel(request.time)}
              </p>
            </div>

            <div className="flex gap-2">
              {/*
                Two forms rather than one with two submit buttons: a decision
                this consequential should not depend on which button the
                browser decided was the default when Enter was pressed.
              */}
              <form action={respondMeetAction} className="flex-1">
                <input name="requestId" type="hidden" value={request.id} />
                <input name="decision" type="hidden" value="accept" />
                <button
                  className={cn(
                    "w-full rounded-[13px] bg-primary px-4 py-2.5",
                    "font-display font-bold text-[15px] text-primary-foreground shadow-toy",
                    "transition-transform active:translate-y-px",
                    "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                  )}
                  type="submit"
                >
                  Aceptar
                </button>
              </form>

              <form action={respondMeetAction}>
                <input name="requestId" type="hidden" value={request.id} />
                <input name="decision" type="hidden" value="decline" />
                <button
                  className={cn(
                    "rounded-[13px] border-2 border-ink-faint/40 px-4 py-2.5",
                    "font-display font-bold text-[15px] text-ink-muted",
                    "transition-colors hover:border-ink-faint/70 hover:text-ink",
                    "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
                  )}
                  type="submit"
                >
                  Ahora no
                </button>
              </form>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

/**
 * What the SENDER sees.
 *
 * `pending` and `declined` are rendered as two different lines, and that is a
 * deliberate limit rather than an accident: the sender learns the outcome of
 * their own request and nothing else -- not who else was asked, not how many
 * declined, not when. No other participant's state is on this screen.
 */
function Sent({ requests }: { requests: readonly MeetRequestView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[10.5px] text-ink-faint uppercase tracking-[0.1em]">
        lo que propusiste
      </h2>

      {requests.length === 0 ? (
        <Empty>
          Todavía no has propuesto ninguno. Se propone al final de una vida
          simulada.
        </Empty>
      ) : (
        requests.map((request) => (
          <article
            className="flex items-center gap-3 rounded-[18px] bg-card p-4 shadow-[0_3px_0_rgba(51,38,29,0.12)]"
            key={request.id}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-display font-bold text-[15.5px] text-ink">
                {request.counterpartName}
              </p>
              <p className="font-display text-[12.5px] text-ink-muted leading-snug">
                {placeLabel(request.place)} · {timeLabel(request.time)}
              </p>
            </div>
            <StatusPill status={request.status} />
          </article>
        ))
      )}
    </section>
  );
}

function StatusPill({ status }: { status: MeetRequestView["status"] }) {
  const copy = {
    pending: "esperando",
    accepted: "¡aceptó!",
    declined: "ahora no",
  }[status];

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1 font-mono text-[10px] lowercase",
        status === "accepted" && "bg-primary text-primary-foreground",
        status === "pending" && "bg-ink-faint/15 text-ink-muted",
        status === "declined" && "bg-ink-faint/10 text-ink-faint"
      )}
    >
      {copy}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[16px] border-2 border-ink-faint/25 border-dashed px-4 py-6 text-center font-mono text-[11px] text-ink-muted leading-relaxed lowercase">
      {children}
    </p>
  );
}
