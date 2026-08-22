import { describe, expect, it } from "vitest";
import { filterParticipants, type Participant } from "./participant";

const ROSTER: readonly Participant[] = [
  { id: "a", name: "Ana Ramírez", team: "equipo 03" },
  { id: "f", name: "Fernanda López", team: "equipo 11" },
  { id: "s", name: "Sofía Guzmán", team: "equipo 03" },
  { id: "t", name: "Tomás Álvarez", team: "equipo 25" },
];

const names = (list: readonly Participant[]) => list.map((p) => p.name);

describe("filterParticipants", () => {
  it("returns the whole roster for an empty query", () => {
    expect(filterParticipants(ROSTER, "")).toHaveLength(4);
    expect(filterParticipants(ROSTER, "   ")).toHaveLength(4);
  });

  it("ranks prefix matches above substring matches", () => {
    // Three names contain "an" -- Ana, Fernanda, and Guzmán -- but only Ana
    // starts with it, so Ana must lead. Matching mid-word is deliberate:
    // people search by surname as readily as by first name.
    expect(names(filterParticipants(ROSTER, "an"))).toEqual([
      "Ana Ramírez",
      "Fernanda López",
      "Sofía Guzmán",
    ]);
  });

  it("matches without accents, in both directions", () => {
    // Typing plain ASCII must find the accented name -- on a Spanish roster
    // that is most of the room.
    expect(names(filterParticipants(ROSTER, "sofia"))).toEqual([
      "Sofía Guzmán",
    ]);
    expect(names(filterParticipants(ROSTER, "tomas"))).toEqual([
      "Tomás Álvarez",
    ]);
    // And an accented query must still find its own name.
    expect(names(filterParticipants(ROSTER, "Sofía"))).toEqual([
      "Sofía Guzmán",
    ]);
  });

  it("ignores case", () => {
    expect(names(filterParticipants(ROSTER, "ANA"))).toEqual(["Ana Ramírez"]);
  });

  it("matches on team as a substring match, never as a prefix one", () => {
    const found = filterParticipants(ROSTER, "equipo 03");
    expect(names(found)).toEqual(["Ana Ramírez", "Sofía Guzmán"]);
  });

  it("returns nothing when no one matches", () => {
    expect(filterParticipants(ROSTER, "zzz")).toEqual([]);
  });

  it("does not mutate the roster it was given", () => {
    const before = [...ROSTER];
    filterParticipants(ROSTER, "an");
    expect(ROSTER).toEqual(before);
  });

  it("copies rather than aliases on the empty-query path", () => {
    const all = filterParticipants(ROSTER, "");
    all.pop();
    expect(ROSTER).toHaveLength(4);
  });
});
