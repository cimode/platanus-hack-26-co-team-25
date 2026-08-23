import { asc, eq } from "drizzle-orm";
import { isAvatar } from "@/lib/domain/participant/avatar";
import type { Participant } from "@/lib/domain/participants/participant";
import type { ParticipantsPort } from "@/lib/ports/participants";
import type { Db } from "./client";
import { participants, rooms } from "./schema";

/**
 * The roster, read from the room people actually registered in.
 *
 * This replaces `adapters/participants/roster.ts`, whose hardcoded eighteen
 * names existed only because intake did not. Intake exists now, so the
 * impersonation screen, the room, the ranking and the profile all read the
 * same rows the form writes -- and a person who fills the form appears in the
 * chooser on the next request rather than after a deploy.
 *
 * ONE query with a join, not a slug lookup followed by a listing. Two round
 * trips on venue wifi to answer "who is here" is a cost the login screen pays
 * on every visit, and the join is free by comparison.
 *
 * Only four columns cross this line. `select *` is billed egress on Neon and
 * this table holds consent flags, gates and tags -- none of which a chooser
 * may see. What the query does not read, no serialiser downstream can leak.
 */
export function createDbRoster(db: Db, roomSlug: string): ParticipantsPort {
  return {
    async list(): Promise<readonly Participant[]> {
      const rows = await db
        .select({
          id: participants.id,
          name: participants.name,
          team: participants.team,
          avatar: participants.avatar,
        })
        .from(participants)
        .innerJoin(rooms, eq(participants.roomId, rooms.id))
        .where(eq(rooms.slug, roomSlug))
        // Alphabetical, because `filterParticipants` keeps input order for
        // equally good matches -- the roster's order IS the tiebreak a person
        // sees while typing.
        .orderBy(asc(participants.name));

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        // `team` is nullable: registration does not require one. Empty string
        // renders as no secondary line, which is the truth about that person,
        // and folds to nothing in the combobox filter rather than matching.
        team: row.team ?? "",
        // Validated rather than cast. The column is `text`, so a hand-edited
        // row can hold anything; `placeInRoom` falls back to its index
        // rotation on null, and a bogus plate would render a broken sprite.
        avatar: isAvatar(row.avatar) ? row.avatar : null,
      }));
    },
  };
}
