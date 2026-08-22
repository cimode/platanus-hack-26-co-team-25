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
