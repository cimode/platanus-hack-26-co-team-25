"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Asks the server again, every `everyMs`, until this island unmounts.
 *
 * `router.refresh()` re-requests the current route and merges the fresh
 * Server Component payload in place (Next `useRouter` docs) -- so `/quiz`
 * re-runs `quizProgress`, and the first refresh after the batch lands swaps
 * the wait screen for the block. Renders nothing; it is the smallest thing
 * that can hold a timer, which is why the wait screen itself stays a Server
 * Component. The interval is cleared on unmount, or the block that replaced
 * the wait would keep refreshing under the participant's thumb.
 */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
