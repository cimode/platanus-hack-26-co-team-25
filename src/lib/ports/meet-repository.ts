import type {
  MeetPlaceId,
  MeetRequestView,
  MeetStatus,
  MeetTimeId,
} from "../domain/meet/meet";
import type { Lens } from "../domain/participant";

export interface MeetRequestInsert {
  readonly lens: Lens;
  readonly fromParticipant: string;
  readonly toParticipant: string;
  readonly place: MeetPlaceId;
  readonly time: MeetTimeId;
}

export interface MeetRepository {
  /**
   * Insert one pending request, or do nothing when a pending one already
   * exists for this direction and lens.
   *
   * Idempotent by the partial unique index rather than by a read-then-write:
   * the button is on a phone, a double tap is one user gesture, and two
   * concurrent inserts must not become two rows in someone's inbox.
   */
  propose(row: MeetRequestInsert): Promise<void>;

  /**
   * Answer a request. The `recipientId` is part of the WHERE, not an argument
   * the caller is trusted on — so a request id belonging to somebody else
   * matches no row and changes nothing, rather than being answered by whoever
   * guessed the uuid.
   *
   * Only a `pending` row moves, so a second tap on "Aceptar" cannot rewrite an
   * answer that already exists.
   */
  respond(
    requestId: string,
    recipientId: string,
    status: Extract<MeetStatus, "accepted" | "declined">
  ): Promise<boolean>;

  /** Pending requests addressed to this participant, newest first. */
  received(participantId: string): Promise<readonly MeetRequestView[]>;

  /** Requests this participant sent, every status, newest first. */
  sent(participantId: string): Promise<readonly MeetRequestView[]>;
}
