/**
 * verify.ts — code verification of the LLM-nominated bonus arc (approach B).
 *
 * The narrator's nominate() returns {pattern, domain, outcome, triggerClaim}.
 * The LLM may PROPOSE, but only code ADMITS: the trigger claim must name a
 * score component that actually exists in this pair's PairScore —
 *   "driver:<term>"   → term must be one of the top-3 named drivers (w_rank)
 *   "friction:<term>" → term must be THE scored friction term
 *   "flag:<name>"     → the flag must have fired for this pair (and lens)
 * — and the proposed pattern/domain/outcome must come from the grammar space,
 * without duplicating an arc the sampler already placed. Unjustified arcs are
 * rejected and the timeline ships without a bonus arc; nothing else changes.
 */

import type { Lens, PairScore, TermName } from '../shared.ts';
import type { GrammarSpace, Nomination } from '../lib/narrator.ts';

const TERM_NAMES: readonly TermName[] = [
  'regulation', 'politeness', 'reliability', 'agency',
  'distance', 'lifeShape', 'commonGround', 'structural', 'eligibility',
];

function isTermName(s: string): s is TermName {
  return (TERM_NAMES as readonly string[]).includes(s);
}

export type ClaimKind = 'driver' | 'friction' | 'flag';

export interface TriggerVerdict {
  admitted: boolean;
  reason: string;               // human-readable audit trail
  claimKind: ClaimKind | null;
  /** Pillar the admitted arc cites (flags map to their underlying pillar). */
  sourceTerm: TermName | null;
}

function reject(reason: string): TriggerVerdict {
  return { admitted: false, reason, claimKind: null, sourceTerm: null };
}

export function verifyTriggerClaim(
  nom: Nomination,
  score: PairScore,
  lens: Lens,
  space: GrammarSpace,
  existingArcs: ReadonlyArray<{ pattern: string; domain: string }>,
): TriggerVerdict {
  // 1. The proposal must live inside the grammar.
  if (!space.patterns.includes(nom.pattern)) return reject(`pattern "${nom.pattern}" outside the grammar`);
  if (!space.domains.includes(nom.domain)) return reject(`domain "${nom.domain}" outside the ${lens} grammar`);
  if (!space.outcomes.includes(nom.outcome)) return reject(`outcome "${nom.outcome}" outside the grammar`);

  // 2. No duplicating a domain the seeded sampler already staged — a bonus arc
  //    must add a NEW thread, not restate an existing one in a new shape.
  if (existingArcs.some((e) => e.domain === nom.domain)) {
    return reject(`domain "${nom.domain}" already carries a sampled arc`);
  }

  // 3. The trigger claim must parse and must be TRUE of this pair's scores.
  const m = /^(driver|friction|flag):([A-Za-z]+)$/.exec(nom.triggerClaim.trim());
  if (!m) return reject(`malformed trigger claim "${nom.triggerClaim}"`);
  const kind = m[1] as ClaimKind;
  const name = m[2];

  if (kind === 'driver') {
    if (!isTermName(name)) return reject(`unknown term "${name}" in driver claim`);
    const hit = score.drivers.find((d) => d.term === name && d.contribution > 0);
    if (!hit) return reject(`"${name}" is not one of this pair's top drivers`);
    return { admitted: true, reason: `driver:${name} verified (contribution ${hit.contribution.toFixed(3)})`, claimKind: kind, sourceTerm: name };
  }

  if (kind === 'friction') {
    if (!isTermName(name)) return reject(`unknown term "${name}" in friction claim`);
    if (score.friction?.term !== name) {
      return reject(`"${name}" is not this pair's friction term (actual: ${score.friction?.term ?? 'none'})`);
    }
    return { admitted: true, reason: `friction:${name} verified (shortfall ${score.friction.shortfall.toFixed(3)})`, claimKind: kind, sourceTerm: name };
  }

  // kind === 'flag'
  if (name === 'bothHighAgency') {
    if (lens === 'friendship' || score.flags.bothHighAgency === undefined) {
      return reject('bothHighAgency flag did not fire for this pair');
    }
    return { admitted: true, reason: `flag:bothHighAgency verified (p=${score.flags.bothHighAgency.toFixed(2)})`, claimKind: kind, sourceTerm: 'agency' };
  }
  if (name === 'pursueWithdraw') {
    if (lens !== 'romantic' || score.flags.pursueWithdraw === undefined) {
      return reject('pursueWithdraw flag did not fire for this pair');
    }
    return { admitted: true, reason: 'flag:pursueWithdraw verified', claimKind: kind, sourceTerm: 'distance' };
  }
  return reject(`unknown flag "${name}"`);
}
