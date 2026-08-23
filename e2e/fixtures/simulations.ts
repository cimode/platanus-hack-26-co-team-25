import { createDb } from "../../src/lib/adapters/db/client";
import { createLatentRepository } from "../../src/lib/adapters/db/latent-repository";
import { createPairSimulationRepository } from "../../src/lib/adapters/db/pair-simulation-repository";
import type { Lens, ParticipantId } from "../../src/lib/domain/participant";
import { PILLARS } from "../../src/lib/domain/quiz/instrument";
import type {
  EventKind,
  LifeEvent,
  SimulatedLife,
} from "../../src/lib/domain/reveal/timeline";

/**
 * Cached pair simulations, so `/simulate/[id]` answers without a model.
 *
 * `simulatePair` reads `pairSimulations.byPair` and returns on a hit BEFORE it
 * reaches the narrator. That is the whole seam: CI has no AI Gateway
 * credentials, so an uncached pair leaves the screen on "Escribiendo esta
 * vida" until the test times out -- which is why all 24 simulate specs had
 * never once passed.
 *
 * It also makes the outcomes DETERMINISTIC, which those specs need and a live
 * model cannot give them: AC-SIM-6 asserts one pair that ends apart with an
 * epilogue and another that ends apart without one. Deciding that here is the
 * same move `e2e/intake.spec.ts` makes when it seeds the blocks it needs
 * rather than authoring them against the gateway.
 *
 * A hit also requires FRESHNESS: `freshnessMatches` compares the row's
 * `loComputedAt` / `hiComputedAt` against `latents.computedAtFor`, and returns
 * false when either side is unscored. So the cast is given latents here too,
 * stamped with the one clock below.
 */

/** One clock for the latents and the cached rows, so freshness matches. */
const COMPUTED_AT = new Date("2026-01-01T00:00:00.000Z");
const SCORER_VERSION = "map-luce-v1";

/** All sixteen, one each: AC-SIM-5 counts sixteen cards with one chip apiece,
 *  so a subset leaves most of `tagFor`'s branches rendered by nothing. */
const ALL_KINDS: readonly EventKind[] = [
  "milestone",
  "move",
  "job",
  "pet",
  "kid",
  "ritual",
  "trip",
  "conflict",
  "recovery",
  "venture",
  "client",
  "decision",
  "exit",
  "dissolution",
  "epilogue",
  "vignette",
];

/** Prose with nothing score-shaped and nothing offspring-shaped in it:
 *  AC-PORT-8 scans the rendered body for both. */
function eventsFor(horizon: number): readonly LifeEvent[] {
  return ALL_KINDS.map((kind, index) => ({
    // Spread across the horizon and clamped to it, so the rail never shows a
    // year past the denominator in the header pill.
    year: Math.min(
      horizon,
      Math.floor((index / ALL_KINDS.length) * horizon) + 1
    ),
    kind,
    text: `Un momento de esos que quedan, el ${index + 1}.`,
  }));
}

interface Person {
  readonly id: string;
  readonly name: string;
}

/** Canonical orientation: the port stores `subject.id === lo`, sorted. */
function canonical(a: Person, b: Person): [Person, Person] {
  return a.id < b.id ? [a, b] : [b, a];
}

type EndingSpec =
  | { readonly outcome: "together" }
  | {
      readonly outcome: "apart";
      readonly year: number;
      readonly epilogue: string | null;
    };

export interface PairSpec {
  readonly a: Person;
  readonly b: Person;
  readonly lens: Lens;
  /** Romantic and business only; friendship structurally has none. */
  readonly horizonYears?: number;
  readonly ending?: EndingSpec;
}

function lifeFor(spec: PairSpec): SimulatedLife {
  const [lo, hi] = canonical(spec.a, spec.b);
  const base = {
    // Different plates on purpose: a swap bug that puts one person's body on
    // the other is invisible when both wear the same one.
    subject: {
      id: lo.id,
      name: lo.name,
      avatar: "avatar3" as const,
      photoUrl: null,
    },
    other: {
      id: hi.id,
      name: hi.name,
      photoUrl: null,
      avatar: "avatar1" as const,
    },
  };

  if (spec.lens === "friendship") {
    // No horizon, no ending: the union's whole point is that friendship makes
    // no duration claim, and absent is a compile error rather than a null.
    return { ...base, lens: "friendship", events: eventsFor(10) };
  }

  const horizon = spec.horizonYears ?? 12;
  return {
    ...base,
    lens: spec.lens,
    horizonYears: horizon,
    events: eventsFor(horizon),
    ending: spec.ending ?? { outcome: "together" },
  };
}

function repositories() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  return {
    latents: createLatentRepository(db),
    pairSimulations: createPairSimulationRepository(db),
  };
}

/** Four pillars per person, one clock, so `computedAtFor` has a value to match. */
export async function seedLatents(ids: readonly string[]): Promise<void> {
  const { latents } = repositories();
  for (const id of ids) {
    await latents.replaceForParticipant(
      id as ParticipantId,
      PILLARS.map((pillar) => ({
        pillar,
        mean: 0.6,
        se: 0.1,
        scorerVersion: SCORER_VERSION,
        computedAt: COMPUTED_AT,
      }))
    );
  }
}

/** Writes one cached life per spec, in canonical orientation. */
export async function seedSimulations(
  specs: readonly PairSpec[]
): Promise<void> {
  const { pairSimulations } = repositories();
  for (const spec of specs) {
    const [lo, hi] = canonical(spec.a, spec.b);
    await pairSimulations.save({
      lens: spec.lens,
      participantLo: lo.id,
      participantHi: hi.id,
      life: lifeFor(spec),
      scorerVersion: SCORER_VERSION,
      loComputedAt: COMPUTED_AT,
      hiComputedAt: COMPUTED_AT,
    });
  }
}
