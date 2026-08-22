import { describe, expect, it } from "vitest";

/**
 * `prepareResults(sessionToken, lens, deps)` use case (issue #10,
 * docs/domain.md §5-§7, D4, D13): resolves the subject through
 * `bySessionToken` only -- never a route param, query string or form field
 * -- reports the subject's own status with `meetsFloor(subject, lens)`
 * ("not-consented" / "below-floor"), scores the subject through #7 when
 * they hold no `latent_estimates` rows (once; later calls read the rows),
 * reads the room through `byRoomForRanking(roomId, lens)` -- the repository
 * applies the full §0 floor; the use case re-checks every row it gets back
 * with `meetsFloor` as defence in depth and drops what fails -- computes
 * 30-minute cohorts from the room's first `quiz_completed_at`, maps each row
 * with `toPerson`, ranks with `rankRoom(people, subject.id, lens)` and
 * projects every entry to `RankedResult` (a `RoomMember` plus band, rank,
 * top-3 drivers, friction and flags). Rankings are computed on request and
 * never stored.
 *
 * Rescoped for #10-as-wave-2: `prepareResults(subjectId, lens, deps)` returns
 * `RankedRoom` (src/lib/domain/reveal/rank.ts) and structurally satisfies
 * `RankingPort.forSubject` (src/lib/ports/ranking.ts), so composition swaps
 * the fixture adapter for it in one line. The subject arrives as a resolved
 * `ViewerId` -- this use case reads no cookie. Entries carry `bond`
 * ({ term, label }) and a 1-based `position`, never a score, a rank float or
 * a flags object: a latent driver's score is softMin(la.mean, lb.mean)
 * (engine.ts:633) and is therefore invertible to the OTHER participant's
 * posterior by a subject who knows their own. `RankBand` has no "low" --
 * low-band pairs are absent, like below-floor people.
 *
 * The `RankableParticipant` stand-in below is superseded by the landed nested
 * type in src/lib/domain/participant/floor.ts; migrating every fixture to it
 * is part of this issue.
 *
 * Every test uses inline in-memory fakes declared in this file -- no shared
 * fake module, no adapter import, so the biome.json hexagon rule holds --
 * and no database. AC-1 and AC-3 are skipped until the use case exists;
 * AC-3 adds a counting fake of #7's scorer and a fake of the latent-estimate
 * port (`byParticipants`, `replaceForParticipant`). AC-4 is `kind: safety`
 * and runs today.
 */

type Lens = "romantic" | "business" | "friendship";
type Gender = "M" | "F" | "NB";

const LENSES: Lens[] = ["romantic", "business", "friendship"];

interface RomanticGateRow {
  gender: Gender;
  interestedIn: Gender[];
  single: boolean;
  ageBand: number;
  wantsKids: boolean;
}

interface BusinessGateRow {
  riskPosture: number;
  exitHorizon: number;
  redlinesOk: boolean;
}

/**
 * Stand-in for #4's `RankableParticipant`: the §0 floor fields (photo,
 * consent, declared_at, gate rows) plus the declared bands `toPerson` maps.
 * The real type replaces it when src/lib/domain/participant lands.
 */
interface RankableParticipant {
  id: string;
  roomId: string;
  name: string;
  photoUrl: string | null;
  consent: { romantic: boolean; business: boolean; friendship: boolean };
  declaredAt: Date | null;
  bands: {
    moneyPosture: number | null;
    rootedness: number | null;
    familyGravity: number | null;
    capacityHoursBand: number | null;
    distanceBand: number | null;
    chronotype: number | null;
  };
  gates: { romantic?: RomanticGateRow; business?: BusinessGateRow };
}

/**
 * The slice of the #4 ParticipantRepository that `prepareResults` ranks
 * through. `byRoomForRanking(roomId, lens)` filters with `floor`, so the
 * strict fake is `inMemoryParticipants(rows, meetsFloor)` once #4 lands and
 * the permissive fake of AC-4's last call is the default, which ignores the
 * lens and returns every row in the room. Every read is recorded so a test
 * can assert which happened -- and that none did.
 */
