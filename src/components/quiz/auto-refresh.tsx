"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Asks the server again, roughly every `everyMs`, until this island unmounts.
 *
 * `router.refresh()` re-requests the current route and merges the fresh
 * Server Component payload in place (Next `useRouter` docs) -- so `/quiz`
 * re-runs `quizProgress`, and the first refresh after the batch lands swaps
 * the wait screen for the block. Renders nothing; it is the smallest thing
 * that can hold a timer, which is why the wait screen itself stays a Server
 * Component. The timer is cleared on unmount, or the block that replaced the
 * wait would keep refreshing under the participant's thumb.
 *
 * Two guards, both about the same moment -- a hundred phones on this screen at
 * once, on venue wifi, while the server is busy writing their questions:
 *
 *  - ROUGHLY, not exactly. An exact interval would make a registration burst
 *    poll in unison for as long as it waits, a self-inflicted herd against the
 *    very requests doing the work. Each tick waits `everyMs` plus up to two
 *    seconds of jitter, re-armed with `setTimeout` so offsets accumulate.
 *  - ONE IN FLIGHT. `router.refresh()` is queued, not coalesced: once a
 *    refresh takes longer than the interval, an interval would stack them and
 *    the phone would hammer a server that is already slow. `useTransition`
 *    reports when one is still running, and that tick is skipped.
 */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Read inside the timer, so the callback never closes over a stale value.
  const pending = useRef(isPending);
  pending.current = isPending;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(
        () => {
          if (!pending.current) {
            startTransition(() => {
              router.refresh();
            });
          }
          tick();
        },
        everyMs + Math.random() * 2000
      );
    };
    tick();
    return () => clearTimeout(timer);
  }, [router, everyMs]);

  return null;
}
