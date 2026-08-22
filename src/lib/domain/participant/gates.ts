/**
 * Lens gates (docs/domain.md §3, D5): one row per lens, and no row means the
 * participant was never asked. The engine's input contract owns these types --
 * `src/lib/domain/matching/engine.ts` -- so they are re-exported here rather
 * than redefined (docs/domain.md header: where this file and the engine
 * disagree, the engine wins).
 */
import type {
  BusinessGate,
  Gender,
  Lens,
  RomanticGate,
} from "../matching/engine";

export type { BusinessGate, Gender, Lens, RomanticGate };

/** The three lenses, in the order the intake asks for consent. */
export const LENSES: readonly Lens[] = ["romantic", "business", "friendship"];

/** The genders the romantic gate offers (the `gender` enum in SQL). */
export const GENDERS: readonly Gender[] = ["M", "F", "NB"];

function requireBand(field: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`gate: ${field} must be 0..${max}, got ${value}`);
  }
}

/** ageBand 0..3, `interestedIn` non-empty. Throws naming the field. */
export function validateRomanticGate(gate: RomanticGate): void {
  if (!GENDERS.includes(gate.gender)) {
    throw new Error(`gate: gender must be one of ${GENDERS.join(", ")}`);
  }
  if (gate.interestedIn.length === 0) {
    throw new Error("gate: interestedIn must name at least one gender");
  }
  for (const gender of gate.interestedIn) {
    if (!GENDERS.includes(gender)) {
      throw new Error(
        `gate: interestedIn must be one of ${GENDERS.join(", ")}, got ${gender}`
      );
    }
  }
  requireBand("ageBand", gate.ageBand, 3);
}

/** riskPosture and exitHorizon 0..2. Throws naming the field. */
export function validateBusinessGate(gate: BusinessGate): void {
  requireBand("riskPosture", gate.riskPosture, 2);
  requireBand("exitHorizon", gate.exitHorizon, 2);
}
