import { type ActionKind, actionForEvent } from "@/lib/domain/emotes/actions";
import type { EventKind } from "@/lib/domain/reveal/timeline";

/**
 * How an ACTION reaches the screen that can play it — the sibling of
 * `emote-bus.ts`, one level up.
 *
 * An emote plays on one sprite keyed by participant. An action is a whole
 * multi-avatar moment (the match reveal), so its signal carries the pair and
 * whatever the sequence needs rather than a single id. Whatever notices the
 * beat — the simulation, a server action's result, the presenter at the
 * console — calls `fireEvent(evento, accion)`; a mounted `BabyOnBoard`
 * subscribes and plays.
 *
 * Same `EventTarget` construction as the emote bus, so it runs unchanged in a
 * Node test.
 */

/** The two people a pair-action animates, plus the face of what it produces. */
export interface ActionPair {
  readonly a: {
    readonly id: string;
    readonly name: string;
    readonly faceUrl: string | null;
  };
  readonly b: {
    readonly id: string;
    readonly name: string;
    readonly faceUrl: string | null;
  };
  /** The generated offspring face for `babyOnBoard`; null falls back to a plate. */
  readonly childFaceUrl?: string | null;
}

export interface ActionSignal {
  readonly action: ActionKind;
  /** The life beat that prompted it — context for logs, not control flow. */
  readonly evento?: string;
  /** What the sequence needs; shape depends on the action. */
  readonly pair?: ActionPair;
}

const TYPE = "dipia:action";
const bus = new EventTarget();

/** Fire an action directly. */
export function dispatchAction(
  action: ActionKind,
  options: { readonly evento?: string; readonly pair?: ActionPair } = {}
): void {
  bus.dispatchEvent(
    new CustomEvent<ActionSignal>(TYPE, {
      detail: { action, evento: options.evento, pair: options.pair },
    })
  );
}

/**
 * The LLM's entry point, by the two parameters it thinks in: an `evento` and an
 * `accion`. `fireEvent("kid", "babyOnBoard", pair)` plays the reveal. Passing a
 * bare event is enough too — `actionForEvent` chooses the action, and an event
 * that maps to none is a no-op rather than an error.
 */
export function fireEvent(
  evento: EventKind,
  accion?: ActionKind,
  pair?: ActionPair
): void {
  const action = accion ?? actionForEvent(evento);
  if (!action) return;
  dispatchAction(action, { evento, pair });
}

/** Listen for actions. Returns the unsubscribe. */
export function subscribeAction(
  listener: (signal: ActionSignal) => void
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<ActionSignal>).detail);
  };
  bus.addEventListener(TYPE, handler);
  return () => bus.removeEventListener(TYPE, handler);
}

declare global {
  interface Window {
    dipiaActions?: {
      fireEvent: typeof fireEvent;
      dispatchAction: typeof dispatchAction;
    };
  }
}

// On `window` so a presenter can fire `dipiaActions.fireEvent("kid",
// "babyOnBoard")` from the devtools console mid-demo, with no UI for it.
if (typeof window !== "undefined") {
  window.dipiaActions = { ...window.dipiaActions, fireEvent, dispatchAction };
}
