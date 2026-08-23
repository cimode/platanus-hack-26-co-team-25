import { describe, expect, it, vi } from "vitest";
import type { Person } from "../domain/matching/engine";
import { rankRoom, TERM_LABELS } from "../domain/matching/engine";
import { toPerson } from "../domain/matching/to-person";
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
  RoomMember,
} from "../domain/participant";
import { floorReason, meetsFloor } from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz";
import { INSTRUMENT, PILLARS } from "../domain/quiz";
import type {
  LatentPosteriors,
  StoredLatent,
} from "../ports/latent-repository";
import type { Room } from "../ports/room-repository";
import type { PrepareResultsDeps } from "./prepare-results";
import { prepareResults } from "./prepare-results";
import type {
  ScoreParticipantInput,
  ScoreParticipantResult,
} from "./score-participant";

/**
 * `prepareResults(subjectId, lens, deps)` (issue #10, docs/domain.md §0, §5,
 * §6, D13): reports the subject's own floor outcome ("not-consented" /
 * "below-floor") from their OWN rankable row, scores them through #30 when
 * their posterior is missing or stale, reads the room through
 * `byRoomForRanking(roomId, lens)` -- the repository applies the full §0 floor,
 * and this use case re-checks every row it gets back as defence in depth --
 * computes 30-minute cohorts, maps each row with `toPerson`, ranks with
 * `rankRoom(people, subjectId, lens)` and projects to `RankEntry[]`.
 *
 * It returns `RankedRoom` (src/lib/domain/reveal/rank.ts) and therefore
 * structurally satisfies `RankingPort.forSubject` (src/lib/ports/ranking.ts),
 * so composition swaps the fixture adapter for it in one line. The subject
 * arrives as a resolved `ViewerId` -- this use case reads no cookie.
 *
 * What an entry may carry is the safety property under test here. `bond` is
 * `{ term, label }` and `position` is 1-based, never a score, a rank float, a
 * sim value or a flags object: a latent driver's score is
 * `softMin(la.mean, lb.mean)` (engine.ts:633) and is therefore invertible to
 * the OTHER participant's posterior by a subject who knows their own -- it is
 * their own avatar. `RankBand` has no "low": low-band pairs are ABSENT, exactly
 * like below-floor people, because a greyed third pill discloses who was
 * excluded. Both are asserted positively below, not left to the type.
 *
 * Every fixture is the landed NESTED `RankableParticipant`
 * (src/lib/domain/participant/floor.ts): `{ participant, romanticGate?,
 * businessGate?, acquaintances }`. The flat stand-in this file used to declare
 * is gone, and the floor is the real `meetsFloor` / `floorReason`.
 *
 * Every fake is declared inline here -- no shared fake module, no adapter
 * import, so the biome.json hexagon rule holds -- and no test touches a
 * database. `toPerson` is wrapped in a counting spy that delegates to the real
 * mapper, so AC-4 can assert it is never REACHED for a below-floor row.
 */

/**
 * The counting spy. It delegates to the REAL mapper, so nothing about the
 * mapping changes; it only records which rows reached it. This is what lets
 * AC-4 assert that a below-floor row is dropped BEFORE `toPerson` rather than
 * by `toPerson` throwing -- and it requires `prepareResults` to call the
 * exported `toPerson` from this module, never a local copy of the mapping.
 */
const spy = vi.hoisted(() => ({ mappedIds: [] as string[] }));

