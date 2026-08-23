/**
 * `simulatePair({ subjectId, otherId, lens }, deps)` — generate one pair's
 * simulated life behind `TimelinePort` (issue #33).
 *
 * Authorisation runs through the viewer's own ranking: an id in the URL never
 * reaches the generator unchecked. The pair is canonicalised ([lo, hi] sorted)
 * before generation so the life is a property of the pair, not of who asked;
 * the result is then projected back with `subject` always the caller.
 */
import { scorePair } from "../domain/matching/engine";
import { toPerson } from "../domain/matching/to-person";
import type { Lens } from "../domain/participant";
import type {
  Ending,
  FriendshipTimeline,
  LifeEvent,
  PairedTimeline,
  SimulatedLife,
} from "../domain/reveal/timeline";
import { generateTimeline } from "../domain/timeline/index";
import type { Timeline, TimelineNarrator } from "../domain/timeline/shared";
import { hashSeed } from "../domain/timeline/shared";
import type { PrepareResultsDeps } from "./prepare-results";
import { rankSubjectRoom } from "./prepare-results";

export interface SimulatePairInput {
  subjectId: string;
  otherId: string;
  lens: Lens;
}

export interface SimulatePairDeps extends PrepareResultsDeps {
  narrator: TimelineNarrator;
}

function pairSeed(lo: string, hi: string, lens: Lens): number {
  return hashSeed("simulate", lo, hi, lens);
}

function mapEvents(timeline: Timeline): LifeEvent[] {
  return timeline.events
    .map((event) => ({
      year: event.year,
      kind: event.kind,
      text: event.text,
    }))
    .sort((a, b) => a.year - b.year);
}

function mapEnding(timeline: Timeline): Ending {
  if (timeline.lens === "friendship") {
    throw new Error("friendship timelines carry no ending");
  }
  if (timeline.dissolution === null) {
    return { outcome: "together" };
  }
  return {
    outcome: "apart",
    year: timeline.dissolution.year,
    epilogue: timeline.epilogue,
  };
}

function projectTimeline(
  timeline: Timeline,
  subjectId: string,
  otherPhotoUrl: string | null
): SimulatedLife {
  const canonicalLo = timeline.personA.id;
  const subjectIsLo = subjectId === canonicalLo;
  const subjectRef = subjectIsLo ? timeline.personA : timeline.personB;
  const otherRef = subjectIsLo ? timeline.personB : timeline.personA;

  const base = {
    subject: { id: subjectRef.id, name: subjectRef.name },
    other: {
      id: otherRef.id,
      name: otherRef.name,
      photoUrl: otherPhotoUrl,
    },
    events: mapEvents(timeline),
  };

  if (timeline.lens === "friendship") {
    const life: FriendshipTimeline = { lens: "friendship", ...base };
    return life;
  }

  const life: PairedTimeline = {
    lens: timeline.lens,
    ...base,
    horizonYears: timeline.horizonYears,
    ending: mapEnding(timeline),
  };
  return life;
}

export async function simulatePair(
  input: SimulatePairInput,
  deps: SimulatePairDeps
): Promise<SimulatedLife | null> {
  const { subjectId, otherId, lens } = input;

  if (otherId === subjectId) return null;

  const { room, rows } = await rankSubjectRoom(subjectId, lens, deps);
  if (room.status !== "ranked") return null;

  const entry = room.entries.find((ranked) => ranked.id === otherId);
  if (entry === undefined) return null;

  const subjectRow = rows.get(subjectId);
  const otherRow = rows.get(otherId);
  if (subjectRow === undefined || otherRow === undefined) return null;

  const posteriors = await deps.latents.byParticipants([subjectId, otherId]);
  const cohorts = new Map<string, number | undefined>();
  for (const id of [subjectId, otherId]) {
    const row = rows.get(id);
    if (row === undefined) continue;
    // Cohort is computed in prepareResults over the whole room; for the pair
    // we only need a stable value per row. Re-read from the ranking path's
    // toPerson call sites by passing undefined — the engine treats missing
    // cohort as undefined, which is fine for simulation.
    cohorts.set(id, undefined);
  }

  const [lo, hi] = [subjectId, otherId].sort();
  const loRow = rows.get(lo);
  const hiRow = rows.get(hi);
  if (loRow === undefined || hiRow === undefined) return null;

  const personLo = toPerson(loRow, posteriors.get(lo) ?? {}, cohorts.get(lo));
  const personHi = toPerson(hiRow, posteriors.get(hi) ?? {}, cohorts.get(hi));
  const score = scorePair(personLo, personHi, lens);
  if (!score.eligible) return null;

  const timeline = await generateTimeline(
    personLo,
    personHi,
    score,
    lens,
    {
      seed: pairSeed(lo, hi, lens),
      offspringConsentA: true,
      offspringConsentB: true,
    },
    deps.narrator
  );

  return projectTimeline(timeline, subjectId, entry.photoUrl);
}
