import { and, desc, eq } from "drizzle-orm";

import type {
  MeetPlaceId,
  MeetRequestView,
  MeetStatus,
  MeetTimeId,
} from "../../domain/meet/meet.ts";
import type {
  MeetRepository,
  MeetRequestInsert,
} from "../../ports/meet-repository.ts";
import type { Db } from "./client.ts";
import { meetRequests } from "./schema/meet-requests.ts";
import { participants } from "./schema/participants.ts";
import { isUuid } from "./uuid.ts";

/**
 * `MeetRepository` over Postgres.
 *
 * Every read joins `participants` for the counterpart's NAME and takes nothing
 * else off that table. `RoomMember` (docs/domain.md §5) pins what one
 * participant may see of another to exactly id, name and photo; a request
 * surface needs the name and has no use for the rest, so the select names four
 * columns rather than spreading the row.
 */
export function createMeetRepository(db: Db): MeetRepository {
  return {
    async propose(row: MeetRequestInsert): Promise<void> {
      await db
        .insert(meetRequests)
        .values({
          lens: row.lens,
          fromParticipant: row.fromParticipant,
          toParticipant: row.toParticipant,
          place: row.place,
          time: row.time,
        })
        // The partial unique index carries the rule; this makes hitting it a
        // no-op instead of a 23505 the page would have to translate.
        .onConflictDoNothing();
    },

    async respond(
      requestId: string,
      recipientId: string,
      status: Extract<MeetStatus, "accepted" | "declined">
    ): Promise<boolean> {
      // Both ids are Postgres uuids, which ERROR on a malformed literal rather
      // than matching nothing -- the same guard `byIdForRanking` applies.
      if (!(isUuid(requestId) && isUuid(recipientId))) return false;

      const updated = await db
        .update(meetRequests)
        .set({ status, respondedAt: new Date() })
        .where(
          and(
            eq(meetRequests.id, requestId),
            // Authorisation IS the WHERE clause: a request addressed to
            // somebody else matches nothing.
            eq(meetRequests.toParticipant, recipientId),
            eq(meetRequests.status, "pending")
          )
        )
        .returning({ id: meetRequests.id });

      return updated.length > 0;
    },

    async received(participantId: string): Promise<readonly MeetRequestView[]> {
      if (!isUuid(participantId)) return [];

      const rows = await db
        .select({
          id: meetRequests.id,
          counterpartId: participants.id,
          counterpartName: participants.name,
          place: meetRequests.place,
          time: meetRequests.time,
          status: meetRequests.status,
          createdAt: meetRequests.createdAt,
        })
        .from(meetRequests)
        .innerJoin(
          participants,
          eq(participants.id, meetRequests.fromParticipant)
        )
        .where(
          and(
            eq(meetRequests.toParticipant, participantId),
            eq(meetRequests.status, "pending")
          )
        )
        .orderBy(desc(meetRequests.createdAt));

      return rows.map(toView);
    },

    async sent(participantId: string): Promise<readonly MeetRequestView[]> {
      if (!isUuid(participantId)) return [];

      const rows = await db
        .select({
          id: meetRequests.id,
          counterpartId: participants.id,
          counterpartName: participants.name,
          place: meetRequests.place,
          time: meetRequests.time,
          status: meetRequests.status,
          createdAt: meetRequests.createdAt,
        })
        .from(meetRequests)
        .innerJoin(
          participants,
          eq(participants.id, meetRequests.toParticipant)
        )
        .where(eq(meetRequests.fromParticipant, participantId))
        .orderBy(desc(meetRequests.createdAt));

      return rows.map(toView);
    },
  };
}

function toView(row: {
  id: string;
  counterpartId: string;
  counterpartName: string;
  place: string;
  time: string;
  status: string;
  createdAt: Date;
}): MeetRequestView {
  return {
    id: row.id,
    counterpartId: row.counterpartId,
    counterpartName: row.counterpartName,
    place: row.place as MeetPlaceId,
    time: row.time as MeetTimeId,
    status: row.status as MeetStatus,
    createdAt: row.createdAt,
  };
}
