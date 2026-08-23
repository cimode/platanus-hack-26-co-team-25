import { describe, expect, it } from "vitest";
import { AVATARS, avatarFor, avatarSprite, isAvatar } from "./avatar";

describe("avatarFor", () => {
  it("dresses M from the masculine pair and F from the feminine pair", () => {
    for (let i = 0; i < 40; i++) {
      expect(["avatar1", "avatar2"]).toContain(avatarFor("M", `seed-${i}`));
      expect(["avatar3", "avatar4"]).toContain(avatarFor("F", `seed-${i}`));
    }
  });

  it("lets NB wear any of the four", () => {
    const worn = new Set<string>();
    for (let i = 0; i < 80; i++) worn.add(avatarFor("NB", `seed-${i}`));
    expect([...worn].sort()).toEqual([...AVATARS]);
  });

  it("uses both plates of a pair across a room, and the same plate for the same seed", () => {
    const worn = new Set<string>();
    for (let i = 0; i < 40; i++)
      worn.add(avatarFor("M", `Persona ${i}|1999-01-0${i % 9}`));
    expect(worn.size).toBe(2);
    expect(avatarFor("F", "Ana|1998-04-17")).toBe(
      avatarFor("F", "Ana|1998-04-17")
    );
  });
});

describe("isAvatar / avatarSprite", () => {
  it("accepts the four plates and nothing else", () => {
    for (const avatar of AVATARS) expect(isAvatar(avatar)).toBe(true);
    expect(isAvatar("avatar5")).toBe(false);
    expect(isAvatar(null)).toBe(false);
    expect(isAvatar(3)).toBe(false);
  });

  it("points at the plate under public/sprites", () => {
    expect(avatarSprite("avatar3")).toBe("/sprites/avatar3.png");
  });
});
