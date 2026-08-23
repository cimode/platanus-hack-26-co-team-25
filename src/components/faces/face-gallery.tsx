"use client";

import { useEffect, useState } from "react";
import { AvatarSprite } from "@/components/emotes/avatar-sprite";
import { useEmotePlayer } from "@/components/emotes/use-emote-player";
import { useFacedSprite } from "@/components/faces/use-faced-sprite";
import {
  AVATARS,
  type AvatarKey,
  availableEmotes,
  type Emote,
} from "@/lib/domain/emotes/emotes";
import { FACE_PLATE, faceBytes, hasFace } from "@/lib/domain/faces/faces";
import { cn } from "@/lib/utils";

/** What each emote is called on a button, in the product's voice. */
const LABEL: Readonly<Record<Emote, string>> = {
  celebrate: "celebra",
  wave: "saluda",
  cry: "llora",
  walk: "camina",
  angry: "se enoja",
  fight: "pelea",
  defeat: "se rinde",
  love: "flechazo",
  "walk-back": "se va",
  "walk-right": "camina →",
  "walk-left": "← camina",
  "sad-walk-right": "se va triste →",
  "sad-walk-left": "← se va triste",
};

/**
 * The faces library, playable: one photo, four avatars, every animation.
 *
 * Lives on /design/faces as the reference other screens build from, and as the
 * place to check a change to the packed masks against every clip at once
 * rather than against the one that happened to be on screen.
 *
 * The photo is read straight off the device into an object URL. Nothing is
 * uploaded and nothing is stored -- which is also what happens in the product,
 * where the only difference is that the URL points at the person's own photo
 * in object storage instead of at a file they just picked.
 */
export function FaceGallery() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [height, setHeight] = useState(160);

  // An object URL outlives the element that made it, so it is revoked when it
  // is replaced or when the page goes away.
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex cursor-pointer items-center gap-3 rounded-full border-2 border-border border-dashed px-4 py-2 font-display font-bold text-ink text-sm hover:border-primary">
          {photoUrl ? "otra foto" : "elige una foto"}
          <input
            accept="image/*"
            aria-label="foto para poner en la cara del avatar"
            className="sr-only"
            data-testid="face-photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setPhotoUrl(URL.createObjectURL(file));
            }}
            type="file"
          />
        </label>

        <label className="flex items-center gap-3 text-ink-muted text-sm">
          altura del avatar
          <input
            aria-label="altura del avatar en píxeles"
            className="accent-primary"
            max={320}
            min={48}
            onChange={(event) => setHeight(Number(event.target.value))}
            step={8}
            type="range"
            value={height}
          />
          <span className="font-mono text-ink-faint text-xs">{height}px</span>
        </label>

        <p className="font-mono text-ink-faint text-xs lowercase">
          {(faceBytes("avatar1") / 1024).toFixed(0)} kb por avatar · 0 bytes
          guardados
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {AVATARS.map((avatar) => (
          <AvatarCard
            avatar={avatar}
            height={height}
            key={avatar}
            photoUrl={photoUrl}
          />
        ))}
      </div>
    </div>
  );
}

function AvatarCard({
  avatar,
  height,
  photoUrl,
}: {
  avatar: AvatarKey;
  height: number;
  photoUrl: string | null;
}) {
  const player = useEmotePlayer();
  const source = useFacedSprite(avatar, photoUrl);
  const emotes = availableEmotes(avatar);
  const current = player.playing?.emote ?? null;
  const clip = current ?? FACE_PLATE;
  // Whether what is on screen right now actually has the face in it. `plain`
  // is the honest answer for a clip still being composited AND for one that
  // never had a face to begin with, which is why the two are told apart.
  const state = !photoUrl
    ? "sin foto"
    : !hasFace(avatar, clip)
      ? "sin cara aquí"
      : source?.(clip)
        ? "con cara"
        : "componiendo…";

  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border-2 border-border bg-surface p-4 shadow-toy"
      data-testid={`faces-${avatar}`}
    >
      <header className="flex h-6 items-baseline justify-between gap-2 overflow-hidden whitespace-nowrap">
        <h2 className="font-display font-extrabold text-ink">{avatar}</h2>
        <span
          className="min-w-0 truncate font-mono text-ink-faint text-xs lowercase"
          data-testid={`faces-${avatar}-state`}
        >
          {state}
        </span>
      </header>

      <div
        className="flex items-end justify-center rounded-xl bg-dark/90 px-4 pt-8 pb-6"
        style={{ minHeight: height / 0.8 + 56 }}
      >
        <AvatarSprite
          avatar={avatar}
          height={`${height}px`}
          label={`${avatar} ${current ?? "idle"}`}
          onEnd={player.stop}
          playing={player.playing}
          source={source}
        />
      </div>

      <ul className="flex flex-wrap gap-2">
        {emotes.map((emote) => {
          const active = current === emote;
          return (
            <li key={emote}>
              <button
                aria-label={`${emote} · ${avatar}`}
                aria-pressed={active}
                className={cn(
                  "rounded-full border-2 px-3 py-1 font-display font-bold text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-alt text-ink hover:border-primary"
                )}
                onClick={() => player.play(emote)}
                type="button"
              >
                {LABEL[emote]}
                {hasFace(avatar, emote) ? null : (
                  <span className="ml-1 font-mono text-[10px] opacity-70">
                    sin cara
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
