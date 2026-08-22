import { describe, expect, it } from "vitest";
import type { Participant } from "../participants/participant";
import {
  floorSpan,
  isLens,
  placeInRoom,
  roomColumns,
  STANDING_BAND,
  spriteHeightFraction,
} from "./layout";

const { back: BACK, front: FRONT } = STANDING_BAND;

const person = (id: string): Participant => ({
  id,
  name: id,
  team: "equipo 01",
});

const ROOM = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map(person);

describe("floorSpan", () => {
  it("narrows toward the camera, because the room is isometric", () => {
    const back = floorSpan(BACK);
    const front = floorSpan(FRONT);
    expect(back.right - back.left).toBeGreaterThan(front.right - front.left);
  });

  it("stays inside the plate at every depth of the standing band", () => {
    for (let y = BACK; y <= FRONT; y += 0.01) {
      const { left, right } = floorSpan(y);
      expect(left).toBeGreaterThan(0);
      expect(right).toBeLessThan(1);
      expect(right).toBeGreaterThan(left);
    }
  });

  it("keeps the floor centred where the art centres it", () => {
    // The measured centre of the room's floor sits just right of the middle.
    for (const y of [BACK, (BACK + FRONT) / 2, FRONT]) {
      const { left, right } = floorSpan(y);
      expect((left + right) / 2).toBeCloseTo(0.523, 2);
    }
  });
});

describe("spriteHeightFraction", () => {
  it("keeps a clear depth cue across the standing band", () => {
    // The handoff's 46px..82px is 1.78x. Anything near that reads as depth;
    // flat would make the room a sticker sheet.
    const ratio = spriteHeightFraction(FRONT) / spriteHeightFraction(BACK);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2);
  });

  it("grows with depth, never shrinks", () => {
    for (let y = BACK; y < FRONT - 0.01; y += 0.01) {
      expect(spriteHeightFraction(y + 0.01)).toBeGreaterThan(
        spriteHeightFraction(y)
      );
    }
  });
});

describe("placeInRoom", () => {
  it("handles an empty room without crashing", () => {
    expect(placeInRoom([])).toEqual([]);
  });

  it("places everyone exactly once", () => {
    const placed = placeInRoom(ROOM);
    expect(placed).toHaveLength(ROOM.length);
    expect(new Set(placed.map((p) => p.participant.id)).size).toBe(ROOM.length);
  });

  it("is deterministic — a sprite never teleports between renders", () => {
    expect(placeInRoom(ROOM)).toEqual(placeInRoom(ROOM));
  });

  it("stands everyone ON the floor, never on a wall or the furniture", () => {
    // The one that matters. The floor is an octagon painted into the art, so a
    // placement outside floorSpan at that depth is a person standing on a desk.
    for (const spot of placeInRoom(ROOM)) {
      const { left, right } = floorSpan(spot.y);
      expect(spot.x).toBeGreaterThanOrEqual(left);
      expect(spot.x).toBeLessThanOrEqual(right);
      expect(spot.y).toBeGreaterThanOrEqual(BACK);
      expect(spot.y).toBeLessThanOrEqual(FRONT);
    }
  });

  it("returns back-to-front so painting order gives free depth sorting", () => {
    const ys = placeInRoom(ROOM).map((p) => p.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it("derives height from the placed depth", () => {
    for (const spot of placeInRoom(ROOM)) {
      expect(spot.height).toBe(spriteHeightFraction(spot.y));
    }
  });

  it("staggers idle delays so the room does not pulse in unison", () => {
    const delays = placeInRoom(ROOM).map((p) => p.idleDelay);
    expect(new Set(delays).size).toBeGreaterThan(1);
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(2.4);
    }
  });

  it("does not stack two sprites on the same spot", () => {
    const spots = placeInRoom(ROOM);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const dx = Math.abs(spots[i].x - spots[j].x);
        const dy = Math.abs(spots[i].y - spots[j].y);
        expect(dx + dy).toBeGreaterThan(0.004);
      }
    }
  });

  it("still fits everyone when the real ~100-person roster shows up", () => {
    const crowd = Array.from({ length: 100 }, (_, i) => person(`p${i}`));
    const spots = placeInRoom(crowd);
    expect(spots).toHaveLength(100);
    for (const spot of spots) {
      const { left, right } = floorSpan(spot.y);
      expect(spot.x).toBeGreaterThanOrEqual(left);
      expect(spot.x).toBeLessThanOrEqual(right);
    }
  });
});

describe("roomColumns", () => {
  it("splits the roster across the four depth rows", () => {
    expect(roomColumns(9)).toBe(3);
    expect(roomColumns(100)).toBe(25);
  });

  it("never collapses below one column", () => {
    expect(roomColumns(0)).toBe(1);
    expect(roomColumns(1)).toBe(1);
  });
});

describe("isLens", () => {
  it("accepts the three lenses and nothing else", () => {
    expect(isLens("romantic")).toBe(true);
    expect(isLens("business")).toBe(true);
    expect(isLens("friendship")).toBe(true);
    expect(isLens("ROMANTIC")).toBe(false);
    expect(isLens("")).toBe(false);
    expect(isLens(undefined)).toBe(false);
    expect(isLens(42)).toBe(false);
  });
});
