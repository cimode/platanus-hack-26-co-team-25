"use client";

import { useState } from "react";
import { AvatarSprite } from "@/components/emotes/avatar-sprite";
import { useEmotePlayer } from "@/components/emotes/use-emote-player";
import {
  AVATARS,
  type AvatarKey,
  availableEmotes,
  type Emote,
  emoteForEvent,
  emoteSheet,
  ROOM_EVENTS,
} from "@/lib/domain/emotes/emotes";
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
 * The whole catalogue, playable: every avatar with every emote it has packed.
 * Lives on /design/emotes as the reference other screens build from.
 */
export function EmoteGallery() {
  const [height, setHeight] = useState(160);
  return (
    <div className="flex flex-col gap-8">
      <label className="flex items-center gap-3 text-ink-muted text-sm">
        altura del avatar
        <input
          aria-label="altura del avatar en píxeles"
          className="accent-primary"
          max={320}
          min={48}
          onChange={(e) => setHeight(Number(e.target.value))}
          step={8}
          type="range"
          value={height}
        />
        <span className="font-mono text-ink-faint text-xs">{height}px</span>
      </label>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {AVATARS.map((avatar) => (
          <AvatarCard avatar={avatar} height={height} key={avatar} />
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-display font-extrabold text-ink text-lg">
          Eventos → emote
        </h2>
        <p className="max-w-prose text-ink-soft text-sm">
          Una pantalla que sabe qué pasó no elige un sheet: llama{" "}
          <code className="font-mono text-xs">
            reactToEvent(participantId, evento)
          </code>{" "}
          y el mapeo vive en dominio.
        </p>
        <ul className="flex flex-wrap gap-2 font-mono text-xs">
          {ROOM_EVENTS.map((kind) => (
            <li
              className="rounded-full border-2 border-border bg-surface px-3 py-1 text-ink-muted"
              key={kind}
            >
              {kind} → {emoteForEvent(kind)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AvatarCard({ avatar, height }: { avatar: AvatarKey; height: number }) {
  const player = useEmotePlayer();
  const emotes = availableEmotes(avatar);
  const current = player.playing?.emote ?? null;
  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border-2 border-border bg-surface p-4 shadow-toy"
      data-testid={`gallery-${avatar}`}
    >
      {/* One line, always: status text that wrapped would push the stage and
          make a reaction look like a layout jump. */}
      <header className="flex h-6 items-baseline justify-between gap-2 overflow-hidden whitespace-nowrap">
        <h2 className="font-display font-extrabold text-ink">{avatar}</h2>
        <span className="min-w-0 truncate font-mono text-ink-faint text-xs lowercase">
          {current ?? "idle"} · {emotes.length} emotes
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
        />
      </div>
      <ul className="flex flex-wrap gap-2">
        {emotes.map((emote) => {
          const sheet = emoteSheet(avatar, emote);
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
                {sheet?.loop ? (
                  <span className="ml-1 font-mono text-[10px] opacity-70">
                    loop
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        <li>
          <button
            aria-label={`idle · ${avatar}`}
            className="rounded-full border-2 border-border bg-surface px-3 py-1 font-mono text-ink-muted text-xs"
            onClick={player.stop}
            type="button"
          >
            idle
          </button>
        </li>
      </ul>
    </article>
  );
}
