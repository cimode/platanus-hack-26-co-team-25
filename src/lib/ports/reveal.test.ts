import { describe, expect, it } from "vitest";
import type { PersonProfile } from "../domain/reveal/profile";
import type { RankedRoom } from "../domain/reveal/rank";
import type { LatentSource } from "./latent-source";
import type { ProfilePort } from "./profile";
import type { RankingPort } from "./ranking";

/**
 * The three read contracts, exercised through in-memory fakes -- which is the
 * point of them: a use case must be testable with no adapter, no database and
 * no LLM. The `@ts-expect-error` probes are the half of this file that only
 * `pnpm run typecheck` can run; if one of them ever stops erroring, tsc fails
 * with "Unused '@ts-expect-error' directive" and the guard cannot rot quietly.
 */

const RANKED: RankedRoom = {
  status: "ranked",
  lens: "romantic",
  viewer: { id: "ana", name: "Ana Ramírez" },
  entries: [
    {
      id: "sofia",
      name: "Sofía Guzmán",
      photoUrl: null,
      position: 1,
      band: "high",
      bond: { term: "commonGround", label: "Gustos en común" },
      friction: null,
    },
  ],
};

const PROFILE: PersonProfile = {
  id: "sofia",
  name: "Sofía Guzmán",
  photoUrl: null,
  team: "equipo 03",
  tags: ["ramen"],
  standing: {
    position: 1,
    band: "high",
    bond: { term: "commonGround", label: "Gustos en común" },
    friction: null,
  },
};

describe("RankingPort", () => {
  const ranking: RankingPort = {
    async forSubject(subjectId, lens) {
      return {
        ...RANKED,
        lens,
        viewer: { id: subjectId, name: "Ana Ramírez" },
      };
    },
  };

  it("hands back the ranking of the subject it was asked for", async () => {
    const room = await ranking.forSubject("ana", "business");
    expect(room.status).toBe("ranked");
    if (room.status !== "ranked") throw new Error("unreachable");
    expect(room.viewer.id).toBe("ana");
    expect(room.lens).toBe("business");
    expect(room.entries.map((e) => e.id)).toEqual(["sofia"]);
  });

  it("has no forRoom(): a rank is unaddressable without a viewer", () => {
    // @ts-expect-error -- there is no forRoom(roomId, lens) on any of the
    // three ports. "A ranking is visible only to the person who ran it"
    // (CONTEXT.md §3) is a property of the type here, not a convention some
    // future caller can forget. AC-PORT-2.
    const absent = ranking.forRoom;
    expect(absent).toBeUndefined();
  });
});

describe("ProfilePort", () => {
  // Suppressed, gate-failed, non-consenting and nonexistent all leave through
  // the SAME `null`, so the caller cannot tell them apart and therefore cannot
  // disclose which one it was (AC-PROF-2).
  const profiles: ProfilePort = {
    async byId(personId, viewerId, lens) {
      const inViewersRank =
        personId === "sofia" && viewerId === "ana" && lens === "friendship";
      return inViewersRank ? PROFILE : null;
    },
  };

  it("returns the profile of someone in the viewer's own rank", async () => {
    const found = await profiles.byId("sofia", "ana", "friendship");
    expect(found?.name).toBe("Sofía Guzmán");
    expect(found?.standing.position).toBe(1);
  });

  it("returns the same null for every reason a person is unreachable", async () => {
    // Unknown id, wrong viewer, and a lens this person is not in: one value,
    // three causes, no way to distinguish them from outside.
    expect(await profiles.byId("nobody", "ana", "friendship")).toBeNull();
    expect(await profiles.byId("sofia", "bruno", "friendship")).toBeNull();
    expect(await profiles.byId("sofia", "ana", "romantic")).toBeNull();
  });

  it("has no byId(personId) that omits the viewer", () => {
    type ByIdArgs = Parameters<ProfilePort["byId"]>;
    // @ts-expect-error -- byId takes THREE arguments. The URL segment is the
    // OTHER person; the viewer comes from the cookie resolver and never from
    // the request path. AC-PORT-2.
    const missingViewer: ByIdArgs = ["sofia"];
    expect(missingViewer).toHaveLength(1);
  });
});

describe("LatentSource", () => {
  // The ONLY value this change is permitted to fabricate. Named as its own
  // port so #7's LatentRepository replaces it by changing one line in
  // composition.ts (AC-PORT-4).
  const latents: LatentSource = {
    async byParticipants(ids) {
      return new Map(
        ids.map((id) => [id, { regulation: { mean: 0.62, se: 0.11 } }])
      );
    },
  };

  it("answers for every id in one call", async () => {
    const posteriors = await latents.byParticipants(["ana", "sofia"]);
    expect([...posteriors.keys()]).toEqual(["ana", "sofia"]);
    expect(posteriors.get("ana")?.regulation?.mean).toBe(0.62);
  });

  it("may leave a pillar out, so the engine imputes its prior", async () => {
    // Partial, not Record: a missing latent is the engine's degraded mode
    // (PRIOR_MEAN / PRIOR_SE, AUDIT.md S15), not a zero.
    const posteriors = await latents.byParticipants(["ana"]);
    expect(posteriors.get("ana")?.agency).toBeUndefined();
  });
});

describe("the non-ranked variants carry nothing to render", () => {
  it("has no entries on below-floor, so an empty row cannot be faked", () => {
    const belowFloor: RankedRoom = { status: "below-floor", lens: "romantic" };
    // @ts-expect-error -- `entries` exists only on the "ranked" variant.
    // AC-RANK-5: a viewer below the floor must be told which step to go back
    // to, not shown an empty rank row as if the room were empty.
    const absent = belowFloor.entries;
    expect(absent).toBeUndefined();
  });
});
