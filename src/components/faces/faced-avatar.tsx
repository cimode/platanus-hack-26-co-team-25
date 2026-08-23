"use client";

import {
  AvatarSprite,
  type AvatarSpriteProps,
} from "@/components/emotes/avatar-sprite";
import { useFacedSprite } from "@/components/faces/use-faced-sprite";

/**
 * `AvatarSprite`, wearing this person's face.
 *
 * The one client island every screen needs. `AvatarSprite` itself stays
 * source-agnostic -- it draws whatever it is handed -- and the hook that turns
 * a photo into those images has to run in the browser, so the two are joined
 * here rather than in each screen.
 *
 * `photoUrl` null (a row registered before photos, or a person whose upload
 * failed) draws the plain plate, which is what the screen showed before faces
 * existed. Nothing here can leave a screen worse than it was.
 */
export function FacedAvatar({
  avatar,
  photoUrl,
  ...sprite
}: Omit<AvatarSpriteProps, "source"> & {
  /** `participants.photo_url`, straight through. Null draws the blank plate. */
  readonly photoUrl: string | null;
}) {
  const source = useFacedSprite(avatar, photoUrl);
  return <AvatarSprite {...sprite} avatar={avatar} source={source} />;
}
