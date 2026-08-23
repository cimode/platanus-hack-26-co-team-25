/**
 * The MVP gate defaults (docs/domain.md D18).
 *
 * The registration screen asks for a photo, a name, a gender and a birthdate,
 * and nothing else. The engine's two gate shapes still want five and three
 * fields respectively, so this module is the ONE place that says what the
 * unasked ones are -- rather than each read site inventing a default and the
 * three of them drifting.
 *
 * The choices are deliberately the permissive end of every axis: a gate whose
 * unasked half filtered people out would silently shrink the ranking, and the
 * ranking is the demo. Gender and the age band are the two that are real --
 * gender is asked, the band is derived from the birthdate (`ageBandOf`).
 *
 * The `romantic_gates` / `business_gates` tables still exist and are simply not
 * written any more (issue #42 Scope Out); nothing reads them for a participant
 * registered under D18.
 */
import type { BusinessGate, Gender, RomanticGate } from "./gates";
import { GENDERS } from "./gates";
import { ageBandOf, type IsoDate } from "./participant";

/** Everything the MVP no longer asks, stated once. */
export const MVP_GATES = {
  /** Every gender, so the romantic gate never filters on orientation. */
  interestedIn: GENDERS,
  single: true,
  wantsKids: true,
  /** Mid of 0..2 on both business axes; `redlinesOk` is the permissive end. */
  riskPosture: 1,
  exitHorizon: 1,
  redlinesOk: true,
} as const;

/** The romantic gate a D18 participant is ranked with. */
export function mvpRomanticGate(
  identity: { gender: Gender; birthdate: IsoDate },
  today: Date
): RomanticGate {
  return {
    gender: identity.gender,
    interestedIn: [...MVP_GATES.interestedIn],
    single: MVP_GATES.single,
    wantsKids: MVP_GATES.wantsKids,
    ageBand: ageBandOf(identity.birthdate, today),
  };
}

/** The business gate a D18 participant is ranked with -- the same for everyone. */
export function mvpBusinessGate(): BusinessGate {
  return {
    riskPosture: MVP_GATES.riskPosture,
    exitHorizon: MVP_GATES.exitHorizon,
    redlinesOk: MVP_GATES.redlinesOk,
  };
}
