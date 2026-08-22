/**
 * The offspring gate (docs/domain.md D12, AUDIT.md S17): a pure predicate, and
 * in this change nothing more than a pure predicate.
 *
 * THIS CHANGE RENDERS NO OFFSPRING AFFORDANCE AT ALL -- not enabled, not
 * disabled, not a locked slot, not a greyed placeholder. That is not scope
 * laziness, it is the same rule the gate exists to enforce: a locked slot on
 * `/simulate/[id]` would tell the viewer that the OTHER person declined
 * romantic consent, which is precisely the disclosure being prevented. The
 * screen's output has to be byte-identical either way (AC-PORT-8), and the
 * only output that is byte-identical either way is no output.
 *
 * The predicate lands now anyway because it is the contract the reveal is
 * built against later, and because writing it here means the eventual reveal
 * cannot invent a looser rule at the call site.
 */
import type { Consent } from "../participant/participant";
import type { Lens } from "../room/layout";

/**
 * The only thing the gate reads. Structural on purpose: a `Participant`, a
 * `RankableParticipant`'s participant, and a fixture row all satisfy it
 * without this module importing the aggregate.
 */
export interface ConsentHolder {
  readonly consent: Consent;
}

/**
 * `true` only under the romantic lens AND with BOTH people opted in.
 *
 * Mutual, so it is symmetric: swapping the arguments cannot change the answer.
 * Romantic-only, so consenting to business or friendship never opens it --
 * consent is per-lens (CONTEXT.md §7.3) and romantic is opt-OUT by default.
 */
export function offspringVisible(
  viewer: ConsentHolder,
  other: ConsentHolder,
  lens: Lens
): boolean {
  return (
    lens === "romantic" && viewer.consent.romantic && other.consent.romantic
  );
}
