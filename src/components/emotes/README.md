# Emotes

Las reacciones y caminatas de los avatares digitales, para cualquier pantalla.
Catálogo vivo en **/design/emotes**.

## Usar un avatar en una pantalla

```tsx
"use client";
import { AvatarSprite, useEmotePlayer } from "@/components/emotes";

export function Profile({ avatar }: { avatar: AvatarKey }) {
  const player = useEmotePlayer();
  return (
    <>
      <AvatarSprite avatar={avatar} height="120px" playing={player.playing} onEnd={player.stop} />
      <button onClick={() => player.play("celebrate")}>¡Match!</button>
      <button onClick={() => player.play("walk-back", { loop: true })}>Se va</button>
    </>
  );
}
```

- `height` acepta cualquier unidad CSS (`96px`, `6rem`, `12cqh`). La caja del
  componente es siempre la de la lámina idle: una reacción no mueve el layout.
- `play()` reinicia aunque sea el mismo emote; `stop()` vuelve al idle.
- Un one-shot termina solo (`onEnd`); las caminatas (`loop`) no terminan hasta `stop()`.
- Emotes que ese avatar no tiene empaquetados se ignoran: el sprite nunca queda en blanco.

## Por participante (la sala)

```tsx
const player = useParticipantEmotes(participant.id, avatarKey(sprite));
<AvatarSprite avatar={avatar} height={`${h}cqh`} playing={player.playing} onEnd={player.stop} />
```

Y desde donde ocurra el evento (server action, socket, consola):

```ts
import { reactToEvent, dispatchEmote } from "@/components/emotes";
reactToEvent(participantId, "match");            // match → celebrate (mapeo en dominio)
dispatchEmote(participantId, "walk-back", { loop: true });
```

También `window.dipia.reactToEvent(id, "match")` desde la consola, para la demo.

## Catálogo y dominio

`src/lib/domain/emotes/emotes.ts`: `EMOTES`, `AVATARS`, `ROOM_EVENTS`,
`emoteForEvent`, `emoteSheet`, `availableEmotes`. El manifest
(`emotes.manifest.ts`) lo genera `pnpm emotes:pack`; los sheets viven en
`public/sprites/emotes/<avatar>/<emote>.webp`.

`geometry.ts` es la aritmética CSS (caja del frame, `steps(n)`, loop) — pura,
testeada, y la misma para la sala y para cualquier otra pantalla.

## Accesibilidad y movimiento

La animación va como `style` inline: el bloque `prefers-reduced-motion` de
`globals.css` apaga todo `[style*="animation"]`, y `AvatarSprite` cierra el
one-shot con un temporizador cuando `animationend` no llega.

## Generar más emotes

`scripts/emotes/` + workflows `create_emote` / `create_emotes` (ver `AGENTS.md`).