vi.mock("../domain/matching/to-person", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../domain/matching/to-person")>();
  return {
    ...actual,
    toPerson(...args: Parameters<typeof actual.toPerson>) {
      spy.mappedIds.push(args[0].participant.id);
      return actual.toPerson(...args);
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROOM_ID: RoomId = "33333333-3333-7333-8333-333333333333";
const CREATED_AT = new Date("2026-08-22T18:00:00.000Z");
const DECLARED_AT = new Date("2026-08-22T18:40:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T18:50:00.000Z");
/** The earliest completion in the room: cohort 0 is measured from here. */
const T0 = new Date("2026-08-22T19:00:00.000Z");
const SCORED_AT = new Date("2026-08-22T19:05:00.000Z");
const NOW = new Date("2026-08-22T20:00:00.000Z");
const MINUTE = 60_000;

const LENSES: readonly Lens[] = ["romantic", "business", "friendship"];
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

/** The six declared bands, all present -- what a floor-passing row looks like. */
const BANDS = {
  moneyPosture: 2,
  rootedness: 2,
  familyGravity: 1,
  capacityHoursBand: 2,
  distanceBand: 1,
  chronotype: 1,
} as const;

/** The abandoned row: declared_at null and every band null (docs/domain.md §0). */
const NO_BANDS = {
  moneyPosture: null,
  rootedness: null,
  familyGravity: null,
  capacityHoursBand: null,
  distanceBand: null,
  chronotype: null,
} as const;

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

/** A nested `RankableParticipant`, floor-passing under every lens by default. */
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
      photoUrl: `https://blob.example/${id}.jpg`,
      team: null,
      track: null,
      consent: ALL_LENSES,
      dataConsentAt: null,
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

// --- The AC-1 room: four participants, all above the friendship floor -------

const ANA = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
const CARLA = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
const DARIO = "dddddddd-dddd-7ddd-8ddd-dddddddddddd";

const ROW_ANA = rankable(ANA, "Ana", {
  participant: { team: "alpha", quizCompletedAt: T0 },
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
    quizCompletedAt: new Date(T0.getTime() + 10 * MINUTE),
  },
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
    quizCompletedAt: new Date(T0.getTime() + 40 * MINUTE),
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
  // No completion timestamp: cohort undefined (§6), and nothing to bucket.
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

/**
 * The same four as the engine's `Person`, written out rather than mapped: this
 * is the criterion's independent statement of docs/domain.md §6, so a
 * `toPerson` that divided the capacity band or fabricated a missing latent
 * would move `rankRoom`'s order away from what these literals produce.
 *
 * Cohorts are the 30-minute windows from the earliest completion in the room
 * (Ana's): Bruno +10min ⇒ 0, Carla +40min ⇒ 1, Dario null ⇒ undefined.
 */
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

const AC1_PEOPLE: Person[] = [
  {
    id: ANA,
    name: "Ana",
    latents: LATENTS[ANA],
    declared: {
      distanceBand: 1,
      lifeShape: {
        moneyPosture: 1,
        rootedness: 1,
        familyGravity: 0,
        capacityHoursBand: 2,
      },
      tags: ["escalada", "ramen", "podcasts"],
      chronotype: 1,
    },
    structural: { team: "alpha", cohort: 0, acquaintances: [] },
    gates: {},
    consent: ALL_LENSES,
    hasPhoto: true,
  },
  {
    id: BRUNO,
    name: "Bruno",
    latents: LATENTS[BRUNO],
    declared: {
      distanceBand: 1,
      lifeShape: {
        moneyPosture: 1,
        rootedness: 1,
        familyGravity: 0,
        capacityHoursBand: 2,
      },
      tags: ["escalada", "ramen", "ajedrez"],
      chronotype: 1,
    },
    structural: { team: "alpha", cohort: 0, acquaintances: [ANA] },
    gates: {},
    consent: ALL_LENSES,
    hasPhoto: true,
  },
  {
    id: CARLA,
    name: "Carla",
    latents: LATENTS[CARLA],
    declared: {
      distanceBand: 3,
      lifeShape: {
        moneyPosture: 0,
        rootedness: 0,
        familyGravity: 1,
        capacityHoursBand: 0,
      },
      tags: ["perros"],
      chronotype: 3,
    },
    structural: { team: "beta", cohort: 1, acquaintances: [] },
    gates: {},
    consent: ALL_LENSES,
    hasPhoto: true,
  },
  {
    id: DARIO,
    name: "Dario",
    latents: LATENTS[DARIO],
    declared: {
      distanceBand: 2,
      lifeShape: {
        moneyPosture: 1,
        rootedness: 1 / 3,
        familyGravity: 0,
        capacityHoursBand: 1,
      },
      tags: ["ramen", "podcasts"],
      chronotype: 1,
    },
    structural: { cohort: undefined, acquaintances: [] },
    gates: {},
    consent: ALL_LENSES,
    hasPhoto: true,
  },
];

// --- The AC-4 room: one rankable peer and three below the floor -------------

const SUBJECT = "11111111-1111-7111-8111-111111111111";
const RANKABLE = "22222222-2222-7222-8222-222222222222";
const ABANDONED = "44444444-4444-7444-8444-444444444444";
const NO_PHOTO = "55555555-5555-7555-8555-555555555555";
const DECLINER = "66666666-6666-7666-8666-666666666666";

const ROW_SUBJECT = rankable(SUBJECT, "Sofia", {
  romanticGate: SUBJECT_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_RANKABLE = rankable(RANKABLE, "Rafa", {
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_ABANDONED = rankable(ABANDONED, "Abel", {
  participant: { declaredAt: null, quizCompletedAt: null },
  declared: NO_BANDS,
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
const ROW_NO_PHOTO = rankable(NO_PHOTO, "Nadia", {
  participant: { photoUrl: null },
  romanticGate: MUTUAL_ROMANTIC,
  businessGate: BUSINESS,
});
// All three consent flags false, and therefore no gate row: nobody is asked
// for a gate on a lens they declined (D5).
const ROW_DECLINER = rankable(DECLINER, "Diego", {
  participant: { consent: NO_LENSES },
});

const AC4_ROOM = [
  ROW_SUBJECT,
  ROW_RANKABLE,
  ROW_ABANDONED,
  ROW_NO_PHOTO,
  ROW_DECLINER,
];

// ---------------------------------------------------------------------------
// Fakes -- inline, in-memory, recording every call
// ---------------------------------------------------------------------------

interface ParticipantsFake {
  readonly rankingReads: Array<{ roomId: RoomId; lens: Lens }>;
  readonly idReads: ParticipantId[];
  readonly memberReads: RoomId[];
  byIdForRanking(id: ParticipantId): Promise<RankableParticipant | null>;
  byRoomForRanking(roomId: RoomId, lens: Lens): Promise<RankableParticipant[]>;
  byRoom(roomId: RoomId): Promise<RoomMember[]>;
}

/**
 * The strict fake applies the REAL `meetsFloor` inside `byRoomForRanking`, as
 * the adapter does. The default is deliberately permissive -- it ignores the
 * lens and returns every row -- so a criterion can prove the use case drops
 * below-floor rows on its own.
 */
function participantsFake(
  rows: RankableParticipant[],
  floor: (p: RankableParticipant, lens: Lens) => boolean = () => true
): ParticipantsFake {
  const rankingReads: Array<{ roomId: RoomId; lens: Lens }> = [];
  const idReads: ParticipantId[] = [];
  const memberReads: RoomId[] = [];
  return {
    rankingReads,
    idReads,
    memberReads,
    byIdForRanking(id) {
      idReads.push(id);
      const found = rows.find((r) => r.participant.id === id);
      return Promise.resolve(found ?? null);
    },
    byRoomForRanking(roomId, lens) {
      rankingReads.push({ roomId, lens });
      return Promise.resolve(
        rows.filter((r) => r.participant.roomId === roomId && floor(r, lens))
      );
    },
    byRoom(roomId) {
      memberReads.push(roomId);
      return Promise.resolve(
        rows
          .filter((r) => r.participant.roomId === roomId)
          .map(({ participant }) => ({
            id: participant.id,
            name: participant.name,
            photoUrl: participant.photoUrl,
          }))
      );
    },
  };
}

interface LatentsFake {
  readonly writes: Array<{ id: ParticipantId; rows: StoredLatent[] }>;
  byParticipants(
    ids: readonly ParticipantId[]
  ): Promise<ReadonlyMap<ParticipantId, LatentPosteriors>>;
  computedAtFor(id: ParticipantId): Promise<Date | null>;
  replaceForParticipant(
    id: ParticipantId,
    rows: readonly StoredLatent[]
  ): Promise<void>;
  rowsFor(id: ParticipantId): StoredLatent[];
}

/** Seeded rows, plus whatever the scorer fake writes during a test. */
function latentsFake(
  seed: Record<string, LatentPosteriors> = {},
  computedAt: Date = SCORED_AT
): LatentsFake {
  const store = new Map<ParticipantId, StoredLatent[]>();
  for (const [id, posteriors] of Object.entries(seed)) {
    store.set(
      id,
      Object.entries(posteriors).map(([pillar, estimate]) => ({
        pillar: pillar as StoredLatent["pillar"],
        mean: estimate.mean,
        se: estimate.se ?? 0.1,
        scorerVersion: "map-luce-v1",
        computedAt,
      }))
    );
  }
  const writes: Array<{ id: ParticipantId; rows: StoredLatent[] }> = [];

  function read(id: ParticipantId): LatentPosteriors {
    const posteriors: LatentPosteriors = {};
    for (const row of store.get(id) ?? []) {
      posteriors[row.pillar] = { mean: row.mean, se: row.se };
    }
    return posteriors;
  }

  return {
    writes,
    byParticipants(ids) {
      const map = new Map<ParticipantId, LatentPosteriors>();
      for (const id of ids) {
        const posteriors = read(id);
        if (Object.keys(posteriors).length > 0) map.set(id, posteriors);
      }
      return Promise.resolve(map);
    },
    computedAtFor(id) {
      const rows = store.get(id) ?? [];
      if (rows.length === 0) return Promise.resolve(null);
      return Promise.resolve(
        new Date(Math.max(...rows.map((r) => r.computedAt.getTime())))
      );
    },
    replaceForParticipant(id, rows) {
      writes.push({ id, rows: [...rows] });
      const byPillar = new Map<string, StoredLatent>();
      for (const existing of store.get(id) ?? []) {
        byPillar.set(existing.pillar, existing);
      }
      for (const row of rows) byPillar.set(row.pillar, row);
      store.set(id, [...byPillar.values()]);
      return Promise.resolve();
    },
    rowsFor(id) {
      return [...(store.get(id) ?? [])];
    },
  };
}

interface ResponsesFake {
  readonly calls: ParticipantId[];
  byParticipant(id: ParticipantId): Promise<BlockResponse[]>;
  /** A late edit: the re-answer that makes a stored posterior stale. */
  reanswer(id: ParticipantId, position: number, answeredAt: Date): void;
}

const KEYS: readonly OptionKey[] = ["a", "b", "c", "d"];

/** Fifteen answered blocks, all at `answeredAt`. */
function answers(participantId: ParticipantId, at: Date): BlockResponse[] {
  return Array.from({ length: 15 }, (_, index) => ({
    participantId,
    position: index + 1,
    mostKey: KEYS[index % 4],
    leastKey: KEYS[(index + 1) % 4],
    shownOrder: "abcd",
    answeredAt: at,
  }));
}

function responsesFake(
  rows: Record<string, BlockResponse[]> = {}
): ResponsesFake {
  const store = new Map<ParticipantId, BlockResponse[]>(Object.entries(rows));
  const calls: ParticipantId[] = [];
  return {
    calls,
    byParticipant(id) {
      calls.push(id);
      return Promise.resolve([...(store.get(id) ?? [])]);
    },
    reanswer(id, position, answeredAt) {
      const held = store.get(id) ?? [];
      store.set(
        id,
        held.map((r) => (r.position === position ? { ...r, answeredAt } : r))
      );
    },
  };
}

interface ScorerFake {
  readonly calls: ScoreParticipantInput[];
  readonly results: ScoreParticipantResult[];
  scoreParticipant(
    input: ScoreParticipantInput
  ): Promise<ScoreParticipantResult>;
}

/** Posteriors the fake scorer writes -- means in 0..1, se strictly positive. */
const SCORED: Record<string, { mean: number; se: number }> = {
  regulation: { mean: 0.62, se: 0.11 },
  politeness: { mean: 0.55, se: 0.11 },
  reliability: { mean: 0.6, se: 0.11 },
  agency: { mean: 0.48, se: 0.11 },
};

/**
 * #30's `scoreParticipant`, counted. It reproduces the one behaviour this use
 * case depends on -- the completion gate returns
 * `{ scored: false, reason: "quiz-incomplete" }` having written NOTHING (#30
 * AC-13) -- and otherwise writes the four rows through the latent fake.
 */
function scorerFake(latents: LatentsFake, clock: () => Date): ScorerFake {
  const calls: ScoreParticipantInput[] = [];
  const results: ScoreParticipantResult[] = [];
  return {
    calls,
    results,
    async scoreParticipant(input) {
      calls.push(input);
      if (input.quizCompletedAt === null) {
        const refused: ScoreParticipantResult = {
          scored: false,
          reason: "quiz-incomplete",
        };
        results.push(refused);
        return refused;
      }
      const computedAt = clock();
      await latents.replaceForParticipant(
        input.participantId,
        PILLARS.map((pillar) => ({
          pillar,
          mean: SCORED[pillar].mean,
          se: SCORED[pillar].se,
          scorerVersion: "map-luce-v1",
          computedAt,
        }))
      );
      const scored: ScoreParticipantResult = {
        scored: true,
        responsesUsed: 15,
      };
      results.push(scored);
      return scored;
    },
  };
}

function roomsFake() {
  const calls: RoomId[] = [];
  return {
    calls,
    byId(id: RoomId): Promise<Room | null> {
      calls.push(id);
      return Promise.resolve(id === ROOM_ID ? ROOM : null);
    },
  };
}

function depsWith(
  participants: ParticipantsFake,
  latents: LatentsFake,
  responses: ResponsesFake,
  scorer: ScorerFake
): PrepareResultsDeps {
  return {
    participants,
    latents,
    responses,
    rooms: roomsFake(),
    scoreParticipant: scorer.scoreParticipant,
  };
}

describe("prepareResults", () => {
  it('AC-1 · ranks the room under friendship: status "ranked", the viewer, entries in rankRoom order with 1-based positions, no "low" band and no number, one byRoomForRanking call and no byRoom', async () => {
    const participants = participantsFake(AC1_ROOM, meetsFloor);
    const latents = latentsFake(LATENTS);
    const responses = responsesFake({ [ANA]: answers(ANA, ANSWERED_AT) });
    const scorer = scorerFake(latents, () => NOW);

    // The fixture's own precondition, asserted before the use case is reached:
    // the engine bands one of these three low, so "low entries are dropped"
    // below is a real assertion and not a vacuous one over a room that happens
    // to contain no low pair.
    const ranked = rankRoom(AC1_PEOPLE, ANA, "friendship");
    expect(ranked.map((e) => e.band)).toContain("low");
    const visible = ranked.filter((e) => e.band !== "low");
    expect(visible.length).toBeGreaterThan(1);

    const result = await prepareResults(
      ANA,
      "friendship",
      depsWith(participants, latents, responses, scorer)
    );

    if (result.status !== "ranked") {
      throw new Error(`expected a ranked room, got "${result.status}"`);
    }
    expect(result.lens).toBe("friendship");
    expect(result.viewer).toEqual({ id: ANA, name: "Ana" });

    // Ordered as rankRoom returns them (rank descending, id ascending on
    // ties), with the low-band pair absent rather than greyed.
    expect(result.entries.map((e) => e.id)).toEqual(visible.map((e) => e.id));
    expect(result.entries.map((e) => e.id)).not.toContain(ANA);
    const droppedIds = ranked.filter((e) => e.band === "low").map((e) => e.id);
    for (const id of droppedIds) {
      expect(result.entries.map((e) => e.id)).not.toContain(id);
    }

    // 1-based and CONTIGUOUS from 1: a gap in the numbering would disclose
    // that somebody was excluded, which is what dropping them exists to avoid.
    expect(result.entries.map((e) => e.position)).toEqual(
      result.entries.map((_, index) => index + 1)
    );

    // The engine's frozen cutoffs, never re-banded in-room (AUDIT.md S14).
    expect(result.entries.map((e) => e.band)).toEqual(
      visible.map((e) => e.band)
    );

    for (const [index, entry] of result.entries.entries()) {
      expect(["high", "mid"]).toContain(entry.band);
      expect(entry.name).toBe(visible[index].name);
      expect(entry.photoUrl).toBe(`https://blob.example/${entry.id}.jpg`);

      // `bond` is the top driver as { term, label } -- the NAME of the term
      // and nothing else. Its score, weight and contribution stay in the
      // engine, because a latent driver's score is softMin(la.mean, lb.mean)
      // and inverts to the other participant's posterior.
      expect(Object.keys(entry.bond).sort()).toEqual(["label", "term"]);
      expect(entry.bond.term).toBe(visible[index].drivers[0].term);
      expect(Object.keys(TERM_LABELS)).toContain(entry.bond.term);
      expect(typeof entry.bond.label).toBe("string");
      expect(entry.bond.label.length).toBeGreaterThan(0);

      const friction = visible[index].friction;
      if (entry.friction === null) {
        expect(friction).toBeNull();
      } else {
        expect(Object.keys(entry.friction).sort()).toEqual(["label", "term"]);
        expect(entry.friction.term).toBe(friction?.term);
        expect(typeof entry.friction.label).toBe("string");
      }

      // Positively: these are ALL the fields an entry has.
      expect(Object.keys(entry).sort()).toEqual([
        "band",
        "bond",
        "friction",
        "id",
        "name",
        "photoUrl",
        "position",
      ]);
      for (const forbidden of [
        "rank",
        "sim",
        "score",
        "scores",
        "weight",
        "contribution",
        "shortfall",
        "drivers",
        "flags",
        "eligible",
        "reason",
        "member",
      ]) {
        expect(forbidden in entry).toBe(false);
      }
      // The only number on an entry is its position.
      const numbers = Object.entries(entry)
        .filter(([, value]) => typeof value === "number")
        .map(([key]) => key);
      expect(numbers).toEqual(["position"]);
    }

    // Nothing anywhere in the payload is a decimal: no serialiser, no RSC
    // payload and no dev-tools inspection can recover a posterior from it.
    expect(JSON.stringify(result)).not.toMatch(/\d\.\d/);

    expect(participants.rankingReads).toEqual([
      { roomId: ROOM_ID, lens: "friendship" },
    ]);
    expect(participants.memberReads).toEqual([]);
  });

  it("AC-3 · scores a subject with no latent rows exactly once across two calls, returns the same ordered entries, and re-scores only when a response is newer than the stored computedAt", async () => {
    const room = [ROW_ANA, ROW_BRUNO, ROW_DARIO];
    // The subject holds no rows; the other two already do.
    const latents = latentsFake({
      [BRUNO]: LATENTS[BRUNO],
      [DARIO]: LATENTS[DARIO],
    });
    const responses = responsesFake({ [ANA]: answers(ANA, ANSWERED_AT) });
    let clock = NOW;
    const scorer = scorerFake(latents, () => clock);
    const deps = depsWith(
      participantsFake(room, meetsFloor),
      latents,
      responses,
      scorer
    );

    const first = await prepareResults(ANA, "friendship", deps);

    expect(scorer.calls).toHaveLength(1);
    expect(scorer.calls[0].participantId).toBe(ANA);
    const rows = latents.rowsFor(ANA);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.pillar).sort()).toEqual([...PILLARS].sort());
    for (const row of rows) {
      expect(row.mean).toBeGreaterThan(0);
      expect(row.mean).toBeLessThan(1);
      expect(row.se).toBeGreaterThan(0);
    }
    const othersBefore = {
      bruno: latents.rowsFor(BRUNO),
      dario: latents.rowsFor(DARIO),
    };

    const second = await prepareResults(ANA, "friendship", deps);

    // A fresh posterior is read, never recomputed.
    expect(scorer.calls).toHaveLength(1);
    expect(second).toEqual(first);

    // A response answered AFTER the stored computed_at is a stale posterior:
    // nothing else in the system re-scores, so it would stand forever.
    const late = new Date(NOW.getTime() + 10 * MINUTE);
    responses.reanswer(ANA, 3, late);
    clock = new Date(NOW.getTime() + 20 * MINUTE);

    const third = await prepareResults(ANA, "friendship", deps);

    expect(scorer.calls).toHaveLength(2);
    if (third.status !== "ranked") {
      throw new Error(`expected a ranked room, got "${third.status}"`);
    }

    // Only the subject is ever written: the other two rows are untouched
    // throughout, in count, value and computed_at.
    expect(latents.writes.map((w) => w.id)).toEqual([ANA, ANA]);
    expect(latents.rowsFor(BRUNO)).toEqual(othersBefore.bruno);
    expect(latents.rowsFor(DARIO)).toEqual(othersBefore.dario);
  });

  // kind: safety -- NEVER skipped. Below the §0 floor is suppressed, never
  // ranked (docs/domain.md §0 / §5, AUDIT.md S15). The fixture assertions and
  // the `toPerson` throw hold today; the scenario follows, so the floor is
  // asserted first even while the use case is red.
  it("AC-4 · the abandoned, no-photo and declining participants are never ranked under any lens", async () => {
    // Each below-floor row fails on its OWN stated field under every lens, so
    // none of them could be dropped by a gate mismatch instead -- which would
    // make this criterion pass for the wrong reason.
    for (const lens of LENSES) {
      expect(floorReason(ROW_ABANDONED, lens)).toBe("declared-incomplete");
      expect(floorReason(ROW_NO_PHOTO, lens)).toBe("no-photo");
      expect(floorReason(ROW_DECLINER, lens)).toBe("no-consent");
      // ... while the subject and the one rankable peer clear it under all three.
      expect(floorReason(ROW_SUBJECT, lens)).toBeNull();
      expect(floorReason(ROW_RANKABLE, lens)).toBeNull();
    }
    expect(ROW_ABANDONED.participant.declaredAt).toBeNull();
    expect(Object.values(NO_BANDS)).toEqual(Array(6).fill(null));
    expect(ROW_NO_PHOTO.participant.photoUrl).toBeNull();
    expect(ROW_DECLINER.romanticGate).toBeUndefined();
    expect(ROW_DECLINER.businessGate).toBeUndefined();
    // The peer's gates are mutual with the subject's under every lens.
    expect(MUTUAL_ROMANTIC.interestedIn).toContain(SUBJECT_ROMANTIC.gender);
    expect(SUBJECT_ROMANTIC.interestedIn).toContain(MUTUAL_ROMANTIC.gender);
    expect(ROW_RANKABLE.businessGate).toEqual(ROW_SUBJECT.businessGate);

    // The second guard behind the floor: the abandoned row can never become a
    // Person, so a caller that skipped the floor gets an Error, not a ranking
    // over fabricated zeros or the NaN that bandOf() labels "high".
    expect(() => toPerson(ROW_ABANDONED, {}, undefined)).toThrow();

    for (const lens of LENSES) {
      const participants = participantsFake(AC4_ROOM, meetsFloor);
      const latents = latentsFake();
      const responses = responsesFake({
        [SUBJECT]: answers(SUBJECT, ANSWERED_AT),
      });
      const scorer = scorerFake(latents, () => NOW);

      const result = await prepareResults(
        SUBJECT,
        lens,
        depsWith(participants, latents, responses, scorer)
      );

      if (result.status !== "ranked") {
        throw new Error(
          `expected a ranked room under "${lens}", got "${result.status}"`
        );
      }
      expect(result.entries.map((e) => e.id)).toEqual([RANKABLE]);
    }

    // The same room behind a deliberately permissive repository that ignores
    // the lens and returns every row: the use case's own re-check drops the
    // three below-floor rows BEFORE they can be mapped, so `toPerson` is
    // reached for the subject and the one rankable peer and nobody else.
    spy.mappedIds.length = 0;
    const permissive = participantsFake(AC4_ROOM);
    const latents = latentsFake();
    const responses = responsesFake({
      [SUBJECT]: answers(SUBJECT, ANSWERED_AT),
    });
    const scorer = scorerFake(latents, () => NOW);

    const result = await prepareResults(
      SUBJECT,
      "friendship",
      depsWith(permissive, latents, responses, scorer)
    );

    if (result.status !== "ranked") {
      throw new Error(`expected a ranked room, got "${result.status}"`);
    }
    expect(result.entries.map((e) => e.id)).toEqual([RANKABLE]);
    expect([...new Set(spy.mappedIds)].sort()).toEqual(
      [SUBJECT, RANKABLE].sort()
    );
  });

  it('AC-5 · a decliner gets { status: "not-consented" } and a no-photo participant { status: "below-floor" }, each carrying no viewer, no entries and no other participant, with byRoomForRanking never called and zero latent writes', async () => {
    const participants = participantsFake(AC4_ROOM, meetsFloor);
    const latents = latentsFake();
    const responses = responsesFake();
    const scorer = scorerFake(latents, () => NOW);
    const deps = depsWith(participants, latents, responses, scorer);

    const declined = await prepareResults(DECLINER, "romantic", deps);
    const noPhoto = await prepareResults(NO_PHOTO, "friendship", deps);

    // `toEqual` on the whole value, not a status check: an extra `viewer` or
    // an empty `entries` array would be another participant's data on a
    // screen that is not allowed to render one.
    expect(declined).toEqual({ status: "not-consented", lens: "romantic" });
    expect(noPhoto).toEqual({ status: "below-floor", lens: "friendship" });

    for (const suppressed of [declined, noPhoto]) {
      expect("viewer" in suppressed).toBe(false);
      expect("entries" in suppressed).toBe(false);
      const payload = JSON.stringify(suppressed);
      for (const row of AC4_ROOM) {
        expect(payload).not.toContain(row.participant.name);
        expect(payload).not.toContain(row.participant.id);
        if (row.participant.photoUrl !== null) {
          expect(payload).not.toContain(row.participant.photoUrl);
        }
      }
    }

    // The room is never read: a suppressed subject costs no query, and no row
    // that could leak is ever in memory.
    expect(participants.rankingReads).toEqual([]);
    expect(participants.memberReads).toEqual([]);
    expect(latents.writes).toEqual([]);
    expect(scorer.calls).toEqual([]);
  });

  it("AC-6 · a subject with quiz_completed_at null ranks the room but acquires no latent rows, so the absent row survives and the engine imputes the prior", async () => {
    const subject = rankable(ANA, "Ana", {
      participant: { team: "alpha", quizCompletedAt: null },
      declared: ROW_ANA.participant.declared,
    });
    const room = [subject, ROW_BRUNO, ROW_DARIO];
    const latents = latentsFake({
      [BRUNO]: LATENTS[BRUNO],
      [DARIO]: LATENTS[DARIO],
    });
    // Three blocks in and stopped: responses exist, completion does not.
    const responses = responsesFake({
      [ANA]: answers(ANA, ANSWERED_AT).slice(0, 3),
    });
    const scorer = scorerFake(latents, () => NOW);
    const deps = depsWith(
      participantsFake(room, meetsFloor),
      latents,
      responses,
      scorer
    );

    const first = await prepareResults(ANA, "friendship", deps);

    if (first.status !== "ranked") {
      throw new Error(`expected a ranked room, got "${first.status}"`);
    }
    expect(first.entries.map((e) => e.id).sort()).toEqual(
      [BRUNO, DARIO].sort()
    );

    // Either the use case never called the scorer, or it called it and #30's
    // completion gate refused -- never a fourth outcome.
    for (const result of scorer.results) {
      expect(result).toEqual({ scored: false, reason: "quiz-incomplete" });
    }

    // No rows for the subject: `bothMeasured` reads row PRESENCE, so four
    // near-prior rows fitted to a partly answered quiz would arm flags the
    // engine says must never fire at zero data (AUDIT.md S15).
    expect(latents.writes.filter((w) => w.id === ANA)).toEqual([]);
    expect(latents.rowsFor(ANA)).toEqual([]);
    expect(await latents.computedAtFor(ANA)).toBeNull();

    const second = await prepareResults(ANA, "friendship", deps);

    expect(second).toEqual(first);
    expect(latents.writes.filter((w) => w.id === ANA)).toEqual([]);
  });
});