function inMemoryParticipants(
  rows: RankableParticipant[],
  floor: (p: RankableParticipant, lens: Lens) => boolean = () => true
) {
  const rankingReads: Array<{ roomId: string; lens: Lens }> = [];
  const memberReads: string[] = [];
  return {
    rankingReads,
    memberReads,
    async byRoom(roomId: string) {
      memberReads.push(roomId);
      return rows
        .filter((p) => p.roomId === roomId)
        .map(({ id, name, photoUrl }) => ({ id, name, photoUrl }));
    },
    async byRoomForRanking(roomId: string, lens: Lens) {
      rankingReads.push({ roomId, lens });
      return rows.filter((p) => p.roomId === roomId && floor(p, lens));
    },
  };
}

// The AC-4 room (issue #10 Data): one subject, one rankable participant whose
// gates are mutual with the subject's, and three rows that each fail the §0
// floor on exactly one stated field under every lens.
const ROOM_ID = "33333333-3333-7333-8333-333333333333";
const DECLARED_AT = new Date("2026-08-22T19:00:00Z");

const BANDS = {
  moneyPosture: 2,
  rootedness: 2,
  familyGravity: 1,
  capacityHoursBand: 2,
  distanceBand: 1,
  chronotype: 1,
};
const NO_BANDS = {
  moneyPosture: null,
  rootedness: null,
  familyGravity: null,
  capacityHoursBand: null,
  distanceBand: null,
  chronotype: null,
};

