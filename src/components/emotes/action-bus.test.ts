import { describe, expect, it, vi } from "vitest";
import {
  type ActionSignal,
  dispatchAction,
  fireEvent,
  subscribeAction,
} from "./action-bus";

/**
 * The action bus (sibling of the emote bus).
 *
 * The behaviour that matters: `fireEvent(evento, accion)` reaches a subscriber
 * with the action and the pair, a bare event resolves its action through the
 * domain mapping, and an event that maps to nothing stays silent — a screen
 * that plays the wrong reveal because a no-op leaked is the failure this guards.
 */

const PAIR = {
  a: { id: "a", name: "Oso", faceUrl: "data:,a" },
  b: { id: "b", name: "Zorro", faceUrl: "data:,b" },
  childFaceUrl: "data:,baby",
};

describe("action-bus", () => {
  it("delivers a directly dispatched action with its pair", () => {
    const seen: ActionSignal[] = [];
    const off = subscribeAction((s) => seen.push(s));
    dispatchAction("babyOnBoard", { evento: "kid", pair: PAIR });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].action).toBe("babyOnBoard");
    expect(seen[0].pair?.a.name).toBe("Oso");
  });

  it("fireEvent('kid', 'babyOnBoard') reaches the subscriber", () => {
    const handler = vi.fn();
    const off = subscribeAction(handler);
    fireEvent("kid", "babyOnBoard", PAIR);
    off();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].action).toBe("babyOnBoard");
  });

  it("fireEvent('kid') alone resolves babyOnBoard through the mapping", () => {
    const handler = vi.fn();
    const off = subscribeAction(handler);
    fireEvent("kid");
    off();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].action).toBe("babyOnBoard");
  });

  it("a life beat that maps to no action is a silent no-op", () => {
    const handler = vi.fn();
    const off = subscribeAction(handler);
    fireEvent("job");
    off();
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribing stops delivery", () => {
    const handler = vi.fn();
    const off = subscribeAction(handler);
    off();
    fireEvent("kid", "babyOnBoard", PAIR);
    expect(handler).not.toHaveBeenCalled();
  });
});
