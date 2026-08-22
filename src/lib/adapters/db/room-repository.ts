import { eq } from "drizzle-orm";
import type {
  NewRoom,
  Room,
  RoomId,
  RoomRepository,
} from "@/lib/ports/room-repository";
import type { Db } from "./client.ts";
import { rooms } from "./schema/index.ts";
import { isUuid } from "./uuid.ts";

/**
 * neon-http `RoomRepository` (docs/domain.md §7). Returns domain types, never
 * Drizzle rows (data-access skill hard rule 2).
 *
 * A room is the isolation boundary between the demo's real responses and
 * anything automated (D9): `create()` is what the seed and the e2e fixtures
 * use, and the unique index on `slug` is what stops a second
 * `platanus-hack-26-bogota` appearing beside the real one.
 */

/** The columns a `Room` is made of -- selected by name, never `select *`. */
const ROOM_COLUMNS = {
  id: rooms.id,
  slug: rooms.slug,
  name: rooms.name,
  instrumentVersion: rooms.instrumentVersion,
  createdAt: rooms.createdAt,
};

type RoomRow = {
  id: string;
  slug: string;
  name: string;
  instrumentVersion: string;
  createdAt: Date;
};

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    instrumentVersion: row.instrumentVersion,
    createdAt: row.createdAt,
  };
}

export function createRoomRepository(db: Db): RoomRepository {
  return {
    async bySlug(slug: string): Promise<Room | null> {
      const [row] = await db
        .select(ROOM_COLUMNS)
        .from(rooms)
        .where(eq(rooms.slug, slug))
        .limit(1);
      return row ? toRoom(row) : null;
    },

    async byId(id: RoomId): Promise<Room | null> {
      // A uuid nobody minted is a miss; a string that is not a uuid at all is
      // also a miss. Postgres errors on the second rather than returning no
      // rows, and `byId` promises `Room | null` to both (./uuid.ts).
      if (!isUuid(id)) return null;

      const [row] = await db
        .select(ROOM_COLUMNS)
        .from(rooms)
        .where(eq(rooms.id, id))
        .limit(1);
      return row ? toRoom(row) : null;
    },

    async create(room: NewRoom): Promise<Room> {
      const [row] = await db
        .insert(rooms)
        .values({
          slug: room.slug,
          name: room.name,
          instrumentVersion: room.instrumentVersion,
        })
        .returning(ROOM_COLUMNS);
      return toRoom(row);
    },
  };
}
