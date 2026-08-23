/**
 * Emotes: the digital avatars' reactions and walks, for any screen.
 *
 *   import { AvatarSprite, useEmotePlayer } from "@/components/emotes";
 *
 * See README.md next to this file.
 */

export {
  ACTIONS,
  type ActionKind,
  actionForEvent,
  isAction,
} from "@/lib/domain/emotes/actions";
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
export {
  type ActionPair,
  type ActionSignal,
  dispatchAction,
  fireEvent,
  subscribeAction,
} from "./action-bus";
export { AvatarSprite, type AvatarSpriteProps } from "./avatar-sprite";
export {
  BabyOnBoard,
  type BabyOnBoardProps,
  type BabyPhase,
} from "./baby-on-board";
export {
  dispatchEmote,
  type EmoteSignal,
  reactToEvent,
  subscribeEmote,
} from "./emote-bus";
export { EmoteGallery } from "./emote-gallery";
export { FacedAvatar, type FacedAvatarProps } from "./faced-avatar";
export {
  type EmotePlayer,
  type Playing,
  useEmotePlayer,
  useParticipantEmotes,
} from "./use-emote-player";
