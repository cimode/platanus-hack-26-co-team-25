"use client";

import { cn } from "@/lib/utils";

/**
 * The live app, embedded in the deck.
 *
 * The whole reason this exists: on stage there must be NO context switch. The
 * app is not a screenshot and not another window -- it is an iframe of the real
 * app, same origin, so the site-gate cookie and the session cookie already
 * apply and nothing has to be logged into twice.
 *
 * It opens at `/` -- the impersonate roster -- and then gets out of the way.
 * There is deliberately no route switcher: the demo is one continuous flow
 * (elegir persona -> formulario -> ranking -> línea de tiempo -> la sala) that a
 * teammate drives by clicking inside the frame, exactly as a participant would.
 * Chips that jump between routes would make it read as a tour of screens rather
 * than a product being used, and they are one more thing to mis-click live.
 *
 * The cost of driving it by click: once a click lands inside the iframe,
 * `keydown` fires in the iframe's document and never reaches the deck, so
 * arrow-key navigation silently dies. The deck's on-screen controls are the
 * recovery path, not decoration. See `demo-deck.tsx`.
 */
export function BrowserFrame({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-toy-lg",
        className
      )}
    >
      {/* Chrome. Cosmetic, but it is what makes the embed read as "the
          product" instead of "a slide about the product". */}
      <div className="flex shrink-0 items-center gap-3 border-border border-b px-4 py-3">
        <div className="flex gap-2" aria-hidden>
          <span className="size-3 rounded-full bg-primary" />
          <span className="size-3 rounded-full bg-friction" />
          <span className="size-3 rounded-full bg-ink-faint" />
        </div>
        <div className="flex-1 truncate rounded-full bg-surface-alt px-4 py-1.5 text-center font-mono text-ink-muted text-sm">
          dipia.lat
        </div>
      </div>

      <iframe
        src="/"
        title="dipia en vivo"
        className="min-h-0 flex-1 border-0 bg-background"
      />
    </div>
  );
}
