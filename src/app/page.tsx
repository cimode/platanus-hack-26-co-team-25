import { ImpersonateForm } from "@/components/impersonate/impersonate-form";
import { serverDeps } from "@/lib/composition";
import { listParticipants } from "@/lib/use-cases/list-participants";

/**
 * Screen 1a -- login / impersonate.
 *
 * A Server Component: it calls the use case, hands the roster down, and stays
 * off the wire. `"use client"` lives on the form island, not here.
 */
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
