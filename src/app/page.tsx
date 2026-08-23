import { connection } from "next/server";
import { ImpersonateForm } from "@/components/impersonate/impersonate-form";
import { serverDeps } from "@/lib/composition";
import { listParticipants } from "@/lib/use-cases/list-participants";

/**
 * Screen 1a -- login / impersonate.
 *
 * A Server Component: it calls the use case, hands the roster down, and stays
 * off the wire. `"use client"` lives on the form island, not here.
 */
/**
 * Server Actions take the *page's* `maxDuration`, not their own (see the Next
 * docs for the route-segment config). `impersonateAction` schedules block
 * authoring in `after()`, which runs after the response but inside this budget
 * -- so without this the background work would be cut off mid-batch.
 *
 * 120s is deliberately under every plan's ceiling; `docs/ci.md` notes the Hobby
 * number has moved more than once and was never confirmed here. A batch is
 * measured at ~40-70s.
 */
export const maxDuration = 120;

export default async function Home() {
  /*
   * Stop prerendering before the roster is read.
   *
   * The roster now comes from the `participants` table, and a Drizzle query is
   * not a Request-time API -- so without this the page is prerendered AT BUILD
   * and the chooser freezes at whoever had registered when the deploy ran.
   * People are filling the form during the event; a login screen that cannot
   * see them is the demo failing quietly.
   *
   * `connection()` rather than `export const dynamic`: the segment config is
   * removed under Cache Components (route-segment-config docs, v16 history),
   * and this is the documented way to say "different output per request" for a
   * page that touches no cookie
   * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`).
   */
  await connection();
  const roster = await listParticipants(serverDeps());

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-7 pt-20 pb-10">
      <VenuePlate />

      <header className="relative">
        <p className="font-display font-extrabold text-[52px] text-ink leading-none lowercase tracking-tight">
          dipia<span className="text-primary">.</span>
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-ink-muted lowercase tracking-[0.06em]">
          simula la vida que aún no ha pasado
        </p>
      </header>

      <ImpersonateForm roster={roster} />
    </main>
  );
}

/**
 * The room, glimpsed from the login screen.
 *
 * A still of the same venue the room itself uses, so entering feels like
 * walking into the picture you were already looking at.
 *
 * The veil is CREAM, not a dark scrim: it fades the page's own background DOWN
 * over the top edge of the art so the plate emerges from the screen rather than
 * being pasted onto it. A dark overlay -- which is what this screen shipped
 * with first -- muddies the art and breaks the warm palette in one stroke.
 *
 * `object-position: center 70%` keeps the FLOOR in frame as the crop tightens;
 * centring it would show ceiling pipes on a short screen.
 */
function VenuePlate() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pixelated absolute inset-x-0 bottom-0 h-[260px] bg-cover opacity-90"
        style={{
          backgroundImage: "url(/venue.jpg)",
          backgroundPosition: "center 70%",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[280px]"
        style={{
          backgroundImage:
            "linear-gradient(180deg, var(--background) 0%, color-mix(in oklab, var(--background) 55%, transparent) 55%, transparent 100%)",
        }}
      />
    </>
  );
}
