/**
 * The room repository port (docs/domain.md §7, D9).
 *
 * A room is the isolation boundary between the demo's real responses and
 * anything automated, and it records which instrument version it administered.
 */
import type { RoomId } from "../domain/participant";

export type { RoomId };

export interface Room {
  id: RoomId;
  slug: string;
  name: string;
  /** Which instrument this room administered, e.g. "bank-1". */
  instrumentVersion: string;
  createdAt: Date;
}

export interface NewRoom {
  slug: string;
  name: string;
  instrumentVersion: string;
}

export interface RoomRepository {
  bySlug(slug: string): Promise<Room | null>;
  /** The quiz reads participant.roomId -> room.instrumentVersion. */
  byId(id: RoomId): Promise<Room | null>;
  create(room: NewRoom): Promise<Room>;
}
