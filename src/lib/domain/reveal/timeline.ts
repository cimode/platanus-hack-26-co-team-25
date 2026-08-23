/**
 * The simulated-life read model: what `/simulate/[id]` is allowed to render
 * for one pair under one lens.
 *
 * Two structural decisions are load-bearing and both were argued in the
 * spec/design reconciliation (`openspec/changes/ui-flow-screens/tasks.md`):
 *
 * - R4. `SimulatedLife` is a UNION DISCRIMINATED ON LENS, not a flat record
 *   with nullable fields. `horizonYears: number | null` was the design's shape
 *   and it was rejected: a nullable field cannot fail `tsc`, and AC-SIM-4
 *   requires that reading a horizon off a friendship does exactly that.
 * - R4. `Ending` is a union rather than a nullable `dissolution` plus a
 *   nullable `epilogue`, so the epilogue is reachable only after a
 *   dissolution and no ending card can narrate one without the other.
 *
 * Nothing here carries a `rank`, a `sim`, a percentage or any float derived
 * from them (AC-PORT-3). The engine's numbers stop in the adapter.
 */

import type { AvatarKey, ReactionEmote } from "../emotes/emotes";

/**
 * COPIED from `timeline/shared.ts:78-82`. NOT imported, and not importable:
 * that directory is a separate package with its own `package.json` and
 * lockfile (zod ^3 against this project's ^4) and `tsconfig.json` excludes it,
 * so it resolves against its own `node_modules` and never ours.
 *
 * SYNC: timeline/shared.ts:78-82. `event-tag.test.ts` reads those exact bytes
 * with `node:fs` and asserts set-equality against its own copy of this list,
 * because the exhaustive `Record` in `event-tag.ts` can only fire AFTER a
 * human has already updated this union -- it cannot see upstream at all.
 */
export type EventKind =
  | "milestone"
  | "move"
  | "job"
  | "pet"
  | "kid"
  | "ritual"
  | "trip"
  | "conflict"
  | "recovery"
  | "venture"
  | "client"
  | "decision"
  | "exit"
  | "dissolution"
  | "epilogue"
  | "vignette";

/** One card on the rail: a year, a tag family, and the narrated beat. */
export interface LifeEvent {
  /** 1-based simulated year. */
  readonly year: number;
  /** Resolved to exactly one chip through `tagFor(kind)`. */
  readonly kind: EventKind;
  /** Narrated prose, already safety-scanned by the adapter. */
  readonly text: string;
  /**
   * The reaction both avatars play while this card is the active one, chosen by
   * the narrator and verified against the pair's plates.
   *
   * OPTIONAL, and that is a storage decision rather than a modelling one:
   * `pair_simulations.life` is a `jsonb` blob cast without validation and its
   * `scorer_version` is never compared on read, so rows cached before this
   * field existed come back without it and must stay renderable. The screen
   * closes the gap with `emoteForLifeEvent(kind)`, which is total.
   */
  readonly emote?: ReactionEmote;
}

/**
 * How a paired timeline finishes.
 *
 * There is no `"open"` variant: friendship does not reach this type at all
 * (see `FriendshipTimeline`), so a third variant would be unreachable by
 * construction while still forcing every `switch` in the ending card to
 * handle a case that cannot happen.
 */
export type Ending =
  | { readonly outcome: "together" }
  | {
      readonly outcome: "apart";
      /** The simulated year the pair came apart. Never a probability. */
      readonly year: number;
      /** The beat AFTER the ending. Reachable on this branch only. */
      readonly epilogue: string | null;
    };

/** Everything both branches share. Not exported: the branches are the API. */
interface SimulatedLifeBase {
  readonly subject: {
    readonly id: string;
    readonly name: string;
    /**
     * The plate this person wears, so the screen can animate them.
     *
     * Not a widening of `RoomMember` (AC-8): that type is still exactly id,
     * name and photoUrl, and this is a different one. The plate is already
     * public -- everybody sees everybody's body in the room -- so naming it
     * here reveals nothing new. Null on rows older than the column.
     */
    readonly avatar: AvatarKey | null;
    /**
     * The viewer's OWN photo, so the reveal can put a face on both parents.
     * Their own is the first exception D11 names; `projectForViewer` sets it
     * per viewer, exactly as it already does for `other.photoUrl`, so a
     * cached canonical row that predates this field is never served stale.
     */
    readonly photoUrl: string | null;
  };
  readonly other: {
    readonly id: string;
    readonly name: string;
    readonly photoUrl: string | null;
    readonly avatar: AvatarKey | null;
  };
  /** Sorted by year ascending. */
  readonly events: readonly LifeEvent[];
}

/**
 * Romantic and business: the two lenses that make a duration claim, so the
 * header pill has a denominator and the ending card has something to narrate.
 */
export interface PairedTimeline extends SimulatedLifeBase {
  readonly lens: "romantic" | "business";
  /** 8-14 romantic, 5-10 business, from the adapter. NEVER hardcode 12. */
  readonly horizonYears: number;
  readonly ending: Ending;
}

/**
 * Friendship, which STRUCTURALLY lacks `horizonYears`, a dissolution and an
 * epilogue (`PILLARS.md` §6.1: no survival curve, therefore no duration
 * claim). This is the whole reason `SimulatedLife` is a union -- absent is a
 * compile error at the read site, whereas `null` is a render of the word
 * "null" waiting to happen.
 */
export interface FriendshipTimeline extends SimulatedLifeBase {
  readonly lens: "friendship";
}

export type SimulatedLife = PairedTimeline | FriendshipTimeline;
