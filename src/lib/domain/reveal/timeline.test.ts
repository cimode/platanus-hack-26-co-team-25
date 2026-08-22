/**
 * Half of this file only runs under `pnpm run typecheck`.
 *
 * `import type` is ERASED by the vitest transform, so a probe written as an
 * `@ts-expect-error` is invisible to `vitest run` -- and so is a missing
 * module. tsc is the layer this contract lives at: it reports TS2307 when the
 * module is absent and TS2578 "Unused '@ts-expect-error' directive" the moment
 * a probe stops erroring, which is the strongest red available for a type.
 *
 * The reads below are written as FUNCTIONS taking the union, because a
 * `const x: SimulatedLife = {...}` is narrowed by control flow at its own
 * declaration and would make the probes pass for the wrong reason. A parameter
 * is not narrowed -- which is exactly the position a component is in.
 */
import { describe, expect, it } from "vitest";
import type {
  Ending,
  FriendshipTimeline,
  LifeEvent,
  PairedTimeline,
  SimulatedLife,
} from "./timeline";

const EVENTS: readonly LifeEvent[] = [
  { year: 1, kind: "milestone", text: "Se cruzan en la fila del café." },
  { year: 4, kind: "trip", text: "Un fin de semana en la costa." },
];

const PAIRED: PairedTimeline = {
  lens: "romantic",
  subject: { id: "ana", name: "Ana Ramírez" },
  other: { id: "sofia", name: "Sofía Guzmán", photoUrl: null },
  horizonYears: 9,
  events: EVENTS,
  ending: { outcome: "apart", year: 6, epilogue: "Se siguen saludando." },
};

const FRIENDS: FriendshipTimeline = {
  lens: "friendship",
  subject: { id: "ana", name: "Ana Ramírez" },
  other: { id: "bruno", name: "Bruno Cortés", photoUrl: null },
  events: EVENTS,
};

describe("SimulatedLife is a union discriminated on lens", () => {
  it("AC-SIM-3 · the paired branch carries the horizon as data", () => {
    expect(PAIRED.horizonYears).toBe(9);
    expect(PAIRED.events.map((event) => event.year)).toEqual([1, 4]);
  });

  it("AC-SIM-4 · the friendship branch has no horizon at runtime either", () => {
    const life: SimulatedLife = FRIENDS;
    expect("horizonYears" in life).toBe(false);
    expect("ending" in life).toBe(false);
    expect(life.events).toHaveLength(2);
  });

  it("AC-SIM-4 · reading the horizon off the friendship branch fails tsc", () => {
    const readHorizon = (life: FriendshipTimeline) =>
      // @ts-expect-error -- PILLARS.md §6.1: a friendship makes no duration
      // claim, so the branch has no `horizonYears` to read. The design's
      // `horizonYears: number | null` was rejected here -- a nullable field
      // cannot fail tsc, and this criterion requires that it does.
      life.horizonYears;
    expect(readHorizon(FRIENDS)).toBeUndefined();
  });

  it("AC-SIM-4 · the union refuses the read until the lens is checked", () => {
    const readHorizon = (life: SimulatedLife) =>
      // @ts-expect-error -- not a property of every branch. A component that
      // forgets to check the lens does not quietly receive `undefined` and
      // render "Año 1 de undefined" -- it does not compile.
      life.horizonYears;
    // The value IS there at runtime. The type is the only thing withholding
    // it, which is the whole point of AC-SIM-4.
    expect(readHorizon(PAIRED)).toBe(9);
  });

  it("AC-SIM-4 · the friendship branch has no ending to narrate", () => {
    const readEnding = (life: FriendshipTimeline) =>
      // @ts-expect-error -- no `Ending`, so no dissolution card and no
      // epilogue can be rendered for a friendship even by accident.
      life.ending;
    expect(readEnding(FRIENDS)).toBeUndefined();
  });

  it("AC-PORT-3 · admits no compatibility figure", () => {
    const scored: PairedTimeline = {
      ...PAIRED,
      // @ts-expect-error -- no `rank`, no `sim`, no percentage. The engine's
      // floats stop in the adapter (design D3); what the type cannot carry,
      // no serialiser and no RSC payload can leak.
      sim: 0.82,
    };
    expect(scored.lens).toBe("romantic");
  });
});

describe("Ending makes the epilogue reachable only after a dissolution", () => {
  it("AC-SIM-6 · apart names the year and may carry an epilogue", () => {
    const ending: Ending = PAIRED.ending;
    if (ending.outcome !== "apart") throw new Error("unreachable");
    expect(ending.year).toBe(6);
    expect(ending.epilogue).toBe("Se siguen saludando.");
  });

  it("AC-SIM-6 · together names no year, so no card can invent one", () => {
    const readYear = (ending: Extract<Ending, { outcome: "together" }>) =>
      // @ts-expect-error -- a pair that reached the horizon has no
      // dissolution year.
      ending.year;
    expect(readYear({ outcome: "together" })).toBeUndefined();
  });

  it("AC-SIM-6 · together carries no epilogue either", () => {
    const readEpilogue = (ending: Extract<Ending, { outcome: "together" }>) =>
      // @ts-expect-error -- R4: the epilogue is the beat AFTER a dissolution.
      // Reachable on `apart` and nowhere else.
      ending.epilogue;
    expect(readEpilogue({ outcome: "together" })).toBeUndefined();
  });

  it("AC-SIM-6 · an apart ending may have no epilogue at all", () => {
    const ending: Ending = { outcome: "apart", year: 3, epilogue: null };
    if (ending.outcome !== "apart") throw new Error("unreachable");
    expect(ending.epilogue).toBeNull();
    expect(ending.year).toBe(3);
  });
});
