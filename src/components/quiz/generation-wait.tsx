import type { Avatar } from "@/lib/domain/participant/avatar";
import { AutoRefresh } from "./auto-refresh";
import { SceneStage } from "./scene-stage";

/**
 * The screen for a participant who has outrun the writer (docs/domain.md
 * D16): the block they need is not stored yet, and reads never generate.
 *
 * Same column as `src/app/quiz/loading.tsx`, so the Suspense fallback and this
 * resolve into each other without a jump -- the difference is that this one
 * knows the avatar, and carries the island that asks again. `AutoRefresh`
 * re-renders the route every few seconds; the moment the chain behind
 * `continueQuizGeneration` lands the batch, the same URL answers with the
 * block and this screen is simply gone. No polling endpoint, no client state:
 * the rows are the state, and `router.refresh()` re-reads them.
 *
 * The bubble is the live region (`role="status"`, polite) so a screen reader
 * hears why nothing is happening, and is not interrupted when the block
 * replaces it.
 */
export function GenerationWait({ avatar }: { avatar: Avatar | null }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6 py-10">
      <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        dipia · quiz
      </p>

      <SceneStage avatar={avatar} live>
        <p className="font-sans text-base leading-snug font-semibold text-pretty text-ink">
          Escribiendo tus preguntas…
        </p>
        <p className="mt-1 font-mono text-xs tracking-[0.06em] text-ink-muted lowercase motion-safe:animate-pulse">
          unos segundos más
        </p>
      </SceneStage>

      <AutoRefresh everyMs={3000} />
    </main>
  );
}
