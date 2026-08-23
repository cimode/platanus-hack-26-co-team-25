import { describe, expect, it } from "vitest";
import {
  AVATARS,
  availableEmotes,
  avatarKey,
  EMOTES,
  emoteForEvent,
  emoteSeconds,
  emoteSheet,
  emoteSheets,
  isEmote,
  plateUrl,
  ROOM_EVENTS,
} from "./emotes";
import { EMOTE_MANIFEST } from "./emotes.manifest";

describe("emoteForEvent", () => {
  it("maps every room event to a known emote", () => {
    for (const kind of ROOM_EVENTS)
      expect(isEmote(emoteForEvent(kind))).toBe(true);
  });

  it("celebrates a match, waves at a greeting, cries at a rejection", () => {
    expect(emoteForEvent("match")).toBe("celebrate");
    expect(emoteForEvent("greeting")).toBe("wave");
    expect(emoteForEvent("rejection")).toBe("cry");
  });

  it("gets angry at friction, fights a clash, is defeated by a loss, falls for a crush", () => {
    expect(emoteForEvent("friction")).toBe("angry");
    expect(emoteForEvent("clash")).toBe("fight");
    expect(emoteForEvent("loss")).toBe("defeat");
    expect(emoteForEvent("crush")).toBe("love");
  });

  it("walks away on a departure and trudges off on a heartbreak", () => {
    expect(emoteForEvent("departure")).toBe("walk-back");
    expect(emoteForEvent("heartbreak")).toBe("sad-walk-left");
  });

  it("offers the thirteen sheets the room was asked for", () => {
    expect([...EMOTES].sort()).toEqual(
      [
        "angry",
        "celebrate",
        "cry",
        "defeat",
        "fight",
        "love",
        "sad-walk-left",
        "sad-walk-right",
        "walk",
        "walk-back",
        "walk-left",
        "walk-right",
        "wave",
      ].sort()
    );
  });
});

describe("avatarKey", () => {
  it("reads the plate name off the sprite url or accepts the key itself", () => {
    expect(avatarKey("/sprites/avatar1.png")).toBe("avatar1");
    expect(avatarKey("/sprites/avatar4.png")).toBe("avatar4");
    expect(avatarKey("avatar2")).toBe("avatar2");
  });

  it("is null for anything that is not an authored plate", () => {
    expect(avatarKey("/venue.jpg")).toBeNull();
    expect(avatarKey("/sprites/avatar9.png")).toBeNull();
    expect(avatarKey("robot")).toBeNull();
  });

  it("round-trips through plateUrl", () => {
    for (const avatar of AVATARS)
      expect(avatarKey(plateUrl(avatar))).toBe(avatar);
  });
});

describe("the packed manifest", () => {
  it("only holds well-formed sheets under /sprites/emotes", () => {
    for (const [avatar, sheets] of Object.entries(EMOTE_MANIFEST)) {
      for (const [emote, sheet] of Object.entries(sheets)) {
        expect(isEmote(emote)).toBe(true);
        expect(sheet.src).toBe(`/sprites/emotes/${avatar}/${emote}.webp`);
        expect(sheet.frames).toBeGreaterThan(1);
        expect(sheet.frameWidth).toBeGreaterThan(0);
        expect(sheet.frameHeight).toBeGreaterThan(0);
        expect(sheet.fps).toBeGreaterThan(0);
        expect(sheet.bodyFraction).toBeGreaterThan(0);
        expect(sheet.bodyFraction).toBeLessThanOrEqual(1);
        expect(sheet.feetFraction).toBeGreaterThan(sheet.bodyFraction);
        expect(sheet.feetFraction).toBeLessThanOrEqual(1);
      }
    }
  });

  it("covers the whole catalogue for every authored avatar", () => {
    for (const avatar of AVATARS) {
      expect(availableEmotes(avatar)).toEqual([...EMOTES]);
    }
  });

  it("draws every avatar with the same frame geometry and clock", () => {
    // Consistency between avatars is a contract, not a hope: every sheet of
    // every avatar comes out of the same canvas, crop, pixel scale and fps, so
    // `frameBox`/`playback` give identical on-screen scale and timing whoever
    // the user is wearing. A new plate that breaks this fails here, not on stage.
    const all = AVATARS.flatMap((avatar) => emoteSheets(avatar));
    const first = all[0];
    expect(first).toBeDefined();
    for (const sheet of all) {
      expect(sheet.frameWidth).toBe(first.frameWidth);
      expect(sheet.frameHeight).toBe(first.frameHeight);
      expect(sheet.fps).toBe(first.fps);
      expect(sheet.bodyFraction).toBe(first.bodyFraction);
      expect(sheet.feetFraction).toBe(first.feetFraction);
      expect(sheet.floor).toBe("strip");
    }
  });

  it("plays every one-shot for the same length on every avatar", () => {
    // Same gesture, same beat: two people reacting to one event finish
    // together. `pnpm emotes:normalize` pads the shorter clips with the idle
    // pose; loops are exempt because they never end on their own.
    for (const emote of EMOTES) {
      const sheets = AVATARS.map((a) => emoteSheet(a, emote));
      const seconds = sheets.map((s) => (s ? emoteSeconds(s) : Number.NaN));
      const spread = Math.max(...seconds) - Math.min(...seconds);
      const loops = sheets.some((s) => s?.loop);
      expect(spread, `${emote}: ${seconds.join(", ")}`).toBeLessThanOrEqual(
        loops ? 2 : 0
      );
    }
  });

  it("marks locomotion as loopable and left-facing walks as mirrors", () => {
    const walk = emoteSheet("avatar1", "walk-back");
    const left = emoteSheet("avatar1", "walk-left");
    expect(walk?.loop).toBe(true);
    expect(left?.mirrorOf).toBe("walk-right");
    expect(emoteSheet("avatar1", "celebrate")?.loop).toBeFalsy();
  });

  it("plays a sheet for frames / fps seconds", () => {
    const sheet = emoteSheet("/sprites/avatar1.png", "celebrate");
    expect(sheet).not.toBeNull();
    if (sheet) expect(emoteSeconds(sheet)).toBeCloseTo(sheet.frames / 12);
  });

  it("answers null, not a throw, for an emote nobody packed", () => {
    expect(emoteSheet("/sprites/avatar9.png", "celebrate")).toBeNull();
    expect(emoteSheet("/venue.jpg", "wave")).toBeNull();
    expect(emoteSheets("/venue.jpg")).toEqual([]);
    expect(availableEmotes("robot")).toEqual([]);
  });
});
