"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The whole "notification" mechanism, and deliberately the cheapest one that
 * works.
 *
 * Web Push would need a manifest, a service worker and VAPID keys, and on iOS
 * it only fires for a PWA the participant installed to their home screen --
 * none of which this app has. A ten-second `router.refresh()` on ONE screen
 * costs one RSC round trip, needs no permission prompt, and is indistinguishable
 * from a push at the timescale two people in the same room care about.
 *
 * It refreshes the SERVER component above it, so the new rows arrive rendered;
 * there is no client-side store to keep in sync and nothing to reconcile.
 *
 * Paused while the tab is hidden: a phone in a pocket polling every ten seconds
 * for an afternoon is a battery cost with no reader on the other end.
 */
export function MeetPoll({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, everyMs);
    // Coming back to the tab should not wait out the rest of the interval.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);

  return null;
}
