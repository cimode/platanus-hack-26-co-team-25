"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SpriteSource } from "@/components/emotes/avatar-sprite";
import { compositeClip } from "@/components/faces/composite";
import {
  type AvatarKey,
  emoteSheet,
  isEmote,
  plateUrl,
} from "@/lib/domain/emotes/emotes";
import {
  FACE_PLATE,
  faceCacheKey,
  faceClips,
  faceSheet,
} from "@/lib/domain/faces/faces";

/**
 * The participant's own face, on their own avatar, wherever it is drawn.
 *
 * Hand what this returns to `AvatarSprite`'s `source` and every clip it draws
 * comes back with the face in it. Until a clip is composited the sprite draws
 * the plain artwork, which is what the screen showed before this existed --
 * so a slow phone, a photo the bucket served without CORS headers, or an
 * avatar nobody packed faces for all degrade to "the avatar, without a face",
 * never to a blank box.
 *
 * The idle plate is composited first because it is what is on screen almost
 * all of the time; the reaction sheets follow one at a time in the background,
 * so an emote that fires a second later already has its face on and the work
 * yields between clips instead of blocking a tap. Results are cached across
 * components by `(avatar, clip, photo)`, which is why a room of twenty people
 * wearing four avatars does four avatars' worth of work, not twenty.
 */
export function useFacedSprite(
  avatar: AvatarKey | null,
  photoUrl: string | null
): SpriteSource | undefined {
  // Who this is, as one value. When it changes the composited faces are thrown
  // away DURING the render rather than in an effect afterwards: an effect would
  // paint one frame of the previous person's face on the new person's avatar.
  const identity = avatar && photoUrl ? faceCacheKey(avatar, "", photoUrl) : "";
  const [faces, setFaces] = useState<{
    readonly of: string;
    readonly ready: ReadonlyMap<string, string>;
  }>({ of: identity, ready: new Map() });
  if (faces.of !== identity) setFaces({ of: identity, ready: new Map() });

  const compose = useCallback(
    async (clip: string) => {
      if (!(avatar && photoUrl)) return;
      const face = faceSheet(avatar, clip);
      if (!face || face.painted === 0) return;
      // A clip is either the idle plate or a packed emote; anything else in
      // the manifest is data this build does not know how to draw.
      const sheetSrc =
        clip === FACE_PLATE
          ? plateUrl(avatar)
          : isEmote(clip)
            ? emoteSheet(avatar, clip)?.src
            : undefined;
      if (!sheetSrc) return;

      const url = await compositeClip({
        sheetSrc,
        face,
        photoUrl,
        cacheKey: faceCacheKey(avatar, clip, photoUrl),
      });
      if (!url) return;
      setFaces((current) => {
        // A composite that finished after the person changed belongs to
        // nobody on screen: the cache keeps it, this state does not take it.
        if (current.of !== faceCacheKey(avatar, "", photoUrl)) return current;
        if (current.ready.get(clip) === url) return current;
        const ready = new Map(current.ready);
        ready.set(clip, url);
        return { of: current.of, ready };
      });
    },
    [avatar, photoUrl]
  );

  useEffect(() => {
    if (!avatar) return;
    let cancelled = false;

    const warm = async () => {
      // The plate first, alone: it is the one image a first paint needs.
      await compose(FACE_PLATE);
      for (const clip of faceClips(avatar)) {
        if (cancelled) return;
        if (clip !== FACE_PLATE) await compose(clip);
      }
    };
    void warm();

    return () => {
      cancelled = true;
    };
  }, [avatar, compose]);

  return useMemo(() => {
    if (!identity) return undefined;
    return (clip: string) => faces.ready.get(clip);
  }, [identity, faces]);
}
