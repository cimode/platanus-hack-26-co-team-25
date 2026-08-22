/**
 * The participant repository port (docs/domain.md §7).
 *
 * `byRoom()` returns `RoomMember[]` -- id, name, photoUrl and nothing else.
 * `byRoomForRanking(roomId, lens)` applies the FULL §0 floor for that lens
 * inside the adapter, so the repository is the enforcement point of the S15
 * invariant and no caller can hold a below-floor row.
 */
import type {
  BusinessGate,
  Consent,
  DeclaredProfile,
  Lens,
  NewParticipant,
  Participant,
  ParticipantId,
  RankableParticipant,
  RomanticGate,
  RoomId,
  RoomMember,
  SessionToken,
} from "../domain/participant";

export interface ParticipantRepository {
  /** The session token is returned beside the participant, never on it (D4). */
  create(
    input: NewParticipant
  ): Promise<{ participant: Participant; sessionToken: SessionToken }>;
  bySessionToken(token: SessionToken): Promise<Participant | null>;
  setPhoto(id: ParticipantId, url: string): Promise<void>;
  setConsent(id: ParticipantId, consent: Consent): Promise<void>;
  /** One db.batch(); sets declared_at only when all six bands are present. */
  saveDeclared(id: ParticipantId, declared: DeclaredProfile): Promise<void>;
  upsertRomanticGate(id: ParticipantId, gate: RomanticGate): Promise<void>;
  upsertBusinessGate(id: ParticipantId, gate: BusinessGate): Promise<void>;
  /** Fixtures and repair only -- `answer-block` passes `completedAt` instead. */
  markQuizCompleted(id: ParticipantId, at: Date): Promise<void>;
  byRoom(roomId: RoomId): Promise<RoomMember[]>;
  byRoomForRanking(roomId: RoomId, lens: Lens): Promise<RankableParticipant[]>;
}

/**
 * The narrow slice of this port that `src/lib/use-cases/prepare-results.ts`
 * ranks through (issue #10). Declared HERE, separately from
 * `ParticipantRepository`, rather than added to it: widening the shared port
 * would break the six existing `ParticipantRepository` fakes in other
 * use-case tests (`answer-block`, `quiz-progress`, `set-photo`,
 * `submit-declared`, `submit-business-gate`, `submit-romantic-gate`) with
 * TS2741, and a port method six implementations do not need is a port method
 * that earns nothing. `adapters/db/participant-repository.ts` implements it
 * over the joins `byRoomForRanking` already performs and satisfies this slice
 * structurally.
 *
 * `byIdForRanking` takes NO lens and applies NO floor: the subject's own
 * floor OUTCOME is what `prepareResults` reports, and a filtered read would
 * return null for both "not-consented" and "below-floor" and collapse the
 * two statuses into one. `bySessionToken` cannot stand in for it -- it
 * selects no gate tables, so a fabricated `romanticGate: undefined` puts
 * every subject below the romantic floor, and skipping the check lets a
 * gateless subject reach `rankRoom`, which throws `unknown subject id` with
 * their id in the message (engine.ts:782).
 */
export interface RankingParticipants {
  byIdForRanking(id: ParticipantId): Promise<RankableParticipant | null>;
  byRoomForRanking(roomId: RoomId, lens: Lens): Promise<RankableParticipant[]>;
}
