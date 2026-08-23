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
import type {
  PairSimulationRepository,
  StoredPairSimulation,
} from "../ports/pair-simulation-repository";
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
      emote: event.emote,
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
    subject: {
      id: loRow.participant.id,
      name: loRow.participant.name,
      avatar: loRow.participant.avatar,
      // Set per viewer by `projectForViewer`, never served from the cache.
      photoUrl: null,
    },
    other: {
      id: hiRow.participant.id,
      name: hiRow.participant.name,
      photoUrl: hiRow.participant.photoUrl,
      avatar: hiRow.participant.avatar,
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
  otherPhotoUrl: string | null,
  subjectPhotoUrl: string | null
): SimulatedLife {
  if (viewerId === canonical.subject.id) {
    return {
      ...canonical,
      subject: { ...canonical.subject, photoUrl: subjectPhotoUrl },
      other: { ...canonical.other, photoUrl: otherPhotoUrl },
    };
  }

  if (canonical.lens === "friendship") {
    return {
      lens: "friendship",
      subject: {
        id: canonical.other.id,
        name: canonical.other.name,
        photoUrl: subjectPhotoUrl,
        // The plate travels WITH the person, not with the slot. Leaving this
        // reading `canonical.subject.avatar` is how each viewer ends up
        // watching their own story acted out in the other person's body.
        avatar: canonical.other.avatar,
      },
      other: {
        id: canonical.subject.id,
        name: canonical.subject.name,
        photoUrl: otherPhotoUrl,
        avatar: canonical.subject.avatar,
      },
      events: canonical.events,
    };
  }

  return {
    lens: canonical.lens,
    subject: {
      id: canonical.other.id,
      name: canonical.other.name,
      avatar: canonical.other.avatar,
      photoUrl: subjectPhotoUrl,
    },
    other: {
      id: canonical.subject.id,
      name: canonical.subject.name,
      photoUrl: otherPhotoUrl,
      avatar: canonical.subject.avatar,
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

/**
 * Is this cached row still sealed to the posteriors it was narrated from?
 *
 * Takes the LIVE values rather than reading them: they are read once, above
 * both the cache branch and the generation branch, and the same two `Date`s
 * are what `pairSimulations.save` stamps the new row with. One read, one
 * meaning — a second read here could disagree with the one the seal is
 * written from.
 */
function freshnessMatches(
  cached: StoredPairSimulation,
  loComputedAt: Date,
  hiComputedAt: Date
): boolean {
  return (
    cached.loComputedAt.getTime() === loComputedAt.getTime() &&
    cached.hiComputedAt.getTime() === hiComputedAt.getTime()
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

  // The viewer's own photo, for the face on their own avatar in the reveal.
  const mePhoto = rows.get(subjectId)?.participant.photoUrl ?? null;

  const [lo, hi] = [subjectId, otherId].sort();
  const loRow = rows.get(lo);
  const hiRow = rows.get(hi);
  if (loRow === undefined || hiRow === undefined) return null;

  const posteriors = await deps.latents.byParticipants([lo, hi]);

  /*
   * BOTH sides must hold a posterior, and this is checked BEFORE anything is
   * narrated.
   *
   * It used to be checked after `generateTimeline`, which costs ~33s of model
   * time (docs/domain.md D19) — so a pair with one unscored side made the
   * viewer wait out a full generation and then handed them a 404. Nothing
   * downstream of here could have rescued it: an absent posterior is not a
   * thing generation produces.
   *
   * Read ONCE. These same two values are the cache's freshness seal, compared
   * against the stored row below and stamped onto the row `save` writes at the
   * end, so there is exactly one reading of `computed_at` per request and the
   * seal cannot describe a posterior other than the one the life was narrated
   * from.
   */
  const loComputedAt = await deps.latents.computedAtFor(lo);
  const hiComputedAt = await deps.latents.computedAtFor(hi);
  if (loComputedAt === null || hiComputedAt === null) return null;

  const cached = await deps.pairSimulations.byPair(lens, lo, hi);
  if (cached !== null) {
    const stillOk = await pairAuthorised(loRow, hiRow, lens, posteriors);
    if (!stillOk) return null;

    if (freshnessMatches(cached, loComputedAt, hiComputedAt)) {
      return projectForViewer(cached.life, subjectId, entry.photoUrl, mePhoto);
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
      // Verification input only: an emote the pair cannot both play falls back
      // to the deterministic map inside the narrator.
      avatarA: loRow.participant.avatar,
      avatarB: hiRow.participant.avatar,
    },
    deps.narrator
  );

  const canonical = toCanonicalLife(timeline, loRow, hiRow);

  // `loComputedAt` / `hiComputedAt` are the values read before generation, not
  // a fresh pair: they are the freshness seal of THIS row, and re-reading them
  // here would stamp the row with a posterior the narration never saw.
  await deps.pairSimulations.save({
    lens,
    participantLo: lo,
    participantHi: hi,
    life: canonical,
    scorerVersion: SCORER_VERSION,
    loComputedAt,
    hiComputedAt,
  });

  return projectForViewer(canonical, subjectId, entry.photoUrl, mePhoto);
}
