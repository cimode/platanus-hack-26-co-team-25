import { describe, expect, it } from "vitest";
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
import { floorReason, meetsFloor, TAGS } from "../domain/participant";
import type { BlockResponse, OptionKey } from "../domain/quiz";
import { INSTRUMENT, PILLARS } from "../domain/quiz";
import type {
  LatentPosteriors,
  StoredLatent,
} from "../ports/latent-repository";
import type { Room } from "../ports/room-repository";
import { prepareProfile } from "./prepare-profile";
import type { PrepareResultsDeps } from "./prepare-results";
import { prepareResults } from "./prepare-results";
import type {
  ScoreParticipantInput,
  ScoreParticipantResult,
} from "./score-participant";

/**
 * `prepareProfile(personId, viewerId, lens, deps)` (issue #10, screen 1d):
 * returns `PersonProfile | null` and therefore structurally satisfies
 * `ProfilePort.byId` (src/lib/ports/profile.ts).
 *
 * It reuses `prepareResults`' machinery rather than duplicating it -- rank the
 * viewer's room, find the entry whose id is `personId`, project -- so
 * `standing` carries the SAME position, band, bond and friction the rank entry
 * carries. AC-7 asserts that by COMPARING the two calls rather than by
 * recomputing either: a parallel computation is exactly what would let the
 * pill on /rank and the pill on /profile drift apart.
 *
 * `tags` are the INTERSECTION of the two participants' tags, computed here, so
 * the screen cannot present the other person's private interests as common
 * ground. The slugs are the closed 30-word vocabulary
 * (domain/participant/tags.ts): "escalada" is the criterion's climbing,
 * "ajedrez" its chess and "podcasts" stands in for its jazz, which the
 * vocabulary does not offer.
 *
 * AC-8 is `kind: safety`. Six different unreachable reasons must return ONE
 * value, because the port's docblock states the four 404s are identical
 * BECAUSE the port makes them identical: anything distinguishable hands the
 * caller the fact that this person exists and opted out.
 *
 * Every fake is declared inline here -- no shared fake module, no adapter
 * import, so the biome.json hexagon rule holds -- and no test touches a
 * database.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROOM_ID: RoomId = "33333333-3333-7333-8333-333333333333";
const CREATED_AT = new Date("2026-08-22T18:00:00.000Z");
const DECLARED_AT = new Date("2026-08-22T18:40:00.000Z");
const ANSWERED_AT = new Date("2026-08-22T18:50:00.000Z");
const T0 = new Date("2026-08-22T19:00:00.000Z");
const SCORED_AT = new Date("2026-08-22T19:05:00.000Z");
const NOW = new Date("2026-08-22T20:00:00.000Z");
const MINUTE = 60_000;

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
/** Interested in M only: the subject is F, so this gate fails against hers. */
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
      photoUrl: `https://blob.example/${id}.jpg`,
      team: null,
      track: null,
      consent: ALL_LENSES,
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

// --- The AC-1 room, re-declared here: AC-7 profiles one of its members ------

const ANA = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const BRUNO = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";
const CARLA = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
const DARIO = "dddddddd-dddd-7ddd-8ddd-dddddddddddd";

/** The viewer. Tags: climbing, ramen and one the other does not share. */
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
/** P: the ranked participant AC-7 profiles. "ajedrez" is his alone. */
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

// --- The AC-4 room, plus the gate-mismatched row AC-8 needs -----------------

const SUBJECT = "11111111-1111-7111-8111-111111111111";
const RANKABLE = "22222222-2222-7222-8222-222222222222";
const ABANDONED = "44444444-4444-7444-8444-444444444444";
const NO_PHOTO = "55555555-5555-7555-8555-555555555555";
const DECLINER = "66666666-6666-7666-8666-666666666666";
const MISMATCH = "77777777-7777-7777-8777-777777777777";
/** In no room at all -- never registered, or in another room entirely. */
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
const ROW_DECLINER = rankable(DECLINER, "Diego", {
  participant: { consent: NO_LENSES },
});
/** Above the §0 floor under romantic; only the GATE fails against Sofia's. */
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

// ---------------------------------------------------------------------------
// Fakes -- inline, in-memory, recording every call
// ---------------------------------------------------------------------------

interface ParticipantsFake {
  readonly rankingReads: Array<{ roomId: RoomId; lens: Lens }>;
  readonly idReads: ParticipantId[];
  byIdForRanking(id: ParticipantId): Promise<RankableParticipant | null>;
  byRoomForRanking(roomId: RoomId, lens: Lens): Promise<RankableParticipant[]>;
}