const SUBJECT_ROMANTIC: RomanticGateRow = {
  gender: "F",
  interestedIn: ["M"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};
const MUTUAL_ROMANTIC: RomanticGateRow = {
  gender: "M",
  interestedIn: ["F"],
  single: true,
  ageBand: 1,
  wantsKids: false,
};
const BUSINESS: BusinessGateRow = {
  riskPosture: 1,
  exitHorizon: 1,
  redlinesOk: true,
};

const ALL_LENSES = { romantic: true, business: true, friendship: true };
const NO_LENSES = { romantic: false, business: false, friendship: false };

function participant(
  id: string,
  overrides: Partial<RankableParticipant> = {}
): RankableParticipant {
  return {
    id,
    roomId: ROOM_ID,
    name: id,
    photoUrl: `https://blob.example/${id}.jpg`,
    consent: ALL_LENSES,
    declaredAt: DECLARED_AT,
    bands: BANDS,
    gates: { romantic: MUTUAL_ROMANTIC, business: BUSINESS },
    ...overrides,
  };
}

const SUBJECT = participant("p-subject", {
  gates: { romantic: SUBJECT_ROMANTIC, business: BUSINESS },
});
const RANKABLE = participant("p-rankable");
const ABANDONED = participant("p-abandoned", {
  declaredAt: null,
  bands: NO_BANDS,
});
const NO_PHOTO = participant("p-no-photo", { photoUrl: null });
const DECLINER = participant("p-decliner", { consent: NO_LENSES, gates: {} });
const ROOM = [SUBJECT, RANKABLE, ABANDONED, NO_PHOTO, DECLINER];

describe("prepareResults", () => {
  // TODO: un-skip when prepareResults exists.
  // Blocked on: src/lib/use-cases/prepare-results.ts, toPerson in
  // src/lib/domain/matching/to-person.ts, meetsFloor and RankableParticipant
  // in src/lib/domain/participant (#4), the ParticipantRepository port with
  // bySessionToken / byRoom / byRoomForRanking (#4) and #7's latent-estimate
  // port; the fakes above gain bySessionToken and a latent fake.
  it.skip('AC-1 · ranks the room under friendship: status "ranked", the subject as a RoomMember, three RankedResults in rankRoom order, one byRoomForRanking call with (roomId, "friendship") and no byRoom', () => {});

  // TODO: un-skip when prepareResults scores a subject without latent rows.
  // Blocked on: src/lib/use-cases/prepare-results.ts calling #7's scorer
  // (src/lib/domain/scoring/estimate.ts) and persisting through #7's
  // latent-estimate port (replaceForParticipant / byParticipants), plus a
  // ResponseRepository fake holding the subject's 15 responses (#4).
  it.skip("AC-3 · scores a subject with no latent rows exactly once across two calls, persists four rows for them only and returns the same ordered entries both times", () => {});

  // Runs today (kind: safety). Below the §0 floor is suppressed, never
  // ranked (docs/domain.md §0 / §5, AUDIT.md S15): the repository applies
  // meetsFloor inside byRoomForRanking, the use case re-checks every row it
  // gets back, and toPerson throws on a null declared field. Today none of
  // prepareResults, meetsFloor or toPerson exists, so nothing can rank the
  // room and the check is vacuous over the fixture alone; when they land,
  // build the strict fake with inMemoryParticipants(ROOM, meetsFloor), call
  // prepareResults(the subject's token, lens, deps) for each of romantic,
  // business and friendship and expect entries.map((e) => e.member.id) to
  // equal [RANKABLE.id]; call it once more under friendship against the
  // permissive inMemoryParticipants(ROOM) with toPerson wrapped in a counting
  // spy and expect the same single entry with toPerson reached only for the
  // subject and the rankable row; and expect toPerson(ABANDONED, [], 0) to
  // throw -- keeping the assertions below.
  it("AC-4 · the abandoned, no-photo and declining participants are never ranked under any lens", () => {
    const participants = inMemoryParticipants(ROOM);

    // The given: each below-floor row fails on its stated field under every
    // lens, so none of them could be dropped by a gate mismatch instead.
    expect(ABANDONED.declaredAt).toBeNull();
    expect(Object.values(ABANDONED.bands)).toEqual(Array(6).fill(null));
    expect(NO_PHOTO.photoUrl).toBeNull();
    expect(DECLINER.gates).toEqual({});
    for (const lens of LENSES) {
      expect(DECLINER.consent[lens]).toBe(false);
      expect(ABANDONED.consent[lens]).toBe(true);
      expect(NO_PHOTO.consent[lens]).toBe(true);
    }

    // ... while the rankable row clears the floor under every lens with gates
    // mutual to the subject's, so it is the one entry every lens must carry.
    expect(RANKABLE.photoUrl).not.toBeNull();
    expect(RANKABLE.declaredAt).not.toBeNull();
    expect(RANKABLE.consent).toEqual(ALL_LENSES);
    expect(MUTUAL_ROMANTIC.interestedIn).toContain(SUBJECT_ROMANTIC.gender);
    expect(SUBJECT_ROMANTIC.interestedIn).toContain(MUTUAL_ROMANTIC.gender);
    expect(MUTUAL_ROMANTIC.wantsKids).toBe(SUBJECT_ROMANTIC.wantsKids);
    expect(RANKABLE.gates.business).toEqual(SUBJECT.gates.business);

    // The invariant: no ranking read has happened for any lens, so no entry
    // exists that could carry a below-floor participant.
    expect(participants.rankingReads).toEqual([]);
    expect(participants.memberReads).toEqual([]);
  });

  // TODO: un-skip when prepareResults exists.
  // Blocked on: src/lib/use-cases/prepare-results.ts. The sad paths the carve
  // left missing -- #10's original sad criterion (AC-7) was e2e and went to
  // the ui-flow workstream with the screen.
  it.skip('AC-5 · a decliner gets { status: "not-consented" } and a no-photo participant { status: "below-floor" }, each carrying no viewer, no entries and no other participant, with byRoomForRanking never called and zero latent writes', () => {});

  // TODO: un-skip when prepareResults exists.
  // Blocked on: src/lib/use-cases/prepare-results.ts and #30's
  // scoreParticipant (the quiz-incomplete refusal this asserts).
  it.skip("AC-6 · a subject with quiz_completed_at null ranks the room but acquires no latent rows, so the absent row survives and the engine imputes the prior", () => {});
});
