import { ChevronLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IMPERSONATION_COOKIE } from "@/app/impersonation";
import { LensPicker } from "@/components/room/lens-picker";
import { RoomCanvas } from "@/components/room/room-canvas";
import { serverDeps } from "@/lib/composition";
import { enterRoom } from "@/lib/use-cases/enter-room";

/**
 * Screen 1b -- the room.
 *
 * A Server Component: it resolves who you are, places everyone else, and hands
 * the finished layout down. Only the canvas is a client island, because only
 * the canvas needs pointer handlers.
 */
export default async function RoomPage() {
  const store = await cookies();
  const { me, others } = await enterRoom(
    store.get(IMPERSONATION_COOKIE)?.value,
    serverDeps()
  );

  // A room with nobody in it is not an empty state, it is a broken session:
  // the cookie is missing or names someone off the roster. Send them back to
  // pick again rather than render a screen that cannot do anything.
  if (!me) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="flex items-center gap-3 px-6 pt-6 pb-4">
        <Link
          aria-label="Volver a elegir usuario"
          className="-ml-1 rounded-full p-1 text-ink transition-colors hover:bg-surface-alt"
          href="/"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="flex-1 font-display text-xl font-extrabold text-ink">
          La sala
        </h1>
        <span className="rounded-full bg-surface-alt px-3 py-1 font-mono text-[11px] text-ink-soft lowercase">
          {me.name}
        </span>
      </header>

      <section className="relative min-h-64 flex-1 overflow-hidden bg-dark">
        <RoomCanvas spots={others} />
      </section>

      {/* Below the plate, not over it: on the art this line landed on the
          ceiling pipes and was unreadable at every scroll position. */}
      <p className="pt-2 text-center font-mono text-[10px] tracking-[0.06em] text-ink-faint lowercase">
        ⟷ solo arrastre horizontal
      </p>

      <section className="px-6 pt-6 pb-8">
        <LensPicker />
      </section>
    </main>
  );
}
