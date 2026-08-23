import type { EventKind } from "../reveal/timeline";
import type { ReactionEmote } from "./emotes";

/**
 * Actions: the multi-avatar sequences a screen can play, above a single emote.
 *
 * An emote is one clip on one sprite (`reactToEvent(participantId, kind)`). An
 * ACTION is a whole choreographed moment across more than one avatar — the
 * match reveal being the first: two people walk together, fall in love, and a
 * third avatar is born. The catalogue is the vocabulary the simulation (and the
 * presenter's console) can name.
 *
 * The LLM reaches this by two parameters — an `evento` and an `accion`:
 * `fireEvent(evento, accion)` in `src/components/emotes/action-bus.ts`. The
 * `evento` is the life beat that prompted it (context, for logs); the `accion`
 * is what plays. `actionForEvent` below is the canonical pairing, so the LLM can
 * also just emit the event and let the mapping choose the action.
 */
export const ACTIONS = ["babyOnBoard"] as const;

export type ActionKind = (typeof ACTIONS)[number];

export function isAction(value: unknown): value is ActionKind {
  return (
    typeof value === "string" && (ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Which action a simulated-life beat triggers — the ONE place the
 * `(evento → accion)` pairing lives.
 *
 * `kid → babyOnBoard`: a `kid` event only appears in a `SimulatedLife` when the
 * narrator decided this pair would have children AND the kid gate passed
 * (mutual `wantsKids`, mutual offspring consent, the relationship alive that
 * year — `domain/timeline/shared.ts`, `AUDIT.md` S11). So the presence of a
 * `kid` beat is exactly "the LLM considers having kids a possibility for this
 * pair", already consent-gated — which is when `babyOnBoard` should play.
 *
 * Partial on purpose: most life beats map to no action, and asking for one
 * answers `null` rather than inventing a reveal.
 */
const ACTION_FOR_EVENT: Partial<Record<EventKind, ActionKind>> = {
  kid: "babyOnBoard",
};

export function actionForEvent(evento: EventKind): ActionKind | null {
  return ACTION_FOR_EVENT[evento] ?? null;
}

/**
 * Which reaction a life beat deserves when the model does not choose one.
 *
 * This is the safety net under the LLM, not a competing opinion. The narrator
 * asks the model for an emote alongside each sentence; this mapping answers
 * when that call failed, when the model returned a sheet an avatar has not got,
 * or when the row was cached before the field existed. That makes the emote a
 * TOTAL function of the timeline: every beat animates, with or without a model.
 *
 * TOTAL over `EventKind` on purpose -- a `Record`, not a `Partial`, so adding a
 * seventeenth kind of life event is a compile error here rather than a beat
 * that silently stands still. The sibling `ACTION_FOR_EVENT` above is partial
 * for the opposite reason: most beats deserve no choreographed reveal, but
 * every beat deserves a face.
 */
const EMOTE_FOR_LIFE_EVENT: Record<EventKind, ReactionEmote> = {
  milestone: "celebrate",
  move: "walk",
  job: "celebrate",
  pet: "love",
  // Also fires `babyOnBoard` through `actionForEvent`; the emote is what the
  // two parents' own sprites do while that sequence plays.
  kid: "love",
  ritual: "wave",
  trip: "walk",
  // The grind, not the rupture: `fight` is reserved for a decision collision.
  conflict: "angry",
  recovery: "wave",
  venture: "celebrate",
  client: "celebrate",
  decision: "fight",
  exit: "celebrate",
  dissolution: "defeat",
  epilogue: "cry",
  vignette: "wave",
};

export function emoteForLifeEvent(evento: EventKind): ReactionEmote {
  return EMOTE_FOR_LIFE_EVENT[evento];
}
