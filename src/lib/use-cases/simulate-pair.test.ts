import { describe, expect, it } from "vitest";
import { TAG_TOKENS, tagFor } from "../../components/simulate/event-tag";
import { stubLlm } from "../adapters/llm/fake";
import { createTimelineNarrator } from "../adapters/timeline/narrator";
import {
  type Emote,
  isReactionEmote,
  playableByAll,
} from "../domain/emotes/emotes";
import type {
  BusinessGate,
  Consent,
  DeclaredProfile,
  Lens,
  Participant,
  ParticipantId,
  RankableParticipant,
  RomanticGate,
  RoomId,
} from "../domain/participant";
import { floorReason, meetsFloor } from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz";
import { INSTRUMENT, PILLARS } from "../domain/quiz";
import type {
  EventKind,
  FriendshipTimeline,
  SimulatedLife,
} from "../domain/reveal/timeline";
import type {
  NarrateResult,
  NominateResult,
  TimelineNarrator,
} from "../domain/timeline/shared";
import { scanBanned, scanSurvivalClaims } from "../domain/timeline/shared";
import type {
  LatentPosteriors,
  StoredLatent,
} from "../ports/latent-repository";
import type { LlmPort } from "../ports/llm";
import type {
  PairSimulationRepository,
  PairSimulationSave,
  StoredPairSimulation,
} from "../ports/pair-simulation-repository";
import type { Room } from "../ports/room-repository";
import type {
  ScoreParticipantInput,
  ScoreParticipantResult,
} from "./score-participant";
import { type SimulatePairDeps, simulatePair } from "./simulate-pair";

const FIXED_SENTENCE = "Una frase fija para la prueba.";
/**
 * Deliberately NOT what `emoteForLifeEvent` answers for most beats, so a test
 * can tell the model's choice apart from the deterministic fallback. `cry` is
 * the map's answer only for `epilogue`.
 */
const FIXED_EMOTE = "cry";

const ROOM_ID: RoomId = "33333333-3333-7333-8333-333333333333";
const CREATED_AT = new Date("2026-08-22T18:00:00.000Z");
const DECLARED_AT = new Date("2026-08-22T18:40:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T18:50:00.000Z");
const T0 = new Date("2026-08-22T19:00:00.000Z");
const SCORED_AT = new Date("2026-08-22T19:05:00.000Z");
const NOW = new Date("2026-08-22T20:00:00.000Z");

const ALL_LENSES: Consent = {
  romantic: true,
  business: true,
  friendship: true,
};
const NO_LENSES: Consent = {
  romantic: false,
  business: false,
  friendship: false,
};

const ROOM: Room = {
  id: ROOM_ID,
  slug: "sala-demo",
  name: "Sala demo",
  instrumentVersion: INSTRUMENT.version,
  createdAt: CREATED_AT,
};

const BANDS = {
  moneyPosture: 2,
  rootedness: 2,
  familyGravity: 1,
  capacityHoursBand: 2,
  distanceBand: 1,
  chronotype: 1,
} as const;

const NO_BANDS: DeclaredProfile = {
  moneyPosture: null,
  rootedness: null,
  familyGravity: null,
  capacityHoursBand: null,
  distanceBand: null,
  chronotype: null,
  tags: [],
  acquaintances: [],
};

