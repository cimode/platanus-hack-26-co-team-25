/**
 * `simulatePair({ subjectId, otherId, lens }, deps)` — generate one pair's
 * simulated life behind `TimelinePort` (issues #33, #34).
 *
 * Authorisation runs through the viewer's own ranking. The pair is
 * canonicalised ([lo, hi] sorted) before generation or cache lookup; hits are
 * re-authorised against live floor, consent, gates and latent freshness.
 */
import { scorePair } from "../domain/matching/engine";
import { toPerson } from "../domain/matching/to-person";
import type { Lens } from "../domain/participant";
import { meetsFloor, type RankableParticipant } from "../domain/participant";
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
import type { PairSimulationRepository } from "../ports/pair-simulation-repository";
import type { PrepareResultsDeps } from "./prepare-results";
import { rankSubjectRoom } from "./prepare-results";

/** Written by #30's scorer today; stored so stale rows can be detected. */
const SCORER_VERSION = "map-luce-v1";

export interface SimulatePairInput {
  subjectId: string;
  otherId: string;
  lens: Lens;
}

export interface SimulatePairDeps extends PrepareResultsDeps {
  narrator: TimelineNarrator;
  pairSimulations: PairSimulationRepository;
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

function toCanonicalLife(
  timeline: Timeline,
  loRow: RankableParticipant,
  hiRow: RankableParticipant
): SimulatedLife {
  const base = {
    subject: { id: loRow.participant.id, name: loRow.participant.name },
    other: {
      id: hiRow.participant.id,
      name: hiRow.participant.name,
      photoUrl: hiRow.participant.photoUrl,
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

function projectForViewer(
  canonical: SimulatedLife,
  viewerId: string,
  otherPhotoUrl: string | null
): SimulatedLife {
  if (viewerId === canonical.subject.id) {
    return {
      ...canonical,
      other: { ...canonical.other, photoUrl: otherPhotoUrl },
    };
  }

  if (canonical.lens === "friendship") {
    return {
      lens: "friendship",
      subject: { id: canonical.other.id, name: canonical.other.name },
      other: {
        id: canonical.subject.id,
        name: canonical.subject.name,
        photoUrl: otherPhotoUrl,
      },
      events: canonical.events,
    };
  }

  return {
    lens: canonical.lens,
    subject: { id: canonical.other.id, name: canonical.other.name },
    other: {
      id: canonical.subject.id,
      name: canonical.subject.name,
      photoUrl: otherPhotoUrl,
    },
    events: canonical.events,
    horizonYears: canonical.horizonYears,
    ending: canonical.ending,
  };
}

async function pairAuthorised(
  loRow: RankableParticipant,
  hiRow: RankableParticipant,
  lens: Lens,
  posteriors: Awaited<
    ReturnType<PrepareResultsDeps["latents"]["byParticipants"]>
  >
): Promise<boolean> {
  if (!meetsFloor(loRow, lens) || !meetsFloor(hiRow, lens)) return false;
  const personLo = toPerson(
    loRow,
    posteriors.get(loRow.participant.id) ?? {},
    undefined
  );
  const personHi = toPerson(
    hiRow,
    posteriors.get(hiRow.participant.id) ?? {},
    undefined
  );
  return scorePair(personLo, personHi, lens).eligible;
}

async function freshnessMatches(
  deps: SimulatePairDeps,
  lo: string,
  hi: string,
  loComputedAt: Date,
  hiComputedAt: Date
): Promise<boolean> {
  const liveLo = await deps.latents.computedAtFor(lo);
  const liveHi = await deps.latents.computedAtFor(hi);
  if (liveLo === null || liveHi === null) return false;
  return (
    liveLo.getTime() === loComputedAt.getTime() &&
    liveHi.getTime() === hiComputedAt.getTime()
  );
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

  const [lo, hi] = [subjectId, otherId].sort();
  const loRow = rows.get(lo);
  const hiRow = rows.get(hi);
  if (loRow === undefined || hiRow === undefined) return null;

  const posteriors = await deps.latents.byParticipants([lo, hi]);

  const cached = await deps.pairSimulations.byPair(lens, lo, hi);
  if (cached !== null) {
    const stillOk = await pairAuthorised(loRow, hiRow, lens, posteriors);
    if (!stillOk) return null;

    const fresh = await freshnessMatches(
      deps,
      lo,
      hi,
      cached.loComputedAt,
      cached.hiComputedAt
    );
    if (fresh) {
      return projectForViewer(cached.life, subjectId, entry.photoUrl);
    }
  }

  const personLo = toPerson(loRow, posteriors.get(lo) ?? {}, undefined);
  const personHi = toPerson(hiRow, posteriors.get(hi) ?? {}, undefined);
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

  const canonical = toCanonicalLife(timeline, loRow, hiRow);
  const loComputedAt = await deps.latents.computedAtFor(lo);
  const hiComputedAt = await deps.latents.computedAtFor(hi);
  if (loComputedAt === null || hiComputedAt === null) return null;

  await deps.pairSimulations.save({
    lens,
    participantLo: lo,
    participantHi: hi,
    life: canonical,
    scorerVersion: SCORER_VERSION,
    loComputedAt,
    hiComputedAt,
  });

  return projectForViewer(canonical, subjectId, entry.photoUrl);
}
