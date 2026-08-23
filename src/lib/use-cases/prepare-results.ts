/**
 * `prepareResults(subjectId, lens, deps)` — rank the subject's room under one
 * lens (issue #10; docs/domain.md §0, §5, §6, D13; CONTEXT.md §3 steps 3-4).
 *
 * It returns `RankedRoom` and therefore structurally satisfies
 * `RankingPort.forSubject` (`ports/ranking.ts`), which is the whole point: the
 * screens are already written against that port, so composition swaps the
 * fixture adapter for this function in one line.
 *
 * The subject arrives as a RESOLVED `ViewerId`. This use case reads no cookie
 * and takes no session token: D4's guarantee lives in the cookie resolver, and
 * every signature downstream of it is a compile-time restatement.
 *
 * The order of work is fixed:
 *
 *   1. `participants.byIdForRanking(subjectId)` — the subject's own row WITH
 *      gate rows, because `meetsFloor` takes a `RankableParticipant`.
 *   2. `consent[lens]` false ⇒ `{ status: "not-consented", lens }`.
 *   3. `meetsFloor(subject, lens)` false for any other reason ⇒
 *      `{ status: "below-floor", lens }`.
 *   4. Score-if-needed, through #30: `latents.computedAtFor(subjectId)`. Score
 *      when it is null, or when it predates the subject's latest response
 *      `answeredAt` — without the freshness rule a participant who re-answers a
 *      block after finishing keeps the superseded posterior forever.
 *      `scoreParticipant` itself refuses an incomplete quiz (#30 AC-13), so an
 *      abandoner is never scored here and ranks on the absent-row prior.
 *   5. `byRoomForRanking(roomId, lens)` — the repository applies the full §0
 *      floor; this use case re-checks every returned row with `meetsFloor` as
 *      defence in depth and drops what fails. The re-check is NOT the
 *      enforcement point and does not license the repository to return
 *      below-floor rows.
 *   6. `latents.byParticipants([...ids])` — one query for the room.
 *   7. Cohorts: `floor((quizCompletedAt − earliest) / 30 min)`, where earliest
 *      is the earliest non-null `quizCompletedAt` among the rows being ranked
 *      PLUS the subject. Null ⇒ `cohort: undefined`.
 *   8. `toPerson` each ⇒ `rankRoom(people, subjectId, lens)` ⇒ project to
 *      `RankEntry[]`.
 *
 * What the projection may carry is the safety property of this file. A
 * `RankEntry` holds a 1-based `position` and a two-value `band`, never the
 * engine's `rank` or `sim` float, never a driver's score, weight or
 * contribution, never the `flags` object: a latent driver's score is
 * `softMin(la.mean, lb.mean)` (engine.ts:633), so a subject who knows their own
 * posterior — it is their own avatar — inverts it to the OTHER participant's
 * measured latent to two decimals. `"low"`-band entries are DROPPED rather than
 * greyed, exactly like below-floor people, because a third pill discloses who
 * was excluded.
 *
 * Rankings are computed on request and never stored (D13).
 */
import type { TermName } from "../domain/matching/engine";
import { rankRoom } from "../domain/matching/engine";
import { toPerson } from "../domain/matching/to-person";
import type {
  Lens,
  ParticipantId,
  RankableParticipant,
} from "../domain/participant";
import { meetsFloor } from "../domain/participant";
import type {
  RankEntry,
  RankedRoom,
  RankReason,
  ViewerId,
} from "../domain/reveal/rank";
import type { LatentPosteriors } from "../ports/latent-source";
import type { RankingParticipants } from "../ports/participant-repository";
import type { ResponseRepository } from "../ports/response-repository";
import type { RoomRepository } from "../ports/room-repository";
import type {
  ScoreParticipantInput,
  ScoreParticipantResult,
} from "./score-participant";

/**
 * The read slice of #30's `LatentRepository` (which also satisfies
 * `LatentSource`): the room's posteriors, and the subject's freshness stamp.
 * Writing is the scorer's job, never this use case's.
 */
export interface RankingLatents {
  byParticipants(
    ids: readonly ParticipantId[]
  ): Promise<ReadonlyMap<ParticipantId, LatentPosteriors>>;
  computedAtFor(id: ParticipantId): Promise<Date | null>;
}

export interface PrepareResultsDeps {
  participants: RankingParticipants;
  latents: RankingLatents;
  /** The subject's own answers only — read for the freshness comparison. */
  responses: Pick<ResponseRepository, "byParticipant">;
  /** `scoreParticipant` is given the room; §7 has this use case hold it. */
  rooms: Pick<RoomRepository, "byId">;
  /** #30's use case, injected so a test can count invocations. */
  scoreParticipant(
    input: ScoreParticipantInput
  ): Promise<ScoreParticipantResult>;
}

