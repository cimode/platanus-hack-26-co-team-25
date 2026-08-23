import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LensPicker } from "@/components/room/lens-picker";
import { RoomCanvas } from "@/components/room/room-canvas";
import { resolveViewerId } from "@/lib/adapters/http/viewer";
import { serverDeps } from "@/lib/composition";
import { enterRoom } from "@/lib/use-cases/enter-room";
import { cn } from "@/lib/utils";

/**
 * Screen 1b -- the room.
 *
 * Identity comes from `resolveViewerId`: the impersonation cookie when the demo
 * console set one, otherwise the participant behind `dipia_session`. That
 * second half is what lets someone who registered and finished the quiz walk
 * into the room they belong to instead of being bounced to `/`, which is the
 * internal chooser and lists every name in the venue.
 *
 * A Server Component: it resolves who you are, places everyone else, and hands
 * the finished layout down. Only the canvas and the lens card are client
 * islands, because only they need pointer handlers and live state.
 *
 * The venue fills the whole screen and everything else floats over it. That is
 * the point of the screen -- you are IN the room, not looking at a picture of
 * one with controls underneath.
 */
export default async function RoomPage() {
  const deps = serverDeps();
  const meId = await resolveViewerId(deps);
  const { me, others } = await enterRoom(meId ?? undefined, deps);

  // A room with no `me` is a broken session, not an empty state: neither cookie
  // resolves to anyone on the roster. Send them back to pick again rather than
  // render a screen that cannot do anything.
  if (!me) redirect("/");

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 overflow-hidden bg-dark">
      <RoomCanvas spots={others} />

      <Link
        aria-label="Volver a elegir usuario"
        className={cn(
          "absolute top-4 left-4 z-30 rounded-full bg-dark/70 p-2 text-background",
          "backdrop-blur-sm transition-colors hover:bg-dark/90",
          "focus-visible:outline-2 focus-visible:outline-background"
        )}
        href="/"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Link>

      <LensPicker people={others.length} />

      <p
        className={cn(
          "-translate-x-1/2 absolute bottom-11 left-1/2 z-20 whitespace-nowrap",
          "rounded-full bg-dark/70 px-3 py-1.5 backdrop-blur-sm",
          "font-mono text-[10.5px] text-background lowercase"
        )}
      >
        ⟷ arrastra el lienzo · {me.name}
      </p>
    </main>
  );
}
