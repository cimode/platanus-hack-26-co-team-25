/**
 * Emotes: the digital avatars' reactions and walks, for any screen.
 *
 *   import { AvatarSprite, useEmotePlayer } from "@/components/emotes";
 *
 * See README.md next to this file.
 */

export {
  AVATARS,
  type AvatarKey,
  availableEmotes,
  avatarKey,
  EMOTES,
  type Emote,
  type EmoteSheet,
  emoteForEvent,
  emoteSheet,
  emoteSheets,
  isAvatarKey,
  isEmote,
  PLATE_ASPECT,
  plateUrl,
  ROOM_EVENTS,
  type RoomEventKind,
} from "@/lib/domain/emotes/emotes";
export { AvatarSprite, type AvatarSpriteProps } from "./avatar-sprite";
export {
  dispatchEmote,
  type EmoteSignal,
  reactToEvent,
  subscribeEmote,
} from "./emote-bus";
export { EmoteGallery } from "./emote-gallery";
export {
  type EmotePlayer,
  type Playing,
  useEmotePlayer,
  useParticipantEmotes,
} from "./use-emote-player";