/**
 * The user-facing name of every engine term, in both roles.
 *
 * Deliberately NOT `engine.TERM_LABELS`: those are English and technical
 * ("Regulation", "Life Shape & Capacity") because the engine writes them for
 * QA and the narrator. `RankReason.label` is what a participant reads on their
 * own board, so the vocabulary and tone are the ones `src/components/rank/`
 * already fixed — `les une:` for a bond, `roce:` for a friction, lower case,
 * short enough for a pill.
 *
 * Keyed by `TermName` so a new engine term fails to compile here rather than
 * rendering a raw identifier, and holding NO digits: the whole payload is
 * asserted to contain no decimal, because a decimal on this screen is a
 * posterior somebody can invert (engine.ts:633).
 */
const REASON_LABELS: Record<TermName, { bond: string; friction: string }> = {
  regulation: {
    bond: "les une: cómo discuten",
    friction: "roce: se calientan distinto",
  },
  politeness: {
    bond: "les une: el trato",
    friction: "roce: modales distintos",
  },
  reliability: {
    bond: "les une: cumplen lo que dicen",
    friction: "roce: quién sostiene el plan",
  },
  agency: {
    bond: "les une: quién empuja",
    friction: "roce: quién decide",
  },
  distance: {
    bond: "les une: mismo ritmo de contacto",
    friction: "roce: quién escribe primero",
  },
  lifeShape: {
    bond: "les une: ritmo de vida",
    friction: "roce: planes de ciudad",
  },
  commonGround: {
    bond: "les une: humor parecido",
    friction: "roce: agendas opuestas",
  },
  structural: {
    bond: "les une: mismos rituales",
    friction: "roce: órbitas distintas",
  },
  eligibility: {
    bond: "les une: buscan lo mismo",
    friction: "roce: buscan cosas distintas",
  },
};

/** The engine's term NAME plus its Spanish. Never its score or its weight. */
function reasonOf(term: TermName, role: "bond" | "friction"): RankReason {
  return { term, label: REASON_LABELS[term][role] };
}

/** §6: 30-minute windows measured from the earliest completion in hand. */
const COHORT_WINDOW_MS = 30 * 60_000;

/**
 * What a ranked room is, plus the rows it was built from.
 *
 * `prepareProfile` needs the other person's team and tags and the viewer's
 * tags, none of which may cross the port on a `RankEntry`. Handing back the
 * rows this call already read is what keeps it to ONE room read instead of a
 * second by-id query per profile view, and what guarantees the profile and the
 * board are projections of the same ranking rather than two rankings.
 */
export interface SubjectRanking {
  room: RankedRoom;
  rows: ReadonlyMap<ParticipantId, RankableParticipant>;
}

const NO_ROWS: ReadonlyMap<ParticipantId, RankableParticipant> = new Map();

/**
 * The newest `answeredAt` the subject holds, or null when they have answered
 * nothing. Compared against `computedAt`: a response newer than the posterior
 * means the posterior was fitted to answers that have since changed, and
 * nothing else in the system re-scores.
 */
function latestAnswerAt(answeredAt: readonly Date[]): Date | null {
  if (answeredAt.length === 0) return null;
  return new Date(Math.max(...answeredAt.map((at) => at.getTime())));
}

/**
 * Step 4. Score only when there is no posterior, or when it is stale.
 *
 * `scoreParticipant` applies #30's own completion gate, so an abandoner is
 * refused here rather than acquiring four rows fitted to a partly answered
 * quiz — the absent row is what makes the engine impute the prior and keeps
 * `bothMeasured` honest (AUDIT.md S15).
 */
async function scoreIfStale(
  subject: RankableParticipant,
  deps: PrepareResultsDeps
): Promise<void> {
  const { id, roomId, quizCompletedAt } = subject.participant;

  const computedAt = await deps.latents.computedAtFor(id);
  if (computedAt !== null) {
    const answered = await deps.responses.byParticipant(id);
    const latest = latestAnswerAt(answered.map((r) => r.answeredAt));
    if (latest === null || latest.getTime() <= computedAt.getTime()) return;
  }

  // The room carries the instrument version the scorer checks. A null room is
  // unreachable behind the foreign key; if it ever happens, the subject ranks
  // on the absent-row prior rather than the whole board failing.
  const room = await deps.rooms.byId(roomId);
  if (room === null) return;

  await deps.scoreParticipant({ participantId: id, room, quizCompletedAt });
}

