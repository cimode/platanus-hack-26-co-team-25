"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeEmote } from "@/components/emotes/emote-bus";
import {
  type AvatarKey,
  type Emote,
  emoteSheet,
} from "@/lib/domain/emotes/emotes";

/** What an avatar is doing right now. `take` changes on every play so a repeat restarts. */
export interface Playing {
  readonly emote: Emote;
  readonly take: number;
  /** Forced on or off by the caller; undefined lets the sheet decide (locomotion loops). */
  readonly loop?: boolean;
}

export interface EmotePlayer {
  readonly playing: Playing | null;
  /** Play an emote now; a second call restarts it. `loop` overrides the sheet's default. */
  readonly play: (emote: Emote, options?: { readonly loop?: boolean }) => void;
  /** Back to idle. Also what `AvatarSprite` calls when a one-shot ends. */
  readonly stop: () => void;
}

/**
 * Direct control of one avatar -- a profile, a match reveal, a tutorial.
 *
 *   const player = useEmotePlayer();
 *   <AvatarSprite avatar="avatar2" height="120px" playing={player.playing} onEnd={player.stop} />
 *   <button onClick={() => player.play("celebrate")}>…</button>
 */
export function useEmotePlayer(): EmotePlayer {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const play = useCallback<EmotePlayer["play"]>((emote, options = {}) => {
    setPlaying((prev) => ({
      emote,
      loop: options.loop,
      take: (prev?.take ?? 0) + 1,
    }));
  }, []);
  const stop = useCallback(() => setPlaying(null), []);
  return { playing, play, stop };
}

/**
 * A participant's avatar: plays whatever `reactToEvent` / `dispatchEmote`
 * sends to that participant id. Emotes the avatar has no sheet for are
 * ignored, so the sprite never goes blank.
 */
export function useParticipantEmotes(
  participantId: string,
  avatar: AvatarKey | null
): EmotePlayer {
  const player = useEmotePlayer();
  const { play } = player;
  useEffect(() => {
    if (!avatar) return;
    return subscribeEmote(participantId, (emote, options) => {
      if (emoteSheet(avatar, emote)) play(emote, options);
    });
  }, [participantId, avatar, play]);
  return player;
}
