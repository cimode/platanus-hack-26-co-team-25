/**
 * items.ts — the authored measurement parameters of the instrument (issue #7).
 *
 * `AUDIT.md` S8 fixes the honest label for what ships: *Bayesian MAP scoring of
 * a Thurstonian choice model with **fixed, authored** item parameters — the
 * model is Thurstonian; the parameters are not calibrated.* This file is the
 * "authored" half. Nothing here was fitted to data, because no pretest sample
 * exists; every number below is a design decision with its reasoning attached.
 *
 * One option contributes one term to the utility a respondent assigns it:
 *
 *     u_j  =  DISCRIMINATION · sign_j · theta_{pillar(j)}  +  intercept_j
 *
 * `sign_j` is +1 for a positively keyed option and −1 for the reversed one.
 * That sign is the whole reason trait LEVELS are recoverable at all
 * (`AUDIT.md` F1) — see `estimate.ts` for why an all-positive form measures
 * nothing but contrasts.
 */
import type { Block, Instrument, Pillar } from "../quiz/instrument.ts";
import { INSTRUMENT } from "../quiz/instrument.ts";
import type { OptionKey } from "../quiz/response.ts";

/**
 * The loading assumed for every option, on the standardized Thurstonian scale
 * (`AUDIT.md` S9 asks for exactly this assumption to be stated: λ ≈ .7, mixed
 * keying, most+least).
 *
 * λ = .7 leaves unique variance ψ = 1 − λ² = .51, so the signal-to-noise
 * discrimination is λ/√ψ ≈ .98. This model is a logit (Luce) approximation to
 * that probit — see SCORER_VERSION — so the probit discrimination is carried
 * across by the standard logistic-normal scaling constant 1.702.
 *
 * 1.702 is the standard logistic–normal scaling constant, a fixed value from
 * the IRT literature rather than a free parameter — but it is derived for the
 * BINARY probit/logit case and is being borrowed here for a 4-way choice, which
 * is an approximation, not an identity.
 *
 * The resulting precision is not asserted, it is measured: `estimate.ts`'s
 * "Measured precision" section carries the realized numbers, and `scoring.test.ts`
 * AC-2 enforces them. Note what that comparison can and cannot do — the
 * simulator and the estimator share these same utilities, so an error in the
 * conversion above would be invisible to it.
 */
export const LAMBDA = 0.7;
const PROBIT_DISCRIMINATION = LAMBDA / Math.sqrt(1 - LAMBDA * LAMBDA);
const LOGIT_SCALING = 1.702;
export const DISCRIMINATION = PROBIT_DISCRIMINATION * LOGIT_SCALING;

/**
 * Option attractiveness independent of the trait, held at zero for every
 * option.
 *
 * This is NOT a shrug. It is the instrument's own authoring rule made
 * quantitative: `quest-skill` rejects any block where an option "reads as the
 * good answer in 3 seconds", and comedy is required as the equalizer. A block
 * that passes that review is a block whose options are equally attractive,
 * which is exactly intercept = 0.
 *
 * Read that as MOTIVATION, not identification. The rule is a social-desirability
 * screen judged by an author in three seconds; the intercept absorbs any
 * trait-independent attractiveness at all — humour that lands better, a more
 * vivid image card, sheer salience — none of which the rule measures. A block
 * that passes an author's read is not thereby a block with equal choice
 * propensity in the room.
 *
 * It is therefore the assumption most likely to be wrong, and unlike λ it is
 * checkable after the fact: with N respondents, an option chosen "most" far
 * more often than its pillar-mates across the whole room has a non-zero
 * intercept. That check needs data this file cannot have, so it stays a known
 * limitation rather than a fitted parameter.
 */
export const INTERCEPT = 0;

/** One option's authored parameters. */
export interface ItemParameter {
  key: OptionKey;
  pillar: Pillar;
  /** +1 positively keyed, −1 reversed (the low pole of the block's focus). */
  sign: 1 | -1;
  discrimination: number;
  intercept: number;
}

/** The four options of one block, in the instrument's a..d order. */
export interface BlockItems {
  position: number;
  options: ItemParameter[];
}

/**
 * Derive the item parameters of any instrument. Taking the instrument as an
 * argument rather than reading the constant is what lets the tests build an
 * all-positive copy of the form and show that it measures no levels
 * (`AUDIT.md` F1) using the same estimator.
 */
/**
 * PRECONDITION worth stating, because `estimateLatents` lets callers inject
 * their own items: the "all-positive keying pins Σθ to zero" algebra in
 * `estimate.ts` requires the four options of a block to share ONE
 * discrimination. This function guarantees that — every option gets the same
 * `DISCRIMINATION` constant — but a hand-built item set with unequal
 * within-block discriminations breaks the invariance and the story silently
 * stops being true. Measured: perturbing discriminations by 30% moves the
 * log-likelihood by 2.89 under a shift that should move it by exactly 0.
 */
export function itemParametersOfBlocks(blocks: readonly Block[]): BlockItems[] {
  return blocks.map((block) => ({
    position: block.position,
    options: block.options.map((option) => ({
      key: option.key,
      pillar: option.pillar,
      sign: option.keyed === "reversed" ? (-1 as const) : (1 as const),
      discrimination: DISCRIMINATION,
      intercept: INTERCEPT,
    })),
  }));
}

/** Convenience wrapper for a whole instrument. */
export function itemParametersOf(instrument: Instrument): BlockItems[] {
  return itemParametersOfBlocks(instrument.blocks);
}

/**
 * The parameters of the COMMITTED `INSTRUMENT` form only.
 *
 * Nobody answers that form. Every participant is dealt twelve blocks out of the
 * question bank (`domain/quiz/bank.ts`), so anyone scoring a real respondent
 * must derive their items from THAT PERSON'S OWN blocks — see the warning on
 * `estimateLatents`. This constant is for tests and tooling holding the
 * `INSTRUMENT` form in their hands, and for nothing else.
 */
export const ITEM_PARAMETERS: BlockItems[] = itemParametersOf(INSTRUMENT);
