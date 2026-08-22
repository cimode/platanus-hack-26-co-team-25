import type { Participant } from "../participants/participant";

/** The three ways two people can be compatible. */
export const LENSES = ["romantic", "business", "friendship"] as const;

export type Lens = (typeof LENSES)[number];

export function isLens(value: unknown): value is Lens {
  return (
    typeof value === "string" && (LENSES as readonly string[]).includes(value)
  );
}

/**
 * The venue plate, `public/venue.jpeg`, at its natural aspect ratio.
 *
 * Everything below is expressed as a FRACTION of that image rather than of the
 * viewport, because the floor is a fixed shape painted into the art. Render the
 * plate at its own aspect ratio and these coordinates land exactly; stretch it
 * to fit a band and people stand on the furniture.
 */
export const VENUE_ASPECT = 1536 / 1024;

/* -------------------------------------------------------------------------- */
/*  The floor                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The room is isometric, so the floor is an octagon, not a rectangle: it is
 * widest across the middle and closes in linearly toward the near corner.
 *
 * These numbers are MEASURED, not guessed -- sampled off the plate by scanning
 * for the floor's wood colour. Re-measure if the art is ever redrawn:
 *
 *   y=0.80  ->  x 0.109 .. 0.938
 *   y=0.96  ->  x 0.305 .. 0.740
 *
 * which is a clean linear taper of ~1.23 per unit y on each side.
 */
const EDGE_SLOPE = 1.23;
const REF_Y = 0.8;
const REF_LEFT = 0.109;
const REF_RIGHT = 0.938;

/**
 * The band people actually stand in.
 *
 * Stops short of the floor's true extent at both ends on purpose: behind
 * FLOOR_BACK the plate is full of platforms, desks and the presentation screen,
 * and past FLOOR_FRONT a sprite's feet cross the room's near rim.
 *
 * `back` is 0.76 for a second reason: that is the WIDEST scanline, the floor's
 * left and right vertices. The taper below is a single straight line, which
 * only describes the near half of the octagon -- further back the floor closes
 * in again. Pushing `back` to 0.72 extrapolated the right edge to 1.016, i.e.
 * off the plate and onto the wall. A test catches it now.
 */
export const STANDING_BAND = { back: 0.76, front: 0.95 } as const;
const FLOOR_BACK = STANDING_BAND.back;
const FLOOR_FRONT = STANDING_BAND.front;
const DEPTH_ROWS = 4;

/** How far in from the wall a sprite must stay, as a fraction of plate width. */
const WALL_INSET = 0.02;

/** The horizontal extent of the standing floor at a given depth. */
export function floorSpan(y: number): { left: number; right: number } {
  const drop = y - REF_Y;
  // Clamped as a backstop: the taper is only valid inside the standing band,
  // and a future recalibration must not be able to walk anyone onto a wall.
  return {
    left: Math.max(0, REF_LEFT + EDGE_SLOPE * drop + WALL_INSET),
    right: Math.min(1, REF_RIGHT - EDGE_SLOPE * drop - WALL_INSET),
  };
}

/**
 * Sprite height as a fraction of the plate's height.
 *
 * Calibrated against the plate itself, not invented: the bar stools by the
 * window measure ~0.076 of the plate's height, so a standing person lands
 * around 0.075..0.125. Sized any larger the crowd reads as giants in a doll's
 * house -- which is exactly what the first pass looked like.
 *
 * The 1.67x spread across the band keeps the handoff's depth cue (its
 * 46px..82px is 1.78x). Expressed as a fraction so sprites track the art at any
 * rendered size instead of drifting off it.
 */
export function spriteHeightFraction(y: number): number {
  const t = (y - FLOOR_BACK) / (FLOOR_FRONT - FLOOR_BACK);
  return 0.075 + t * 0.05;
}

/* -------------------------------------------------------------------------- */
/*  Placement                                                                 */
/* -------------------------------------------------------------------------- */

/** Where one sprite stands, in fractions of the venue plate. */
export interface Placement {
  readonly participant: Participant;
  /** 0..1 across the plate. The sprite is centred on this. */
  readonly x: number;
  /** 0..1 down the plate. The sprite's FEET sit here. */
  readonly y: number;
  /** Sprite height as a fraction of plate height. */
  readonly height: number;
  /** Seconds of delay on the idle hop, so the room does not pulse in unison. */
  readonly idleDelay: number;
}

/**
 * A stable 32-bit hash of a string.
 *
 * Positions must not move between renders: a sprite that teleports on every
 * navigation destroys the illusion that these are people standing somewhere.
 * Hashing the participant id gives each person the same spot forever, with no
 * state to persist.
 */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Scatter people across the standing floor.
 *
 * A grid with per-cell jitter rather than free random placement: pure random
 * clumps, and two sprites at the same spot read as a rendering bug rather than
 * as a crowd. Each row gets its own width because the floor narrows toward the
 * camera -- the near row genuinely holds fewer people than the back one, which
 * is what makes the perspective hold up.
 *
 * Returned back-to-front, so painting in order puts nearer sprites on top
 * without anyone needing a z-index.
 */
export function placeInRoom(
  participants: readonly Participant[]
): readonly Placement[] {
  const count = participants.length;
  if (count === 0) return [];

  const columns = roomColumns(count);
  const rowSpan = (FLOOR_FRONT - FLOOR_BACK) / DEPTH_ROWS;

  const placements = participants.map((participant, index) => {
    const seed = hash(participant.id);
    const row = index % DEPTH_ROWS;
    const column = Math.floor(index / DEPTH_ROWS);

    // Two independent 0..1 draws out of one hash: low bits for x, high for y.
    const jitterX = (seed & 0xffff) / 0xffff;
    const jitterY = ((seed >>> 16) & 0xffff) / 0xffff;

    // 0.15..0.85 of the cell keeps sprites off their own cell edges, which is
    // what stops neighbours in adjacent cells from touching.
    const y = FLOOR_BACK + rowSpan * (row + 0.15 + jitterY * 0.7);
    const { left, right } = floorSpan(y);
    const columnSpan = (right - left) / columns;
    const x = left + columnSpan * (column + 0.15 + jitterX * 0.7);

    return {
      participant,
      x,
      y,
      height: spriteHeightFraction(y),
      // 0..2.4s. The hop itself runs 3.6s, so staggering the START is enough
      // to break the unison without tracking per-sprite timers.
      idleDelay: (seed % 240) / 100,
    };
  });

  return [...placements].sort((a, b) => a.y - b.y);
}

/** How many columns the floor is divided into for a room of `count` people. */
export function roomColumns(count: number): number {
  return Math.max(1, Math.ceil(count / DEPTH_ROWS));
}
