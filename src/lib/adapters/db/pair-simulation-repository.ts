import { and, eq } from "drizzle-orm";

import type { Lens } from "../../domain/participant";
import type { SimulatedLife } from "../../domain/reveal/timeline";
import type {
  PairSimulationRepository,
  PairSimulationSave,
  StoredPairSimulation,
} from "../../ports/pair-simulation-repository.ts";
import type { Db } from "./client.ts";
import { pairSimulations } from "./schema/pair-simulations.ts";

const COLUMNS = {
  lens: pairSimulations.lens,
  participantLo: pairSimulations.participantLo,
  participantHi: pairSimulations.participantHi,
  life: pairSimulations.life,
  scorerVersion: pairSimulations.scorerVersion,
  loComputedAt: pairSimulations.loComputedAt,
  hiComputedAt: pairSimulations.hiComputedAt,
  createdAt: pairSimulations.createdAt,
};

function toStored(row: {
  lens: string;
  participantLo: string;
  participantHi: string;
  life: unknown;
  scorerVersion: string;
  loComputedAt: Date;
  hiComputedAt: Date;
  createdAt: Date;
}): StoredPairSimulation {
  return {
    lens: row.lens as Lens,
    participantLo: row.participantLo,
    participantHi: row.participantHi,
    life: row.life as SimulatedLife,
    scorerVersion: row.scorerVersion,
    loComputedAt: row.loComputedAt,
    hiComputedAt: row.hiComputedAt,
    createdAt: row.createdAt,
  };
}

export function createPairSimulationRepository(
  db: Db
): PairSimulationRepository {
  return {
    async byPair(lens, participantLo, participantHi) {
      const rows = await db
        .select(COLUMNS)
        .from(pairSimulations)
        .where(
          and(
            eq(pairSimulations.lens, lens),
            eq(pairSimulations.participantLo, participantLo),
            eq(pairSimulations.participantHi, participantHi)
          )
        )
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toStored(row);
    },

    async save(row: PairSimulationSave) {
      await db
        .insert(pairSimulations)
        .values({
          lens: row.lens,
          participantLo: row.participantLo,
          participantHi: row.participantHi,
          life: row.life,
          scorerVersion: row.scorerVersion,
          loComputedAt: row.loComputedAt,
          hiComputedAt: row.hiComputedAt,
        })
        .onConflictDoUpdate({
          target: [
            pairSimulations.lens,
            pairSimulations.participantLo,
            pairSimulations.participantHi,
          ],
          set: {
            life: row.life,
            scorerVersion: row.scorerVersion,
            loComputedAt: row.loComputedAt,
            hiComputedAt: row.hiComputedAt,
          },
        });
    },
  };
}
