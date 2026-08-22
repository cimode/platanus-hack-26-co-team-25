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
  const roster = await listParticipants(serverDeps());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-12 pb-8">
      <header className="mb-14">
        <p className="font-display text-5xl leading-none font-extrabold tracking-tight text-ink lowercase">
          dipia<span className="text-primary">.</span>
        </p>
        <p className="mt-2 font-mono text-xs tracking-[0.06em] text-ink-muted lowercase">
          simula la vida que aún no ha pasado
        </p>
      </header>

      <ImpersonateForm roster={roster} />
    </main>
  );
}
