import { describe, expect, it, vi } from "vitest";
import { dispatchEmote, reactToEvent, subscribeEmote } from "./emote-bus";

describe("emote bus", () => {
  it("delivers a reaction only to the participant it names", () => {
    const ana = vi.fn();
    const beto = vi.fn();
    const offAna = subscribeEmote("ana", ana);
    const offBeto = subscribeEmote("beto", beto);

    reactToEvent("ana", "match");

    expect(ana).toHaveBeenCalledWith("celebrate", { loop: undefined });
    expect(beto).not.toHaveBeenCalled();
    offAna();
    offBeto();
  });

  it("stops delivering after unsubscribe", () => {
    const ana = vi.fn();
    const off = subscribeEmote("ana", ana);
    off();

    dispatchEmote("ana", "wave");

    expect(ana).not.toHaveBeenCalled();
  });

  it("maps the event to the emote, so callers never name a sheet", () => {
    const ana = vi.fn();
    const off = subscribeEmote("ana", ana);

    reactToEvent("ana", "rejection");
    reactToEvent("ana", "greeting");

    expect(ana.mock.calls.map((c) => c[0])).toEqual(["cry", "wave"]);
    off();
  });

  it("carries a loop request through to the listener", () => {
    const ana = vi.fn();
    const off = subscribeEmote("ana", ana);

    dispatchEmote("ana", "walk-back", { loop: true });

    expect(ana).toHaveBeenCalledWith("walk-back", { loop: true });
    off();
  });
});