const SUBJECT_ROMANTIC: RomanticGate = {
  gender: "F",
  interestedIn: ["M"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};
const MUTUAL_ROMANTIC: RomanticGate = {
  gender: "M",
  interestedIn: ["F"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};
const MISMATCHED_ROMANTIC: RomanticGate = {
  gender: "M",
  interestedIn: ["M"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};
const BUSINESS: BusinessGate = {
  riskPosture: 1,
  exitHorizon: 1,
  redlinesOk: true,
};

interface RankableOverrides {
  participant?: Partial<Participant>;
  declared?: Partial<DeclaredProfile>;
  romanticGate?: RomanticGate;
  businessGate?: BusinessGate;
  acquaintances?: ParticipantId[];
}

function rankable(
  id: ParticipantId,
  name: string,
  over: RankableOverrides = {}
): RankableParticipant {
  const declared: DeclaredProfile = {
    ...BANDS,
    tags: ["ramen", "escalada"],
    acquaintances: over.acquaintances ?? [],
    ...over.declared,
  };
  return {
    participant: {
      id,
      roomId: ROOM_ID,
      name,
      gender: "F",
      birthdate: "1996-05-04",
      avatar: null,
      photoUrl: `https://blob.example/${id}.jpg`,
      team: null,
      track: null,
      consent: ALL_LENSES,
      dataConsentAt: CREATED_AT,
      declaredAt: DECLARED_AT,
      quizCompletedAt: T0,
      createdAt: CREATED_AT,
      ...over.participant,
      declared,
    },
    romanticGate: over.romanticGate,
    businessGate: over.businessGate,
    acquaintances: over.acquaintances ?? [],
  };
}

const ANA = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
const CARLA = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
const DARIO = "dddddddd-dddd-7ddd-8ddd-dddddddddddd";

const ROW_ANA = rankable(ANA, "Ana", {
  participant: { team: "alpha", quizCompletedAt: T0 },
  romanticGate: SUBJECT_ROMANTIC,
  businessGate: BUSINESS,
  declared: {
    moneyPosture: 3,
    rootedness: 3,
    familyGravity: 0,
    capacityHoursBand: 2,
    distanceBand: 1,
    chronotype: 1,
    tags: ["escalada", "ramen", "podcasts"],
  },
});
const ROW_BRUNO = rankable(BRUNO, "Bruno", {
  participant: {
    team: "alpha",
    quizCompletedAt: new Date(T0.getTime() + 10 * 60_000),
  },
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
  declared: {
    moneyPosture: 3,
    rootedness: 3,
    familyGravity: 0,
    capacityHoursBand: 2,
    distanceBand: 1,
    chronotype: 1,
    tags: ["escalada", "ramen", "ajedrez"],
  },
  acquaintances: [ANA],
});
const ROW_CARLA = rankable(CARLA, "Carla", {
  participant: {
    team: "beta",
    quizCompletedAt: new Date(T0.getTime() + 40 * 60_000),
  },
  declared: {
    moneyPosture: 0,
    rootedness: 0,
    familyGravity: 3,
    capacityHoursBand: 0,
    distanceBand: 3,
    chronotype: 3,
    tags: ["perros"],
  },
});
const ROW_DARIO = rankable(DARIO, "Dario", {
  participant: { quizCompletedAt: null },
  declared: {
    moneyPosture: 3,
    rootedness: 1,
    familyGravity: 0,
    capacityHoursBand: 1,
    distanceBand: 2,
    chronotype: 1,
    tags: ["ramen", "podcasts"],
  },
});

const AC1_ROOM = [ROW_ANA, ROW_BRUNO, ROW_CARLA, ROW_DARIO];

const LATENTS: Record<string, LatentPosteriors> = {
  [ANA]: {
    regulation: { mean: 0.8, se: 0.1 },
    politeness: { mean: 0.6, se: 0.1 },
    reliability: { mean: 0.7, se: 0.1 },
    agency: { mean: 0.5, se: 0.1 },
  },
  [BRUNO]: {
    regulation: { mean: 0.75, se: 0.1 },
    politeness: { mean: 0.65, se: 0.1 },
    reliability: { mean: 0.7, se: 0.1 },
    agency: { mean: 0.5, se: 0.1 },
  },
  [CARLA]: {
    regulation: { mean: 0.3, se: 0.1 },
    politeness: { mean: 0.35, se: 0.1 },
    reliability: { mean: 0.4, se: 0.1 },
    agency: { mean: 0.9, se: 0.1 },
  },
  [DARIO]: {
    regulation: { mean: 0.5, se: 0.1 },
    politeness: { mean: 0.5, se: 0.1 },
    reliability: { mean: 0.5, se: 0.1 },
    agency: { mean: 0.5, se: 0.1 },
  },
};

const SUBJECT = "11111111-1111-7111-8111-111111111111";
const RANKABLE = "22222222-2222-7222-8222-222222222222";
const ABANDONED = "44444444-4444-7444-8444-444444444444";
const NO_PHOTO = "55555555-5555-7555-8555-555555555555";
const DECLINER = "66666666-6666-7666-8666-666666666666";
const MISMATCH = "77777777-7777-7777-8777-777777777777";
const GHOST = "99999999-9999-7999-8999-999999999999";

const ROW_SUBJECT = rankable(SUBJECT, "Sofia", {
  romanticGate: SUBJECT_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_RANKABLE = rankable(RANKABLE, "Rafa", {
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_ABANDONED = rankable(ABANDONED, "Abel", {
  participant: {
    gender: null,
    birthdate: null,
    declaredAt: null,
    quizCompletedAt: null,
  },
  declared: NO_BANDS,
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_NO_PHOTO = rankable(NO_PHOTO, "Nadia", {
  participant: { photoUrl: null },
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_DECLINER = rankable(DECLINER, "Diego", {
  participant: { consent: NO_LENSES },
});
const ROW_MISMATCH = rankable(MISMATCH, "Mateo", {
  romanticGate: MISMATCHED_ROMANTIC,
  businessGate: BUSINESS,
});

const AC8_ROOM = [
  ROW_SUBJECT,
  ROW_RANKABLE,
  ROW_ABANDONED,
  ROW_NO_PHOTO,
  ROW_DECLINER,
  ROW_MISMATCH,
];

function participantsFake(
  rows: RankableParticipant[],
  floor: (p: RankableParticipant, lens: Lens) => boolean = () => true
) {
  return {
    byIdForRanking(id: ParticipantId) {
      return Promise.resolve(rows.find((r) => r.participant.id === id) ?? null);
    },
    byRoomForRanking(roomId: RoomId, lens: Lens) {
      return Promise.resolve(
        rows.filter((r) => r.participant.roomId === roomId && floor(r, lens))
      );
    },
  };
}

function latentsFake(seed: Record<string, LatentPosteriors> = {}) {
  const store = new Map<ParticipantId, StoredLatent[]>();
  for (const [id, posteriors] of Object.entries(seed)) {
    store.set(
      id,
      Object.entries(posteriors).map(([pillar, estimate]) => ({
        pillar: pillar as StoredLatent["pillar"],
        mean: estimate.mean,
        se: estimate.se ?? 0.1,
        scorerVersion: "map-luce-v1",
        computedAt: SCORED_AT,
      }))
    );
  }

  function read(id: ParticipantId): LatentPosteriors {
    const posteriors: LatentPosteriors = {};
    for (const row of store.get(id) ?? []) {
      posteriors[row.pillar] = { mean: row.mean, se: row.se };
    }
    return posteriors;
  }

  return {
    byParticipants(ids: readonly ParticipantId[]) {
      const map = new Map<ParticipantId, LatentPosteriors>();
      for (const id of ids) {
        const posteriors = read(id);
        if (Object.keys(posteriors).length > 0) map.set(id, posteriors);
      }
      return Promise.resolve(map);
    },
    computedAtFor(id: ParticipantId) {
      const rows = store.get(id) ?? [];
      if (rows.length === 0) return Promise.resolve(null);
      return Promise.resolve(
        new Date(Math.max(...rows.map((r) => r.computedAt.getTime())))
      );
    },
    replaceForParticipant(
      id: ParticipantId,
      rows: readonly StoredLatent[]
    ): Promise<void> {
      store.set(id, [...rows]);
      return Promise.resolve();
    },
  };
}

const KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

function answers(participantId: ParticipantId): BlockResponse[] {
  return Array.from({ length: 15 }, (_, index) => ({
    participantId,
    position: index + 1,
    mostKey: KEYS[index % 4],
    leastKey: KEYS[(index + 1) % 4],
    shownOrder: "abcd",
    answeredAt: ANSWERED_AT,
  }));
}

function responsesFake(rows: Record<string, BlockResponse[]> = {}) {
  const store = new Map<ParticipantId, BlockResponse[]>(Object.entries(rows));
  return {
    byParticipant(id: ParticipantId): Promise<BlockResponse[]> {
      return Promise.resolve([...(store.get(id) ?? [])]);
    },
  };
}

function scorerFake(latents: ReturnType<typeof latentsFake>) {
  return {
    async scoreParticipant(
      input: ScoreParticipantInput
    ): Promise<ScoreParticipantResult> {
      if (input.quizCompletedAt === null) {
        return { scored: false, reason: "quiz-incomplete" };
      }
      await latents.replaceForParticipant(
        input.participantId,
        PILLARS.map((pillar) => ({
          pillar,
          mean: 0.6,
          se: 0.11,
          scorerVersion: "map-luce-v1",
          computedAt: NOW,
        }))
      );
      return { scored: true, responsesUsed: 15 };
    },
  };
}

function countingLlm(inner: LlmPort): LlmPort & { generateCalls: string[] } {
  const generateCalls: string[] = [];
  return {
    generateCalls,
    generate(request) {
      generateCalls.push(request.id);
      return inner.generate(request);
    },
  };
}

function fixedSentenceLlm(): LlmPort {
  // The stub validates against the caller's schema, so this object must satisfy
  // the beat schema in full: a missing `emote` would silently push every beat
  // down the mock-prose path and quietly stop testing the live one.
  return stubLlm(() => ({ text: FIXED_SENTENCE, emote: FIXED_EMOTE }));
}

/**
 * A `TimelineNarrator` that refuses to narrate and records that it was asked.
 *
 * `countingLlm` counts one layer lower and only sees the LIVE narrator; this
 * counts the port itself, so "the timeline was never generated" is asserted
 * against the seam `generateTimeline` actually calls. It throws on use because
 * every test that holds one expects zero calls -- a call is the failure, and
 * failing loudly beats returning plausible sentences.
 */
function countingNarrator(): TimelineNarrator & {
  narrateCalls: number;
  nominateCalls: number;
} {
  const narrator = {
    narrateCalls: 0,
    nominateCalls: 0,
    narrate(): Promise<NarrateResult> {
      narrator.narrateCalls++;
      return Promise.reject(new Error("the narrator must not be reached here"));
    },
    nominate(): Promise<NominateResult> {
      narrator.nominateCalls++;
      return Promise.reject(new Error("the narrator must not be reached here"));
    },
  };
  return narrator;
}

function pairSimulationsFake(): PairSimulationRepository & {
  rows: Map<string, StoredPairSimulation>;
} {
  const rows = new Map<string, StoredPairSimulation>();
  const key = (lens: Lens, lo: string, hi: string) => `${lens}:${lo}:${hi}`;
  return {
    rows,
    byPair(lens, lo, hi) {
      return Promise.resolve(rows.get(key(lens, lo, hi)) ?? null);
    },
    save(row: PairSimulationSave) {
      rows.set(key(row.lens, row.participantLo, row.participantHi), {
        ...row,
        createdAt: new Date(),
      });
      return Promise.resolve();
    },
  };
}

function depsFor(
  rows: RankableParticipant[],
  seed: Record<string, LatentPosteriors>,
  responders: ParticipantId[],
  llm: LlmPort,
  pairSimulations: PairSimulationRepository = pairSimulationsFake()
): SimulatePairDeps {
  const latents = latentsFake(seed);
  const answered: Record<string, BlockResponse[]> = {};
  for (const id of responders) answered[id] = answers(id);
  return {
    participants: participantsFake(rows, meetsFloor),
    latents,
    responses: responsesFake(answered),
    rooms: {
      byId: (id: RoomId) => Promise.resolve(id === ROOM_ID ? ROOM : null),
    },
    scoreParticipant: scorerFake(latents).scoreParticipant,
    narrator: createTimelineNarrator(llm),
    pairSimulations,
  };
}

const EVENT_KINDS: EventKind[] = [
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

/**
 * ANA and BRUNO wearing real plates.
 *
 * The room fixtures leave `avatar: null` on purpose (they cover the pre-column
 * rows), so the plate-carrying assertions build their own pair — and give the
 * two people DIFFERENT plates, because the whole point of these tests is that
 * a plate cannot end up on the wrong body.
 */
const PLATED_ROOM = [
  rankable(ANA, "Ana", {
    participant: { team: "alpha", quizCompletedAt: T0, avatar: "avatar3" },
    romanticGate: SUBJECT_ROMANTIC,
    businessGate: BUSINESS,
    declared: {
      moneyPosture: 3,
      rootedness: 3,
      familyGravity: 0,
      capacityHoursBand: 2,
      distanceBand: 1,
      chronotype: 1,
      tags: ["escalada", "ramen", "podcasts"],
    },
  }),
  rankable(BRUNO, "Bruno", {
    participant: {
      team: "alpha",
      quizCompletedAt: new Date(T0.getTime() + 10 * 60_000),
      avatar: "avatar1",
    },
    romanticGate: MUTUAL_ROMANTIC,
    businessGate: BUSINESS,
    declared: {
      moneyPosture: 3,
      rootedness: 3,
      familyGravity: 0,
      capacityHoursBand: 2,
      distanceBand: 1,
      chronotype: 1,
      tags: ["escalada", "ramen", "cine"],
    },
  }),
  ROW_CARLA,
  ROW_DARIO,
];

describe("simulatePair · avatars and reactions", () => {
  it("carries each person's own plate into the read model", async () => {
    const deps = depsFor(
      PLATED_ROOM,
      LATENTS,
      [ANA, BRUNO],
      fixedSentenceLlm()
    );
    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );

    expect(life).not.toBeNull();
    expect(life?.subject).toMatchObject({ id: ANA, avatar: "avatar3" });
    expect(life?.other).toMatchObject({ id: BRUNO, avatar: "avatar1" });
  });

  it("swaps the plate WITH the person when the other one reads the same pair", async () => {
    // The canonical row is stored subject-is-lo. Whoever opens it must see
    // themselves as `subject`, wearing THEIR OWN body. Reading the plate off the
    // slot instead of the person is how each viewer ends up watching their own
    // life acted out by the other person — invisible in a fixture where both
    // wear the same avatar, which is why these two differ.
    const shared = pairSimulationsFake();
    const forAna = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      depsFor(PLATED_ROOM, LATENTS, [ANA, BRUNO], fixedSentenceLlm(), shared)
    );
    const forBruno = await simulatePair(
      { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
      depsFor(PLATED_ROOM, LATENTS, [ANA, BRUNO], fixedSentenceLlm(), shared)
    );

    expect(forAna?.subject).toMatchObject({ id: ANA, avatar: "avatar3" });
    expect(forAna?.other).toMatchObject({ id: BRUNO, avatar: "avatar1" });

    expect(forBruno?.subject).toMatchObject({ id: BRUNO, avatar: "avatar1" });
    expect(forBruno?.other).toMatchObject({ id: ANA, avatar: "avatar3" });

    // Same story, opposite seats: the events are byte-identical either way.
    expect(forBruno?.events).toEqual(forAna?.events);
  });

  it("gives every event a reaction both avatars can play", async () => {
    const deps = depsFor(
      PLATED_ROOM,
      LATENTS,
      [ANA, BRUNO],
      fixedSentenceLlm()
    );
    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );

    expect(life?.events.length).toBeGreaterThan(0);
    for (const event of life?.events ?? []) {
      expect(isReactionEmote(event.emote), `${event.kind}`).toBe(true);
      expect(playableByAll(["avatar3", "avatar1"], event.emote as Emote)).toBe(
        true
      );
    }
  });

  it("still animates every event when no plate is on file", async () => {
    // The pre-column rows: no sprite will render, but the emote is still there
    // so nothing downstream has to branch on it.
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], fixedSentenceLlm());
    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );

    expect(life?.subject.avatar).toBeNull();
    for (const event of life?.events ?? []) {
      expect(isReactionEmote(event.emote)).toBe(true);
    }
  });
});

describe("simulatePair", () => {
  it("AC-1 · happy path: ranked romantic pair resolves a PairedTimeline with valid events", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm);

    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );

    expect(life).not.toBeNull();
    if (life === null || life.lens === "friendship") {
      throw new Error("expected a romantic PairedTimeline");
    }

    expect(life.lens).toBe("romantic");
    // The viewer's own photo travels with them now, so the reveal can put a
    // face on both parents. Their own is the first exception D11 names.
    expect(life.subject).toEqual({
      id: ANA,
      name: "Ana",
      avatar: null,
      photoUrl: `https://blob.example/${ANA}.jpg`,
    });
    expect(life.other).toEqual({
      id: BRUNO,
      name: "Bruno",
      photoUrl: `https://blob.example/${BRUNO}.jpg`,
      avatar: null,
    });
    expect(life.horizonYears).toBeGreaterThanOrEqual(8);
    expect(life.horizonYears).toBeLessThanOrEqual(14);
    expect(life.events.length).toBeGreaterThan(0);

    const years = life.events.map((event) => event.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));

    for (const event of life.events) {
      expect(EVENT_KINDS).toContain(event.kind);
      expect(TAG_TOKENS).toContain(tagFor(event.kind).token);
    }

    expect(
      life.ending.outcome === "together" || life.ending.outcome === "apart"
    ).toBe(true);

    const payload = JSON.stringify(life);
    for (const forbidden of ["offspring", "baby", "hijo"]) {
      expect(payload.toLowerCase()).not.toContain(forbidden);
    }

    expect(llm.generateCalls.length).toBeGreaterThan(0);
  });

  it("AC-2 · safety: unreachable pairs return null and never reach the model", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const baseDeps = () => depsFor(AC8_ROOM, {}, [SUBJECT], llm);

    expect(floorReason(ROW_ABANDONED, "romantic")).toBe("no-identity");

    const results = await Promise.all([
      simulatePair(
        { subjectId: SUBJECT, otherId: GHOST, lens: "romantic" },
        baseDeps()
      ),
      simulatePair(
        { subjectId: SUBJECT, otherId: ABANDONED, lens: "romantic" },
        baseDeps()
      ),
      simulatePair(
        { subjectId: SUBJECT, otherId: SUBJECT, lens: "romantic" },
        baseDeps()
      ),
      simulatePair(
        { subjectId: SUBJECT, otherId: RANKABLE, lens: "romantic" },
        depsFor(
          AC8_ROOM.filter((r) => r.participant.id !== RANKABLE),
          {},
          [SUBJECT],
          llm
        )
      ),
      simulatePair(
        { subjectId: NO_PHOTO, otherId: RANKABLE, lens: "friendship" },
        baseDeps()
      ),
      simulatePair(
        { subjectId: SUBJECT, otherId: RANKABLE, lens: "romantic" },
        depsFor(
          [
            ROW_SUBJECT,
            {
              ...ROW_DECLINER,
              participant: { ...ROW_DECLINER.participant, consent: NO_LENSES },
            },
          ],
          {},
          [SUBJECT],
          llm
        )
      ),
    ]);

    for (const result of results) {
      expect(result).toBeNull();
    }
    expect(llm.generateCalls).toEqual([]);
  });

  it("AC-3 · canonical pair ordering: same life, per-viewer projection", async () => {
    const llm = fixedSentenceLlm();
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm);

    const fromAna = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    const fromBruno = await simulatePair(
      { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
      deps
    );

    expect(fromAna).not.toBeNull();
    expect(fromBruno).not.toBeNull();
    if (
      fromAna === null ||
      fromBruno === null ||
      fromAna.lens === "friendship" ||
      fromBruno.lens === "friendship"
    ) {
      throw new Error("expected paired timelines");
    }

    expect(fromAna.subject.id).toBe(ANA);
    expect(fromAna.other.id).toBe(BRUNO);
    expect(fromBruno.subject.id).toBe(BRUNO);
    expect(fromBruno.other.id).toBe(ANA);

    const shape = (life: typeof fromAna) =>
      life.events.map((event) => [event.year, event.kind, event.text]);
    expect(shape(fromBruno)).toEqual(shape(fromAna));
    expect(fromBruno.horizonYears).toBe(fromAna.horizonYears);
    expect(fromBruno.ending).toEqual(fromAna.ending);
  });

  it("AC-4 · per-beat degradation: one failed beat or total outage still resolves", async () => {
    const rankedDeps = () =>
      depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], fixedSentenceLlm());

    const failOneBeat = countingLlm({
      generate(request) {
        if (request.id === "timeline.narrate.beat.0") {
          return Promise.reject(new Error("beat 0 unavailable"));
        }
        return fixedSentenceLlm().generate(request);
      },
    });
    const partial = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      { ...rankedDeps(), narrator: createTimelineNarrator(failOneBeat) }
    );
    expect(partial).not.toBeNull();
    if (partial === null || partial.lens === "friendship") {
      throw new Error("expected paired timeline");
    }
    expect(partial.events.length).toBeGreaterThan(0);
    expect(partial.events.every((event) => event.text.length > 0)).toBe(true);
    expect(partial.events[0].text).not.toBe(FIXED_SENTENCE);

    const failAll = countingLlm({
      generate() {
        return Promise.reject(new Error("model unavailable"));
      },
    });
    const deterministic = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      { ...rankedDeps(), narrator: createTimelineNarrator(failAll) }
    );
    expect(deterministic).not.toBeNull();
    if (deterministic === null || deterministic.lens === "friendship") {
      throw new Error("expected paired timeline");
    }
    expect(deterministic.events.length).toBeGreaterThan(0);
    expect(deterministic.events.every((event) => event.text.length > 0)).toBe(
      true
    );
    expect(failAll.generateCalls.length).toBeGreaterThan(0);
  });

  it("AC-5 · friendship: no duration claim and no survival language in prose", async () => {
    const llm = fixedSentenceLlm();
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm);

    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "friendship" },
      deps
    );

    expect(life).not.toBeNull();
    if (life === null) throw new Error("expected friendship timeline");
    expect(life.lens).toBe("friendship");
    expect("horizonYears" in life).toBe(false);
    expect("ending" in life).toBe(false);

    if (life.lens !== "friendship") {
      throw new Error("expected friendship branch");
    }

    const readHorizon = (friendship: FriendshipTimeline) =>
      // @ts-expect-error -- PILLARS §6.1: friendship makes no duration claim.
      friendship.horizonYears;
    expect(readHorizon(life)).toBeUndefined();

    const readEnding = (friendship: FriendshipTimeline) =>
      // @ts-expect-error -- friendship carries no ending union branch.
      friendship.ending;
    expect(readEnding(life)).toBeUndefined();

    for (const event of life.events) {
      expect(scanBanned(event.text)).toEqual([]);
      expect(scanSurvivalClaims(event.text)).toEqual([]);
    }
  });

  it("AC-1 (#34) · the second viewer is served from cache with per-viewer projection", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const cache = pairSimulationsFake();
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm, cache);

    const first = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    const callsAfterFirst = llm.generateCalls.length;
    expect(first).not.toBeNull();

    const second = await simulatePair(
      { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
      deps
    );
    expect(llm.generateCalls.length).toBe(callsAfterFirst);
    expect(cache.rows.size).toBe(1);
    const row = [...cache.rows.values()][0];
    expect(row.participantLo).toBe(ANA);
    expect(row.participantHi).toBe(BRUNO);
    expect(second).not.toBeNull();
    if (first === null || second === null || first.lens === "friendship") {
      throw new Error("expected paired timelines");
    }
    if (second.lens === "friendship") {
      throw new Error("expected paired timelines");
    }
    expect(second.events).toEqual(first.events);
    expect(second.horizonYears).toBe(first.horizonYears);
    expect(second.ending).toEqual(first.ending);
    expect(first.subject.id).toBe(ANA);
    expect(first.other.id).toBe(BRUNO);
    expect(second.subject.id).toBe(BRUNO);
    expect(second.other.id).toBe(ANA);
  });

  it("AC-2 (#34) · superseded posteriors invalidate the cache and replace the row", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const cache = pairSimulationsFake();
    const latents = latentsFake(LATENTS);
    const deps: SimulatePairDeps = {
      ...depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm, cache),
      latents,
    };

    await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    const callsAfterFirst = llm.generateCalls.length;

    await latents.replaceForParticipant(
      ANA,
      PILLARS.map((pillar) => ({
        pillar,
        mean: 0.61,
        se: 0.11,
        scorerVersion: "map-luce-v1",
        computedAt: new Date(SCORED_AT.getTime() + 60_000),
      }))
    );

    await simulatePair(
      { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
      deps
    );
    expect(llm.generateCalls.length).toBeGreaterThan(callsAfterFirst);
    expect(cache.rows.size).toBe(1);
    const row = [...cache.rows.values()][0];
    expect(row.loComputedAt.getTime()).toBeGreaterThan(SCORED_AT.getTime());
  });

  it("AC-3 (#34) · withdrawn consent returns null and never regenerates", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const cache = pairSimulationsFake();
    const rows = AC1_ROOM.map((row) => ({ ...row }));
    const deps = depsFor(rows, LATENTS, [ANA, BRUNO], llm, cache);

    await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    const callsAfterWarm = llm.generateCalls.length;

    const anaIndex = rows.findIndex((r) => r.participant.id === ANA);
    rows[anaIndex] = {
      ...rows[anaIndex],
      participant: {
        ...rows[anaIndex].participant,
        consent: { ...ALL_LENSES, romantic: false },
      },
    };

    const withdrawn = await simulatePair(
      { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
      depsFor(rows, LATENTS, [BRUNO], llm, cache)
    );
    expect(withdrawn).toBeNull();
    expect(llm.generateCalls.length).toBe(callsAfterWarm);

    rows[anaIndex] = {
      ...rows[anaIndex],
      participant: {
        ...rows[anaIndex].participant,
        consent: ALL_LENSES,
        // Null bands no longer fail the floor (D20); a missing identity does.
        gender: null,
        birthdate: null,
      },
    };
    expect(
      await simulatePair(
        { subjectId: BRUNO, otherId: ANA, lens: "romantic" },
        depsFor(rows, LATENTS, [BRUNO], llm, cache)
      )
    ).toBeNull();
    expect(llm.generateCalls.length).toBe(callsAfterWarm);
  });

  it("AC-4 (#34) · a third viewer cannot read a cached pair life", async () => {
    const llm = countingLlm(fixedSentenceLlm());
    const cache = pairSimulationsFake();
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO, CARLA], llm, cache);

    await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    const callsAfterWarm = llm.generateCalls.length;

    const blocked = await simulatePair(
      { subjectId: CARLA, otherId: ANA, lens: "romantic" },
      deps
    );
    expect(blocked).toBeNull();
    expect(llm.generateCalls.length).toBe(callsAfterWarm);
  });

  it("a missing posterior is refused BEFORE the narrator is asked for a single beat", async () => {
    /*
     * The 33-second 404.
     *
     * `simulatePair` requires both sides to hold a posterior -- `computedAt`
     * is the cache's freshness seal, and there is nothing to seal a row with
     * when one side was never scored. That check used to sit AFTER
     * `generateTimeline`, so the viewer waited out a full live narration
     * (~33s, docs/domain.md D19) and was then handed `null`, which
     * `/simulate/[id]` renders as `notFound()`. Nothing generation produces
     * could ever have changed the outcome.
     *
     * Counting NARRATOR calls rather than the result: `null` came back before
     * the fix too. What the fix changed is how much is spent reaching it.
     */
    const narrator = countingNarrator();
    const deps = {
      // Ana is scored, Bruno is not -- the exact shape of a room where one
      // person finished the quiz and nobody ever turned it into posteriors.
      ...depsFor(
        AC1_ROOM,
        { [ANA]: LATENTS[ANA] },
        [ANA, BRUNO],
        countingLlm(fixedSentenceLlm())
      ),
      narrator,
    };

    const life = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );

    expect(life).toBeNull();
    expect(narrator.narrateCalls).toBe(0);
    expect(narrator.nominateCalls).toBe(0);
  });

  it("still serves a fresh cache hit, with the hoisted posterior reads as the seal", async () => {
    // The freshness comparison moved from two reads inside `freshnessMatches`
    // to the two reads taken above the cache branch. Same rows, same seal:
    // a warm pair must still come back without narrating anything again.
    const llm = countingLlm(fixedSentenceLlm());
    const cache = pairSimulationsFake();
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA, BRUNO], llm, cache);

    const first = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      deps
    );
    expect(first).not.toBeNull();
    const callsAfterWarm = llm.generateCalls.length;
    expect(callsAfterWarm).toBeGreaterThan(0);

    const narrator = countingNarrator();
    const again = await simulatePair(
      { subjectId: ANA, otherId: BRUNO, lens: "romantic" },
      { ...deps, narrator }
    );

    expect(again).toEqual(first);
    expect(narrator.narrateCalls).toBe(0);
  });
});

describe("SimulatedLife friendship branch (AC-5 type pin)", () => {
  it("refuses horizon and ending on the friendship branch at compile time", () => {
    const probe = (life: SimulatedLife) => {
      if (life.lens !== "friendship") return;
      const readHorizon = () =>
        // @ts-expect-error -- absent by construction, not nullable.
        life.horizonYears;
      const readEnding = () =>
        // @ts-expect-error -- absent by construction, not nullable.
        life.ending;
      expect(readHorizon()).toBeUndefined();
      expect(readEnding()).toBeUndefined();
    };
    probe({
      lens: "friendship",
      subject: { id: ANA, name: "Ana", avatar: "avatar3", photoUrl: null },
      other: { id: BRUNO, name: "Bruno", photoUrl: null, avatar: "avatar1" },
      events: [],
    });
  });
});
