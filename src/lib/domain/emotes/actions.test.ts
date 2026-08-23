import { describe, expect, it } from "vitest";
import type { EventKind } from "../reveal/timeline";
import {
  ACTIONS,
  actionForEvent,
  emoteForLifeEvent,
  isAction,
} from "./actions";
import { isReactionEmote, REACTION_EMOTES } from "./emotes";

/**
 * The action catalogue and the `(evento → accion)` pairing.
 *
 * `babyOnBoard` is the reveal that plays when a simulated pair could have
 * children. The one behaviour worth pinning is that a `kid` beat maps to it and
 * nothing else does — an unreasoned mapping is how a room fires the wrong
 * animation on the wrong event.
 */

// Every life beat, so the "only kid maps" assertion is exhaustive rather than a
// spot check. Mirrors the EventKind union in domain/reveal/timeline.ts.
const EVENT_KINDS: readonly EventKind[] = [
  "milestone",
  "move",
  "job",
  "pet",
  "kid",
  "ritual",
  "trip",
  "conflict",
  "recovery",
  "venture",
  "client",
  "decision",
  "exit",
  "dissolution",
  "epilogue",
  "vignette",
];

describe("actions", () => {
  it("babyOnBoard is a real action; a stray string is not", () => {
    expect(ACTIONS).toContain("babyOnBoard");
    expect(isAction("babyOnBoard")).toBe(true);
    expect(isAction("celebrate")).toBe(false);
    expect(isAction(42)).toBe(false);
  });

  it("maps the kid beat to babyOnBoard and every other beat to null", () => {
    for (const kind of EVENT_KINDS) {
      const action = actionForEvent(kind);
      if (kind === "kid") expect(action).toBe("babyOnBoard");
      else expect(action).toBeNull();
    }
  });
});

describe("emoteForLifeEvent", () => {
  it("answers a real reaction emote for every life beat, never a loop", () => {
    for (const kind of EVENT_KINDS) {
      const emote = emoteForLifeEvent(kind);
      // A looping walk cycle would never return the avatar to its plate.
      expect(isReactionEmote(emote)).toBe(true);
      expect(REACTION_EMOTES).toContain(emote);
    }
  });

  it("is total: the union and the mapping's keys are the same set", () => {
    // Guards the Record from drifting behind EventKind at runtime as well as
    // at compile time -- a missing key would answer undefined here.
    for (const kind of EVENT_KINDS) {
      expect(emoteForLifeEvent(kind)).toBeDefined();
    }
  });

  it("reads the emotional register of the beat", () => {
    expect(emoteForLifeEvent("dissolution")).toBe("defeat");
    expect(emoteForLifeEvent("epilogue")).toBe("cry");
    expect(emoteForLifeEvent("conflict")).toBe("angry");
    expect(emoteForLifeEvent("decision")).toBe("fight");
    expect(emoteForLifeEvent("kid")).toBe("love");
    expect(emoteForLifeEvent("milestone")).toBe("celebrate");
  });

  it("gives the kid beat both a reveal and a reaction", () => {
    // The one beat that drives an action AND an emote at the same time.
    expect(actionForEvent("kid")).toBe("babyOnBoard");
    expect(emoteForLifeEvent("kid")).toBe("love");
  });
});
