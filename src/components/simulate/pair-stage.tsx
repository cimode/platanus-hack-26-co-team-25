"use client";

import { useEffect, useRef } from "react";

import { AvatarSprite, fireEvent, useEmotePlayer } from "@/components/emotes";
import { actionForEvent, emoteForLifeEvent } from "@/lib/domain/emotes/actions";
import type { AvatarKey } from "@/lib/domain/emotes/emotes";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/** How long the rail must sit still before the pair reacts. */
const SETTLE_MS = 140;

export interface PairStageProps {
  readonly subject: {
    readonly name: string;
    readonly avatar: AvatarKey | null;
  };
  readonly other: { readonly name: string; readonly avatar: AvatarKey | null };
  /** The card currently centred on the rail. Null while the rail is empty. */
  readonly event: LifeEvent | null;
  readonly className?: string;
}

/**
 * The two people, reacting to whichever year the rail is showing.
 *
 * Both avatars play the SAME emote: an event belongs to the pair, and one
 * shared reaction sidesteps a whole class of "whose turn was it" bugs. The
 * emote is the one the narrator chose for this beat, or -- for a row cached
 * before that field existed -- the deterministic map.
 *
 * The reaction waits for the rail to settle. Every scroll frame moves
 * `activeIndex`, and firing on each one restarts the clip so fast that nothing
 * is ever legible; a short debounce turns a flicker into a gesture. `play()`
 * restarts by design, so an interrupted reaction cuts cleanly rather than
 * queueing.
 */
export function PairStage({
  subject,
  other,
  event,
  className,
}: PairStageProps) {
  const left = useEmotePlayer();
  const right = useEmotePlayer();
  const leftPlay = left.play;
  const rightPlay = right.play;

  // The beat identity, not the object: `life.events` is a new array on every
  // render, so depending on `event` itself would re-fire the reaction endlessly.
  const key = event ? `${event.year}-${event.kind}` : null;
  const latest = useRef(event);
  latest.current = event;

  useEffect(() => {
    if (key === null) return;
    const timer = setTimeout(() => {
      const beat = latest.current;
      if (!beat) return;
      const emote = beat.emote ?? emoteForLifeEvent(beat.kind);
      leftPlay(emote);
      rightPlay(emote);
      // A `kid` beat is also a choreographed reveal. Nothing on this screen
      // listens yet, and `fireEvent` is a no-op without a subscriber -- so this
      // costs nothing today and works the moment <BabyOnBoard> is mounted here.
      const action = actionForEvent(beat.kind);
      if (action) fireEvent(beat.kind, action);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key, leftPlay, rightPlay]);

  return (
    <div
      className={cn(
        "flex items-end justify-center gap-10 px-6 pt-2 pb-1",
        className
      )}
    >
      <Figure
        avatar={subject.avatar}
        name={subject.name}
        playing={left.playing}
        onEnd={left.stop}
      />
      <Figure
        avatar={other.avatar}
        name={other.name}
        playing={right.playing}
        onEnd={right.stop}
      />
    </div>
  );
}

function Figure({
  avatar,
  name,
  playing,
  onEnd,
}: {
  avatar: AvatarKey | null;
  name: string;
  playing: ReturnType<typeof useEmotePlayer>["playing"];
  onEnd: () => void;
}) {
  return (
    <figure className="flex flex-col items-center gap-1.5">
      {/*
        A fixed-height slot whatever plays in it. `AvatarSprite` already keeps
        its own footprint and drops each frame onto the plate's floor line, so
        the ONE thing this wrapper must not do is resize with the reaction.
        Rows with no plate on file render the slot empty rather than a broken
        sprite -- the reaction still exists, it just has no body to play on.
      */}
      <div className="flex h-[92px] items-end">
        {avatar ? (
          <AvatarSprite
            avatar={avatar}
            height="92px"
            label={name}
            onEnd={onEnd}
            playing={playing}
          />
        ) : null}
      </div>
      <figcaption className="font-mono text-[11px] text-ink-faint lowercase">
        {name}
      </figcaption>
    </figure>
  );
}
