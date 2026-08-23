"use client";

import { useEffect, useRef } from "react";

import { AvatarSprite, useEmotePlayer } from "@/components/emotes";
import { emoteForLifeEvent } from "@/lib/domain/emotes/actions";
import type { AvatarKey, ReactionEmote } from "@/lib/domain/emotes/emotes";
import type { EventKind } from "@/lib/domain/reveal/timeline";

/**
 * The two of them, walking the path -- and acting out the tile they stand on.
 *
 * Idle is still the plate with `@utility walking` (already in `globals.css` and
 * already listed under `prefers-reduced-motion`). What is new is that landing
 * on a tile plays that beat's reaction: the emote the narrator chose alongside
 * the sentence, or the deterministic map for a life cached before that field
 * existed. Both figures play the SAME emote -- the event belongs to the pair,
 * and one shared reaction sidesteps a whole class of "whose turn was it" bugs.
 *
 * The reaction waits for the board to settle. Dragging moves the active tile
 * every frame, and firing on each one restarts the clip faster than it can be
 * read; a short debounce turns a flicker into a gesture. `play()` restarts by
 * design, so an interrupted reaction cuts cleanly rather than queueing.
 *
 * `AvatarSprite` keeps its own footprint and drops every frame onto the plate's
 * floor line, so a reaction never moves either figure off the tile -- which is
 * the one thing a spritesheet swap has to get right here.
 */

/** How long the board must sit still before the pair reacts. */
const SETTLE_MS = 140;

/** The plates the board falls back to when the pair's own are not known. */
const DEFAULT_A: AvatarKey = "avatar1";
const DEFAULT_B: AvatarKey = "avatar3";

/** Matches the bare plate the walking bob was drawn against. */
const FIGURE_HEIGHT = "46px";

export interface WalkingPairProps {
  /** The tile the pair is standing on; null leaves them idling. */
  readonly beat?: {
    readonly year: number;
    readonly kind: EventKind;
    readonly emote?: ReactionEmote;
  } | null;
  readonly avatarA?: AvatarKey | null;
  readonly avatarB?: AvatarKey | null;
}

export function WalkingPair({
  beat = null,
  avatarA,
  avatarB,
}: WalkingPairProps) {
  const left = useEmotePlayer();
  const right = useEmotePlayer();
  const leftPlay = left.play;
  const rightPlay = right.play;

  // The beat's identity, not the object: `events` is a fresh array on every
  // render, so depending on the object itself would re-fire forever.
  const key = beat ? `${beat.year}-${beat.kind}` : null;
  const latest = useRef(beat);
  latest.current = beat;

  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => {
      const current = latest.current;
      if (!current) return;
      const emote = current.emote ?? emoteForLifeEvent(current.kind);
      leftPlay(emote);
      rightPlay(emote);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, leftPlay, rightPlay]);

  return (
    <span aria-hidden="true" className="relative flex items-end gap-0.5">
      <Figure
        avatar={avatarA ?? DEFAULT_A}
        onEnd={left.stop}
        playing={left.playing}
      />
      <Figure
        avatar={avatarB ?? DEFAULT_B}
        delay="-0.4s"
        onEnd={right.stop}
        playing={right.playing}
      />
    </span>
  );
}

function Figure({
  avatar,
  playing,
  onEnd,
  delay,
}: {
  avatar: AvatarKey;
  playing: ReturnType<typeof useEmotePlayer>["playing"];
  onEnd: () => void;
  delay?: string;
}) {
  // Idle keeps the original bare-plate bob; only a reaction swaps in the
  // sprite, so the board looks exactly as designed until something happens.
  if (!playing) {
    return (
      <span
        className="walking pixelated block h-[46px] w-[26px] bg-bottom bg-contain bg-no-repeat"
        style={{
          backgroundImage: `url(/sprites/${avatar}.png)`,
          ...(delay ? { animationDelay: delay } : {}),
        }}
      />
    );
  }

  return (
    <AvatarSprite
      avatar={avatar}
      height={FIGURE_HEIGHT}
      onEnd={onEnd}
      playing={playing}
    />
  );
}
