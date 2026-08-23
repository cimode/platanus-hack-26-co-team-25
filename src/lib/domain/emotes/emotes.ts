import {
  AVATARS,
  type Avatar,
  avatarSprite,
  isAvatar,
} from "../participant/avatar";
import { EMOTE_MANIFEST } from "./emotes.manifest";

/**
 * The emote catalogue: what a digital avatar can do on any screen.
 *
 * Each emote is a spritesheet generated from the avatar plate by an
 * image-to-video model (see `scripts/emotes/` and the `create_emotes`
 * workflow). The catalogue is whatever has been packed into
 * `emotes.manifest.ts`; asking for a sheet nobody packed answers null, never
 * throws, so a screen can always fall back to the idle plate.
 */
export const EMOTES = [
  "celebrate",
  "wave",
  "cry",
  "walk",
  "angry",
  "fight",
  "defeat",
  "love",
  // Locomotion: the character turns and keeps walking, so these sheets may loop.
  "walk-back",
  "walk-right",
  "walk-left",
  "sad-walk-right",
  "sad-walk-left",
] as const;

export type Emote = (typeof EMOTES)[number];

export function isEmote(value: unknown): value is Emote {
  return (
    typeof value === "string" && (EMOTES as readonly string[]).includes(value)
  );
}

/**
 * The emotes a story beat may trigger: the one-shots, and ONLY those.
 *
 * The five locomotion sheets are excluded on purpose, and the reason is
 * positional rather than aesthetic. They are `loop: true`, so they never fire
 * `animationend`; `AvatarSprite` therefore never calls `onEnd` and the avatar
 * never returns to its idle plate. By construction they also end with the
 * character turned away or walked off. A reaction attached to a life event has
 * to finish standing exactly where it started -- which is what a one-shot does
 * and a walk cycle cannot.
 *
 * Written as a literal (not derived at runtime) because `z.enum` in the
 * narrator adapter needs a tuple type, and because the LLM's vocabulary should
 * be readable in one glance. `emotes.test.ts` asserts this list IS exactly the
 * set of non-looping sheets every avatar has packed, so packing a new one-shot
 * and forgetting it here fails the suite rather than silently narrowing what
 * the model may choose.
 */
export const REACTION_EMOTES = [
  "celebrate",
  "wave",
  "cry",
  "walk",
  "angry",
  "fight",
  "defeat",
  "love",
] as const;

export type ReactionEmote = (typeof REACTION_EMOTES)[number];

export function isReactionEmote(value: unknown): value is ReactionEmote {
  return (
    typeof value === "string" &&
    (REACTION_EMOTES as readonly string[]).includes(value)
  );
}

/**
 * True when EVERY one of these avatars has this emote packed.
 *
 * The verification step behind the model's choice: a pair simulation animates
 * two avatars with one emote, so a sheet missing on either side means the
 * choice has to fall back. Unknown avatars (a null column on an old row) do not
 * veto -- they simply have no sprite to play.
 */
export function playableByAll(
  avatars: readonly (string | null | undefined)[],
  emote: Emote
): boolean {
  const known = avatars.filter((a): a is string => typeof a === "string");
  if (known.length === 0) return false;
  return known.every((avatar) => emoteSheet(avatar, emote) !== null);
}

/**
 * Who wears what is the participant domain's call (`participant/avatar.ts`:
 * decided at registration, stored on the row). The emotes catalogue is keyed
 * by that same `Avatar`, re-exported under the names the library uses.
 */
export { AVATARS, isAvatar as isAvatarKey };
export type AvatarKey = Avatar;

/** The idle plate: the still the whole catalogue was generated from. */
export function plateUrl(avatar: AvatarKey): string {
  return avatarSprite(avatar);
}

/**
 * Width over height of a plate. The four differ by a few pixels; one number
 * keeps every avatar the same footprint, which is what a row of them needs.
 * Mirrors `SPRITE_ASPECT` in `domain/room/layout.ts`.
 */
export const PLATE_ASPECT = 0.46;

/**
 * The things that can happen to someone in the room.
 *
 * In the product's words: match, saludo, rechazo, llegada, roce, pelea,
 * derrota, enamoramiento, partida, desamor. Anything that wants a specific
 * reaction regardless of event semantics plays the emote directly.
 */
export const ROOM_EVENTS = [
  "match",
  "greeting",
  "rejection",
  "arrival",
  "friction",
  "clash",
  "loss",
  "crush",
  "departure",
  "heartbreak",
] as const;

export type RoomEventKind = (typeof ROOM_EVENTS)[number];

const EMOTE_FOR_EVENT: Readonly<Record<RoomEventKind, Emote>> = {
  match: "celebrate",
  greeting: "wave",
  rejection: "cry",
  arrival: "walk",
  friction: "angry",
  clash: "fight",
  loss: "defeat",
  crush: "love",
  departure: "walk-back",
  heartbreak: "sad-walk-left",
};

/** Which reaction an event deserves. The one place that mapping lives. */
export function emoteForEvent(kind: RoomEventKind): Emote {
  return EMOTE_FOR_EVENT[kind];
}

/**
 * One packed emote: a horizontal strip of `frames` frames, each
 * `frameWidth` x `frameHeight`, played at `fps`.
 *
 * The two fractions describe where the body sits inside a frame, because the
 * generation canvas leaves headroom for hops: the standing body is
 * `bodyFraction` of the frame's height and the feet sit at `feetFraction` from
 * the top. `geometry.ts` uses both to draw a sheet at the same scale, on the
 * same floor line, as the idle plate it replaces.
 */
export interface EmoteSheet {
  readonly src: string;
  readonly frames: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly fps: number;
  readonly bodyFraction: number;
  readonly feetFraction: number;
  readonly model: string;
  /** What `pack.mjs` did under the feet: the old plates' ground ellipse is keyed out (`strip`). */
  readonly floor: "keep" | "strip" | "shadow";
  /** Locomotion sheets start after the turn and never return to the plate: safe to repeat. */
  readonly loop?: boolean;
  /** Left-facing sheets are their right-facing source flipped at pack time. */
  readonly mirrorOf?: string | null;
  readonly bytes: number;
}

/** `/sprites/avatar1.png` or `avatar1` -> `avatar1`; anything else -> null. */
export function avatarKey(spriteOrKey: string): AvatarKey | null {
  if (isAvatar(spriteOrKey)) return spriteOrKey;
  const match = /\/(avatar\d+)\.png$/.exec(spriteOrKey);
  return match && isAvatar(match[1]) ? match[1] : null;
}

/** The packed sheet for this avatar and emote, or null if none exists yet. */
export function emoteSheet(
  spriteOrKey: string,
  emote: Emote
): EmoteSheet | null {
  const key = avatarKey(spriteOrKey);
  if (!key) return null;
  return EMOTE_MANIFEST[key]?.[emote] ?? null;
}

/** Every sheet packed for this avatar -- what a screen preloads on mount. */
export function emoteSheets(spriteOrKey: string): readonly EmoteSheet[] {
  const key = avatarKey(spriteOrKey);
  if (!key) return [];
  return Object.values(EMOTE_MANIFEST[key] ?? {});
}

/** The emotes this avatar can actually play, in catalogue order. */
export function availableEmotes(spriteOrKey: string): readonly Emote[] {
  const key = avatarKey(spriteOrKey);
  if (!key) return [];
  const packed = EMOTE_MANIFEST[key] ?? {};
  return EMOTES.filter((emote) => emote in packed);
}

/** How long one play of the sheet takes. */
export function emoteSeconds(sheet: EmoteSheet): number {
  return sheet.frames / sheet.fps;
}
