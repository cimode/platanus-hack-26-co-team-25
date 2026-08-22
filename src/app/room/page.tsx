import { cookies } from "next/headers";
import Link from "next/link";
import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { serverDeps } from "@/lib/composition";
import { findParticipant } from "@/lib/use-cases/list-participants";

/**
 * Screen 1b -- the room. NOT BUILT.
 *
 * This is a landing pad, not a design. Screen 1a's CTA has to arrive somewhere,
 * and a 404 on the demo path is worse than a stub that proves the loop closes.
 * Replace wholesale when 1b is designed: draggable canvas, venue art, sprites,
 * "¿Cómo quieres conectar?".
 */
export default async function RoomPage() {
  const store = await cookies();
  const id = store.get(IMPERSONATION_COOKIE)?.value;
  const participant = id ? await findParticipant(id, serverDeps()) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="font-mono text-xs text-ink-faint lowercase">
        1b · sala · pendiente
      </p>

      <h1 className="font-display text-3xl font-extrabold text-ink">
        {participant
          ? `Estás entrando como ${participant.name}.`
          : "Nadie seleccionado."}
      </h1>

      <p className="text-sm text-ink-muted">
        {participant
          ? "La sala todavía no existe. Cuando exista, aquí es donde caes."
          : "Volvé al inicio y elegí a alguien de la lista."}
      </p>

      <Link
        className="font-display text-base font-bold text-primary underline underline-offset-4"
        href="/"
      >
        ← Volver
      </Link>
    </main>
  );
}
