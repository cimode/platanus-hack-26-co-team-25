import { describe, expect, it } from "vitest";
import { DRAG_SLOP, initialScrollLeft, isDrag } from "./use-drag-scroll";

/**
 * The only part of `useDragScroll` that is a function of its inputs rather than
 * of a live DOM node.
 *
 * vitest runs in the `node` environment here (`vitest.config.mts`) -- no jsdom,
 * no rendering -- which is the right call for an engine-shaped codebase and
 * means the hook's wiring cannot be unit-tested. So the arithmetic is pulled
 * out and pinned here, and the wiring is pinned by `e2e/demo-path.spec.ts`.
 * Neither half is optional: the numbers below are what decides whether the room
 * greets you with people or with a window frame.
 */
describe("initialScrollLeft", () => {
  it('"start" pins to the left wall regardless of overflow', () => {
    expect(initialScrollLeft(3000, 390, "start")).toBe(0);
    expect(initialScrollLeft(390, 390, "start")).toBe(0);
  });

  it('"center" puts the midpoint of the content under the midpoint of the box', () => {
    expect(initialScrollLeft(3000, 390, "center")).toBe(1305);
    expect(initialScrollLeft(1280, 1280, "center")).toBe(0);
  });

  it("never returns a negative offset when the content does not overflow", () => {
    // A browser clamps a negative assignment to 0, so a wrong sign here is
    // invisible in the room and very visible in a jsdom-less unit test.
    expect(initialScrollLeft(200, 390, "center")).toBe(0);
    expect(initialScrollLeft(0, 390, "center")).toBe(0);
  });

  it("is exact, not rounded, on an odd overflow", () => {
    // `scrollLeft` accepts fractions; rounding here would put the room half a
    // pixel off centre on every odd-width plate, which is a difference nobody
    // can see and everybody would have to re-derive later.
    expect(initialScrollLeft(1001, 390, "center")).toBe(305.5);
  });
});

/**
 * The line between a click and a drag.
 *
 * This exists because the hook used to capture the pointer on `pointerdown`,
 * which retargets the following click to the SCROLLER -- so a <Link> inside a
 * drag-scrolled strip could never be clicked with a mouse, while touch (which
 * never captures here) and the keyboard both worked. Capture now waits for the
 * gesture to prove itself, and this is the proof.
 */
describe("isDrag", () => {
  it("a press that does not move is not a drag", () => {
    expect(isDrag(100, 100)).toBe(false);
  });

  it("the wobble of a hand pressing a button is not a drag", () => {
    // Inclusive at the slop: `DRAG_SLOP` px of travel is still a click, so a
    // shaky press on a card opens the card instead of nudging the row.
    expect(isDrag(100, 100 + DRAG_SLOP)).toBe(false);
    expect(isDrag(100, 100 - DRAG_SLOP)).toBe(false);
  });

  it("one pixel past the slop is a drag, in either direction", () => {
    expect(isDrag(100, 100 + DRAG_SLOP + 1)).toBe(true);
    expect(isDrag(100, 100 - DRAG_SLOP - 1)).toBe(true);
  });

  it("measures against the drag's ORIGIN, not the last position", () => {
    // The hook keeps `startX` for the whole gesture; a version that compared
    // against the previous move would never cross the slop on a slow drag.
    expect(isDrag(0, 3)).toBe(false);
    expect(isDrag(0, 6)).toBe(true);
  });
});
