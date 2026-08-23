import type { ReactNode } from "react";
import { AvatarSprite } from "@/components/emotes/avatar-sprite";
import type { Playing } from "@/components/emotes/use-emote-player";
import type { Avatar } from "@/lib/domain/participant/avatar";
import { cn } from "@/lib/utils";

/**
 * The scene stage: the participant's own avatar tells the scene (style "B ·
 * Diálogo" from the product owner's mock-up). The sprite stands on the left,
 * feet on the bubble's baseline; the speech bubble on the right carries
 * whatever the screen has to say -- a scenario, the opening line, the wait.
 *
 * The drawing is the emotes library's `AvatarSprite`, the same element the
 * room uses, so the person who picks their way through twelve scenes is
 * visibly the same body that later stands in the crowd. It is the one client
 * component in here; this file itself has no `"use client"`, so the opening
 * beat and the wait screen render it on the server and only the block island
 * pulls it into the client bundle, where `playing` makes the sprite react.
 *
 * No preload of the reaction sheets from here: the avatar's full catalogue is
 * ~2MB and this is a phone on venue wifi. The idle plate is the only image a
 * first paint needs; whoever wants a reaction warms that one sheet itself.
 *
 * The tail is two CSS triangles, border colour outside and card colour inside,
 * offset by the ring width so they read as one outlined shape -- no image, so
 * it follows the tokens wherever the lens goes. With no avatar (a row from
 * before the column existed) the bubble stands alone at full width and the
 * tail goes with the sprite it would have pointed at.
 */
export function SceneStage({
  avatar,
  eyebrow,
  children,
  playing = null,
  onEnd,
  live = false,
  className,
}: {
  avatar: Avatar | null;
  /** The mono line above the text, e.g. "escena 3 de 12". */
  eyebrow?: string;
  children: ReactNode;
  /** From `useEmotePlayer`; null is idle. Only the block island sets it. */
  playing?: Playing | null;
  onEnd?: () => void;
  /** The bubble is a live region: the wait screen announces itself. */
  live?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-end gap-3", className)}>
      {avatar && (
        <AvatarSprite
          avatar={avatar}
          className="shrink-0"
          height="8.5rem"
          label="Tu avatar"
          onEnd={onEnd}
          playing={playing}
          preload={false}
        />
      )}

      <div
        aria-live={live ? "polite" : undefined}
        className={cn(
          "relative min-w-0 flex-1 rounded-2xl border-2 border-border bg-card px-4 py-3 shadow-card",
          avatar &&
            "before:absolute before:bottom-5 before:-left-4 before:h-0 before:w-0 before:border-8 before:border-transparent before:border-r-border before:content-['']",
          avatar &&
            "after:absolute after:bottom-[22px] after:-left-[10px] after:h-0 after:w-0 after:border-[6px] after:border-transparent after:border-r-card after:content-['']"
        )}
        role={live ? "status" : undefined}
      >
        {eyebrow && (
          <p className="mb-1 font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
            {eyebrow}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The bubble's line, sized for the copy it has to hold. Scenarios are capped
 * at 220 characters (docs/design/CLAUDE_DESIGN_QUIZ_BLOCK.md); the long end
 * steps the type down one notch rather than pushing the four rows below the
 * fold at 390x844 -- the size is capped, never the content.
 */
export function SceneText({ text }: { text: string }) {
  return (
    <p
      className={cn(
        "font-sans leading-snug font-semibold text-pretty text-ink",
        text.length > 160 ? "text-[15px]" : "text-base"
      )}
    >
      {text}
    </p>
  );
}
