import { describe, expect, it } from "vitest";
import { FACE_GUIDE } from "./photo-frame";

/**
 * The guide is drawn from these four numbers and will be cropped from them
 * later, so what matters is that the oval stays inside the square and keeps the
 * head where a head goes (issue #47).
 */
describe("FACE_GUIDE", () => {
  it("draws an oval that fits inside the square", () => {
    expect(FACE_GUIDE.centerX - FACE_GUIDE.radiusX).toBeGreaterThanOrEqual(0);
    expect(FACE_GUIDE.centerX + FACE_GUIDE.radiusX).toBeLessThanOrEqual(1);
    expect(FACE_GUIDE.centerY - FACE_GUIDE.radiusY).toBeGreaterThanOrEqual(0);
    expect(FACE_GUIDE.centerY + FACE_GUIDE.radiusY).toBeLessThanOrEqual(1);
  });

  it("sits above the middle and is taller than it is wide", () => {
    expect(FACE_GUIDE.centerY).toBeLessThan(0.5);
    expect(FACE_GUIDE.radiusY).toBeGreaterThan(FACE_GUIDE.radiusX);
  });

  it("spans roughly 60 % of the width, as the intake square is drawn", () => {
    expect(FACE_GUIDE.radiusX * 2).toBeCloseTo(0.6, 2);
  });
});
