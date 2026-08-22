/**
 * The read model the reveal screens share.
 *
 * `reveal/` is the read side; `matching/` is the engine. `RankEntry` is not
 * `RankedEntry`: the engine's floats stop in the adapter (D3).
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
  RankSort,
  ViewerId,
} from "./rank";
export { applyRankView } from "./rank";
