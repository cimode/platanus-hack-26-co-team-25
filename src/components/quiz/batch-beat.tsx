import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Avatar } from "@/lib/domain/participant/avatar";
import { SceneStage, SceneText } from "./scene-stage";

/**
 * The opening moment (issue #9, `CLAUDE_DESIGN_QUIZ_BLOCK.md` §3).
 *
 * Once this file held the two between-batch beats as well ("Tanda 2 de 3").
 * They are gone, and so is the wait screen that replaced them: the twelve
 * blocks are dealt from the committed bank and stored at registration
 * (docs/domain.md D21), so nothing is ever being written while somebody reads
 * -- there is no pacing left for a beat to buy. What survives is the one line
 * that sets the rules before block 1, told by the participant's own avatar.
 *
 * Presentational and server-rendered: it holds no state, so it stays off the
 * client bundle. `?start=1` dismisses it. Progress is read from the rows, so
 * the beat cannot be "already dismissed" in a column: the URL is the whole of
 * that state, and a reload without it simply shows the moment again.
 */
export function OpeningBeat({
  avatar,
  photoUrl,
}: {
  avatar: Avatar | null;
  photoUrl: string | null;
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center gap-8 overflow-hidden px-6 py-10">
      <p className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        dipia · quiz
      </p>

      <SceneStage avatar={avatar} photoUrl={photoUrl}>
        <SceneText text="Doce escenas. En cada una, toca la opción que más se parece a ti. No hay respuestas correctas." />
      </SceneStage>

      <Button
        asChild
        className="h-12 w-full rounded-2xl font-display text-base font-bold shadow-toy"
      >
        <Link href="/quiz?start=1">Empezar</Link>
      </Button>
    </main>
  );
}
