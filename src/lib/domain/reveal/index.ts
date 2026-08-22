/**
 * The read contract the reveal screens and the engine team share.
 *
 * `reveal/` is the read side; `matching/` is the engine. `RankEntry` is not
 * `RankedEntry`: the engine's floats stop in the adapter (D3).
 *
 * **Types only.** The behaviour that used to be re-exported here --
 * `applyRankView`, `RankSort`, `tagFor`, `offspringVisible` -- now lives beside
 * the component that calls it, because none of it has a second implementer.
 * This barrel is what issue #10 (`prepareResults`) and issue #33
 * (`simulate-pair`) import, and a function in it would be a false promise that
 * they are expected to satisfy something.
 *
 * `Lens` is NOT declared here. Three identical `Lens` unions already exist
 * (`domain/room/layout`, `domain/matching/engine`, `domain/participant/gates`)
 * and a fourth would be one more thing to keep in step, so this barrel
 * re-exports `domain/room/layout`'s -- the copy that also exports `isLens`,
 * which is what the cookie resolver needs.
 */
export type { Lens } from "../room/layout";
export type { PersonProfile } from "./profile";
export type {
  RankBand,
  RankEntry,
  RankedRoom,
  RankReason,
  ViewerId,
} from "./rank";
export type {
  Ending,
  EventKind,
  FriendshipTimeline,
  LifeEvent,
  PairedTimeline,
  SimulatedLife,
} from "./timeline";
