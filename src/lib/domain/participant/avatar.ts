import type { Gender } from "./gates";

/** The four authored avatar plates, by file stem under `public/sprites/`. */
export const AVATARS = ["avatar1", "avatar2", "avatar3", "avatar4"] as const;
export type Avatar = (typeof AVATARS)[number];

/**
 * Which plates a gender may wear.
 *
 * The art was drawn in pairs -- two masculine-presenting bodies, two
 * feminine-presenting -- so M and F each draw from their pair, and a
 * non-binary participant draws from all four rather than being pushed into
 * either. Gender is the only thing registration knows about a person's look.
 */
const WARDROBE: Record<Gender, readonly Avatar[]> = {
  M: ["avatar1", "avatar2"],
  F: ["avatar3", "avatar4"],
  NB: AVATARS,
};

/**
 * The plate a participant wears, decided ONCE at registration and stored on
 * the row (`participants.avatar`). Deciding it at render time from an index
 * made the same person change bodies between the room, the ranking and their
 * profile -- the body is part of who they are on screen, so it is data.
 *
 * Deterministic in `seed` (the use case passes name + birthdate) so a retried
 * registration lands on the same choice; within a gender the spread is what
 * the hash gives, which is even enough for a room of a hundred.
 */
export function avatarFor(gender: Gender, seed: string): Avatar {
  const plates = WARDROBE[gender];
  return plates[fnv1a(seed) % plates.length] as Avatar;
}

/** The stored value may predate this column or be hand-edited: check it. */
export function isAvatar(value: unknown): value is Avatar {
  return (
    typeof value === "string" && (AVATARS as readonly string[]).includes(value)
  );
}

/** The public path of a plate, for `background-image` and `<img src>`. */
export function avatarSprite(avatar: Avatar): string {
  return `/sprites/${avatar}.png`;
}

/** FNV-1a, 32-bit; the same hash `domain/room/layout.ts` places sprites with. */
function fnv1a(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
