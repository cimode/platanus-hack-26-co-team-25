import {
  type Emote,
  emoteForEvent,
  type RoomEventKind,
} from "@/lib/domain/emotes/emotes";

/**
 * How a reaction reaches a sprite that is keyed by participant.
 *
 * Whatever notices the event -- a server action's result, a websocket, a
 * presenter at the console -- calls `reactToEvent(participantId, kind)`. Every
 * `useParticipantEmotes(participantId)` on the page plays the matching sheet;
 * no prop drilling, no store, and a participant with no clip packed for that
 * emote just keeps idling. Screens that control one avatar directly (a
 * profile, a match reveal) need none of this: they use `useEmotePlayer`.
 *
 * Built on a module-level `EventTarget` rather than `window` so the same code
 * runs in a Node test; `CustomEvent` has been global in Node since 19.
 */
export interface EmoteSignal {
  readonly participantId: string;
  readonly emote: Emote;
  readonly loop?: boolean;
}

const TYPE = "dipia:emote";
const bus = new EventTarget();

/** Play `emote` on every sprite of `participantId`. */
export function dispatchEmote(
  participantId: string,
  emote: Emote,
  options: { readonly loop?: boolean } = {}
): void {
  bus.dispatchEvent(
    new CustomEvent<EmoteSignal>(TYPE, {
      detail: { participantId, emote, loop: options.loop },
    })
  );
}

/** The function to call when something happens to someone in the room. */
export function reactToEvent(participantId: string, kind: RoomEventKind): void {
  dispatchEmote(participantId, emoteForEvent(kind));
}

/** Listen for this participant's reactions. Returns the unsubscribe. */
export function subscribeEmote(
  participantId: string,
  listener: (emote: Emote, options: { readonly loop?: boolean }) => void
): () => void {
  const handler = (event: Event) => {
    const { detail } = event as CustomEvent<EmoteSignal>;
    if (detail.participantId === participantId)
      listener(detail.emote, { loop: detail.loop });
  };
  bus.addEventListener(TYPE, handler);
  return () => bus.removeEventListener(TYPE, handler);
}

declare global {
  interface Window {
    dipia?: {
      reactToEvent: typeof reactToEvent;
      dispatchEmote: typeof dispatchEmote;
    };
  }
}

// Reachable from the devtools console and from Playwright, so a presenter can
// fire `dipia.reactToEvent("<id>", "match")` mid-demo without any UI for it.
if (typeof window !== "undefined") {
  window.dipia = { ...window.dipia, reactToEvent, dispatchEmote };
}
