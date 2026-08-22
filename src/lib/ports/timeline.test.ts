/**
 * `TimelinePort` through an in-memory fake -- which is the point of the port:
 * `simulateLife` must be testable with no adapter, no fixture and no LLM.
 *
 * The `@ts-expect-error` probes here only run under `pnpm run typecheck`. Under
 * `vitest run` they are erased along with the type imports, so a green suite
 * proves nothing about them; TS2578 "Unused '@ts-expect-error' directive" on
 * the typecheck is what stops them rotting into decoration.
 */
import { describe, expect, it } from "vitest";
import type { SimulatedLife } from "../domain/reveal/timeline";
import type { TimelinePort } from "./timeline";

const ROMANTIC: SimulatedLife = {
  lens: "romantic",
  subject: { id: "ana", name: "Ana Ramírez" },
  other: { id: "sofia", name: "Sofía Guzmán", photoUrl: null },
  horizonYears: 11,
  events: [{ year: 1, kind: "milestone", text: "Se quedan hasta el cierre." }],
  ending: { outcome: "together" },
};

const FRIENDSHIP: SimulatedLife = {
  lens: "friendship",
  subject: { id: "ana", name: "Ana Ramírez" },
  other: { id: "bruno", name: "Bruno Cortés", photoUrl: null },
  events: [{ year: 2, kind: "vignette", text: "Se cruzan en otra charla." }],
};

/** What `simulate` takes, derived from the port so it cannot drift from it. */
type SimulateInput = Parameters<TimelinePort["simulate"]>[0];

/** Who is in whose rank, per lens. Everything else leaves through `null`. */
const RANKED: Record<string, SimulatedLife> = {
  "ana|sofia|romantic": ROMANTIC,
  "ana|bruno|friendship": FRIENDSHIP,
};

const timelines: TimelinePort = {
  async simulate({ subjectId, otherId, lens }) {
    // Self-simulation is not a special error, it is just another miss: it has
    // to be indistinguishable from an unknown id (AC-SIM-2).
    if (otherId === subjectId) return null;
    return RANKED[`${subjectId}|${otherId}|${lens}`] ?? null;
  },
};

describe("TimelinePort", () => {
  it("AC-SIM-1 · simulates a pair that is in the viewer's own ranking", async () => {
    const life = await timelines.simulate({
      subjectId: "ana",
      otherId: "sofia",
      lens: "romantic",
    });
    if (life === null) throw new Error("unreachable");
    expect(life.subject.name).toBe("Ana Ramírez");
    expect(life.other.name).toBe("Sofía Guzmán");
    expect(life.events.length).toBeGreaterThan(0);
  });

  it("AC-SIM-2 · every unreachable pair leaves through the same null", async () => {
    // Unknown id, a real person outside this viewer's ranked set under this
    // lens, and the viewer themselves. One value, four causes, no way to tell
    // them apart from outside -- which is what makes the 404s byte-identical.
    const nobody: SimulateInput = {
      subjectId: "ana",
      otherId: "nadie",
      lens: "romantic",
    };
    const otherLens: SimulateInput = {
      subjectId: "ana",
      otherId: "sofia",
      lens: "business",
    };
    const otherViewer: SimulateInput = {
      subjectId: "bruno",
      otherId: "sofia",
      lens: "romantic",
    };
    const self: SimulateInput = {
      subjectId: "ana",
      otherId: "ana",
      lens: "romantic",
    };

    expect(await timelines.simulate(nobody)).toBeNull();
    expect(await timelines.simulate(otherLens)).toBeNull();
    expect(await timelines.simulate(otherViewer)).toBeNull();
    expect(await timelines.simulate(self)).toBeNull();
  });

  it("AC-SIM-4 · the friendship branch survives the port boundary", async () => {
    const life = await timelines.simulate({
      subjectId: "ana",
      otherId: "bruno",
      lens: "friendship",
    });
    if (life === null) throw new Error("unreachable");
    if (life.lens !== "friendship") throw new Error("unreachable");
    expect(life.events[0].kind).toBe("vignette");

    const readHorizon = (friendship: typeof life) =>
      // @ts-expect-error -- the union crosses the port intact, so a page that
      // awaited this call still cannot read a horizon off a friendship.
      friendship.horizonYears;
    expect(readHorizon(life)).toBeUndefined();
  });

  it("AC-PORT-2 · cannot be called without naming the subject", async () => {
    const result = await timelines.simulate(
      // @ts-expect-error -- `subjectId` is required. The viewer comes from the
      // cookie resolver; the URL segment is the OTHER person and never the
      // viewer, so a call shaped like this must not compile.
      { otherId: "sofia", lens: "romantic" }
    );
    expect(result).toBeNull();
  });

  it("AC-PORT-2 · has no simulate(roomId, lens) that omits the viewer", () => {
    // @ts-expect-error -- there is no forRoom()-shaped method on this port.
    // "A simulation is visible only to the person who ran it" is a property
    // of the type, not a convention a future caller can forget.
    const absent = timelines.forRoom;
    expect(absent).toBeUndefined();
  });
});
