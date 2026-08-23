import { describe, expect, it } from "vitest";
import type { EmoteSheet } from "./emotes";
import { fallbackMs, frameBox, playback } from "./geometry";

const sheet: EmoteSheet = {
  src: "/sprites/emotes/avatar1/celebrate.webp",
  frames: 48,
  frameWidth: 67,
  frameHeight: 133,
  fps: 12,
  bodyFraction: 0.8,
  feetFraction: 0.92,
  model: "test",
  floor: "strip",
  bytes: 1,
};

describe("frameBox", () => {
  it("grows the plate height by the headroom and drops the feet to the floor line", () => {
    const box = frameBox(sheet, "96px");
    expect(box.height).toBe("calc(96px / 0.8)");
    expect(box.aspectRatio).toBeCloseTo(67 / 133);
    expect(box.translateY).toBe("8.00%");
    expect(box.backgroundSize).toBe("4800% 100%");
  });

  it("keeps whatever unit the screen sizes in", () => {
    expect(frameBox(sheet, "12cqh").height).toBe("calc(12cqh / 0.8)");
    expect(frameBox(sheet, "6rem").height).toBe("calc(6rem / 0.8)");
  });
});

describe("playback", () => {
  it("steps once per frame and plays a reaction exactly once", () => {
    const play = playback(sheet);
    expect(play.animation).toBe("emote 4s steps(48) 1 none");
    expect(play.seconds).toBe(4);
    expect(play.loop).toBe(false);
  });

  it("loops locomotion sheets by default and on request", () => {
    expect(playback({ ...sheet, loop: true }).animation).toContain("infinite");
    expect(playback(sheet, { loop: true }).animation).toContain("infinite");
    expect(
      playback({ ...sheet, loop: true }, { loop: false }).animation
    ).toContain(" 1 ");
  });
});

describe("fallbackMs", () => {
  it("ends a one-shot half a second after the clip, and never ends a loop", () => {
    expect(fallbackMs(sheet, false)).toBe(4500);
    expect(fallbackMs(sheet, true)).toBeNull();
  });
});
