import type { Lens } from "../domain/participant";
import type { SimulatedLife } from "../domain/reveal/timeline";

/** One cached narrative row, always in canonical `(lo, hi)` orientation. */
export interface StoredPairSimulation {
  readonly lens: Lens;
  readonly participantLo: string;
  readonly participantHi: string;
  /** `subject.id === participantLo` and `other.id === participantHi`. */
  readonly life: SimulatedLife;
  readonly scorerVersion: string;
  readonly loComputedAt: Date;
  readonly hiComputedAt: Date;
  readonly createdAt: Date;
}

export interface PairSimulationSave {
  readonly lens: Lens;
  readonly participantLo: string;
  readonly participantHi: string;
  readonly life: SimulatedLife;
  readonly scorerVersion: string;
  readonly loComputedAt: Date;
  readonly hiComputedAt: Date;
}

export interface PairSimulationRepository {
  byPair(
    lens: Lens,
    participantLo: string,
    participantHi: string
  ): Promise<StoredPairSimulation | null>;
  save(row: PairSimulationSave): Promise<void>;
}