/**
 * Step 7. `floor((completedAt − earliest) / 30 min)`, where earliest is the
 * earliest non-null completion among the rows being ranked PLUS the subject —
 * deterministic from data already in hand. Null completion ⇒ undefined.
 */
function cohortsOf(
  rows: readonly RankableParticipant[]
): ReadonlyMap<ParticipantId, number | undefined> {
  const completions = rows
    .map((row) => row.participant.quizCompletedAt)
    .filter((at): at is Date => at !== null)
    .map((at) => at.getTime());
  const earliest = completions.length > 0 ? Math.min(...completions) : null;

  const cohorts = new Map<ParticipantId, number | undefined>();
  for (const { participant } of rows) {
    const completedAt = participant.quizCompletedAt;
    cohorts.set(
      participant.id,
      completedAt === null || earliest === null
        ? undefined
        : Math.floor((completedAt.getTime() - earliest) / COHORT_WINDOW_MS)
    );
  }
  return cohorts;
}

/**
 * `prepareResults` with the rows kept. Exported for `prepareProfile` only:
 * every other caller wants `RankedRoom`, which is the port's shape.
 */
export async function rankSubjectRoom(
  subjectId: ViewerId,
  lens: Lens,
  deps: PrepareResultsDeps
): Promise<SubjectRanking> {
  // 1. The subject's OWN rankable row, gate rows included.
  const subject = await deps.participants.byIdForRanking(subjectId);
  // An id nobody holds is reported exactly as a suppressed one: this function
  // never distinguishes "who?" from "not you".
  if (subject === null)
    return { room: { status: "below-floor", lens }, rows: NO_ROWS };

  // 2. Consent first, because it is the one outcome with its own screen.
  if (!subject.participant.consent[lens]) {
    return { room: { status: "not-consented", lens }, rows: NO_ROWS };
  }

  // 3. Any other floor rule — photo, declared round, lens gate.
  if (!meetsFloor(subject, lens)) {
    return { room: { status: "below-floor", lens }, rows: NO_ROWS };
  }

  // 4. Score the subject if their posterior is missing or stale.
  await scoreIfStale(subject, deps);

  // 5. The room, floored by the repository and re-checked here. The re-check
  //    is defence in depth, NOT the enforcement point: it re-reads the same
  //    rows, so it cannot see a concurrent withdrawal.
  const roomRows = await deps.participants.byRoomForRanking(
    subject.participant.roomId,
    lens
  );
  const rows = new Map<ParticipantId, RankableParticipant>();
  rows.set(subject.participant.id, subject);
  for (const row of roomRows) {
    if (!meetsFloor(row, lens)) continue;
    if (rows.has(row.participant.id)) continue;
    rows.set(row.participant.id, row);
  }
  const ranking = [...rows.values()];

  // 6. One posteriors query for the whole room. 7. Cohorts from the same rows.
  const posteriors = await deps.latents.byParticipants([...rows.keys()]);
  const cohorts = cohortsOf(ranking);

  // 8. Map, rank, project.
  const people = ranking.map((row) =>
    toPerson(
      row,
      posteriors.get(row.participant.id) ?? {},
      cohorts.get(row.participant.id)
    )
  );

  const entries: RankEntry[] = [];
  for (const ranked of rankRoom(people, subject.participant.id, lens)) {
    // Dropped, never greyed: a third pill discloses who was excluded.
    if (ranked.band === "low") continue;
    const row = rows.get(ranked.id);
    if (row === undefined) continue;
    entries.push({
      id: ranked.id,
      name: ranked.name,
      photoUrl: row.participant.photoUrl,
      avatar: row.participant.avatar,
      // Contiguous 1..n over what SURVIVED, not the pre-drop index: a gap in
      // the numbering discloses exactly what dropping the row prevented.
      position: entries.length + 1,
      band: ranked.band,
      bond: reasonOf(ranked.drivers[0].term, "bond"),
      friction:
        ranked.friction === null
          ? null
          : reasonOf(ranked.friction.term, "friction"),
    });
  }

  return {
    room: {
      status: "ranked",
      lens,
      viewer: { id: subject.participant.id, name: subject.participant.name },
      entries,
    },
    rows,
  };
}

export async function prepareResults(
  subjectId: ViewerId,
  lens: Lens,
  deps: PrepareResultsDeps
): Promise<RankedRoom> {
  const { room } = await rankSubjectRoom(subjectId, lens, deps);
  return room;
}