function participantsFake(
  rows: RankableParticipant[],
  floor: (p: RankableParticipant, lens: Lens) => boolean = () => true
): ParticipantsFake {
  const rankingReads: Array<{ roomId: RoomId; lens: Lens }> = [];
  const idReads: ParticipantId[] = [];
  return {
    rankingReads,
    idReads,
    byIdForRanking(id) {
      idReads.push(id);
      return Promise.resolve(rows.find((r) => r.participant.id === id) ?? null);
    },
    byRoomForRanking(roomId, lens) {
      rankingReads.push({ roomId, lens });
      return Promise.resolve(
        rows.filter((r) => r.participant.roomId === roomId && floor(r, lens))
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
}

function latentsFake(seed: Record<string, LatentPosteriors> = {}): LatentsFake {
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

/** #30's scorer, counted; it refuses an incomplete quiz exactly as #30 does. */
function scorerFake(latents: LatentsFake) {
  const calls: ScoreParticipantInput[] = [];
  return {
    calls,
    async scoreParticipant(
      input: ScoreParticipantInput
    ): Promise<ScoreParticipantResult> {
      calls.push(input);
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

function depsFor(
  rows: RankableParticipant[],
  seed: Record<string, LatentPosteriors>,
  responders: ParticipantId[]
): PrepareResultsDeps {
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
  };
}

describe("prepareProfile", () => {
  it("AC-7 · projects a ranked participant: shared tags only, and the same position, band, bond and friction their rank entry carries", async () => {
    const deps = depsFor(AC1_ROOM, LATENTS, [ANA]);

    const profile = await prepareProfile(BRUNO, ANA, "friendship", deps);

    if (profile === null) {
      throw new Error("expected a profile for a ranked participant, got null");
    }
    expect(profile.id).toBe(BRUNO);
    expect(profile.name).toBe("Bruno");
    expect(profile.photoUrl).toBe(`https://blob.example/${BRUNO}.jpg`);
    expect(profile.team).toBe("alpha");

    // The INTERSECTION, never P's full list: "ajedrez" is his alone, and
    // rendering it would present a private interest as common ground.
    expect(profile.tags).toEqual(["escalada", "ramen"]);
    expect(profile.tags).not.toContain("ajedrez");
    expect(profile.tags).not.toContain("podcasts");
    for (const tag of profile.tags) expect(TAGS).toContain(tag);

    // `standing` is the SAME row the board renders, compared against the rank
    // call rather than recomputed: a parallel computation is what drifts.
    const room = await prepareResults(
      ANA,
      "friendship",
      depsFor(AC1_ROOM, LATENTS, [ANA])
    );
    if (room.status !== "ranked") {
      throw new Error(`expected a ranked room, got "${room.status}"`);
    }
    const entry = room.entries.find((e) => e.id === BRUNO);
    if (entry === undefined) {
      throw new Error("expected Bruno to be ranked for Ana under friendship");
    }
    expect(profile.standing).toEqual({
      position: entry.position,
      band: entry.band,
      bond: entry.bond,
      friction: entry.friction,
    });
  });

  // kind: safety -- NEVER skipped. The fixture assertions below establish that
  // the six calls fail for six DIFFERENT reasons; the scenario then requires
  // all six to be indistinguishable to the caller.
  it("AC-8 · six different unreachable reasons all return exactly null, disclosing nothing about which one it was", async () => {
    // Six causes, each genuinely its own -- otherwise this criterion would
    // pass by testing one cause six times.
    expect(AC8_ROOM.find((r) => r.participant.id === GHOST)).toBeUndefined();
    expect(floorReason(ROW_ABANDONED, "friendship")).toBe(
      "declared-incomplete"
    );
    expect(floorReason(ROW_DECLINER, "romantic")).toBe("no-consent");
    expect(ROW_DECLINER.romanticGate).toBeUndefined();
    expect(floorReason(ROW_NO_PHOTO, "friendship")).toBe("no-photo");
    // The mismatched row clears the §0 floor: only the gate drops it, so the
    // gate case is not secretly the floor case again.
    expect(floorReason(ROW_MISMATCH, "romantic")).toBeNull();
    expect(MISMATCHED_ROMANTIC.interestedIn).not.toContain(
      SUBJECT_ROMANTIC.gender
    );
    expect(floorReason(ROW_SUBJECT, "friendship")).toBeNull();

    const deps = () => depsFor(AC8_ROOM, {}, [SUBJECT]);

    const results = [
      // No such person.
      await prepareProfile(GHOST, SUBJECT, "friendship", deps()),
      // Below the §0 floor.
      await prepareProfile(ABANDONED, SUBJECT, "friendship", deps()),
      // Did not consent to this lens, and therefore holds no gate row.
      await prepareProfile(DECLINER, SUBJECT, "romantic", deps()),
      // Gate-failed against the viewer's.
      await prepareProfile(MISMATCH, SUBJECT, "romantic", deps()),
      // That is you.
      await prepareProfile(SUBJECT, SUBJECT, "friendship", deps()),
      // The VIEWER is below the floor: nobody is visible to them at all.
      await prepareProfile(RANKABLE, NO_PHOTO, "friendship", deps()),
    ];

    for (const result of results) {
      expect(result).toBeNull();
    }
    // One value, byte for byte: no caller can tell the six apart.
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);

    // ... and nothing of anybody's rides along in it.
    const payload = JSON.stringify(results);
    for (const row of AC8_ROOM) {
      expect(payload).not.toContain(row.participant.id);
      expect(payload).not.toContain(row.participant.name);
      for (const tag of row.participant.declared.tags) {
        expect(payload).not.toContain(tag);
      }
    }
    for (const forbidden of ["high", "mid", "band", "standing", "gender"]) {
      expect(payload).not.toContain(forbidden);
    }
  });
});
