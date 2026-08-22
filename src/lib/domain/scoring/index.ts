/**
 * The scoring aggregate barrel (issue #30; docs/domain.md §2, §4).
 *
 * Bayesian MAP scoring of a Thurstonian choice model with **fixed, authored**
 * item parameters -- `AUDIT.md` S8's honest label. See `README.md` beside this
 * file for the likelihood, the D16 rule about where parameters come from, and
 * the three places what shipped diverges from issue #7's text.
 *
 * The surface is deliberately narrower than the modules behind it:
 *
 *   - `ITEM_PARAMETERS` is NOT re-exported. It is the committed instrument's
 *     parameters, i.e. the per-participant FALLBACK form (D16), and a caller
 *     reaching for it from the barrel would silently score people against a
 *     form they never answered. Anyone who genuinely wants it can import
 *     `./items.ts` and own that decision explicitly.
 *   - `standardNormal` / `drawTheta` stay internal to the simulator; they are
 *     test scaffolding, not a public capability.
 */

export {
  estimateLatents,
  type LatentEstimates,
  SCORER_VERSION,
  type ScoredLatent,
  SE_FLOOR,
  THETA_LIMIT,
} from "./estimate.ts";
export {
  type BlockItems,
  DISCRIMINATION,
  INTERCEPT,
  type ItemParameter,
  /**
   * The wrapper over a committed `Instrument`. Correct only for a participant
   * who actually got the fallback form -- scoring a generated form with it is
   * the failure `estimateLatents`' docblock warns about.
   */
  itemParametersOf,
  /** What `scoreParticipant` uses: the participant's OWN stored blocks. */
  itemParametersOfBlocks,
  LAMBDA,
} from "./items.ts";
export {
  mulberry32,
  type SimulateOptions,
  simulateRespondent,
  structuralBlocksFor,
} from "./simulate.ts";
