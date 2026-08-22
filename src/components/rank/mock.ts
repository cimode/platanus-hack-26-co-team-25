import type { RankEntry, RankedRoom, ViewerId } from "@/lib/domain/reveal/rank";
import type { Lens } from "@/lib/domain/room/layout";

/**
 * Fixture data for screen 1c.
 *
 * MOCK, and it has an expiry date: **issue #10's `prepareResults` deletes this
 * file.** It is deliberately colocated with the screen that paints it rather
 * than hidden behind an adapter and a port -- a fixture with a port in front of
 * it looks like a swap that has already been designed, when the real swap is
 * #10 landing and one line in `src/lib/composition.ts` naming it. Deleting a
 * colocated mock is deleting one file and one import.
 *
 * It fabricates ONLY what the engine would compute: order, band, bond and
 * friction. Identity -- who the viewer is and who else is in the room -- comes
 * in from the caller, which resolves it through the real `ParticipantsPort`.
 * The previous version fabricated that too, hardcoding `p-diego-morales` and
 * its own seven names, so picking anyone else on screen 1a produced a ranking
 * that greeted the wrong person and listed the viewer among their own matches
 * (R12).
 */

/** What the caller must supply per person. The screen's own `RankEntry` minus everything the engine decides. */
export interface RankCandidate {
  readonly id: string;
  readonly name: string;
  readonly photoUrl: string | null;
  /** Optional because the ranking never shows it; screen 1d's profile does. */
  readonly team?: string | null;
}

/** Engine term names on the left, the Spanish the screen shows on the right. */
const BONDS = [
  { term: "lifeShape", label: "les une: ritmo de vida" },
  { term: "structural", label: "les une: mismos rituales" },
  { term: "regulation", label: "les une: cómo discuten" },
  { term: "commonGround", label: "les une: humor parecido" },
] as const;

const FRICTIONS = [
  { term: "commonGround", label: "roce: agendas opuestas" },
  { term: "lifeShape", label: "roce: planes de ciudad" },
  { term: "agency", label: "roce: quién decide" },
] as const;

/**
 * FNV-1a, copied from `domain/room/layout.ts` where it places the sprites.
 *
 * Copied rather than exported from there: that module belongs to the room and
 * to the other team's edits, and widening its public surface for a fixture that
 * #10 deletes is a worse trade than six duplicated lines.
 *
 * Determinism is the whole point. `/rank` is a Server Component, so a fixture
 * that reordered between calls would shuffle the room between the prerender and
 * the demo with nobody touching anything.
 */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The whole ranking, ordered.
 *
 * The lens is IN the hash, not decoration on top of it: the lens picker on
 * screen 1b promises that romantic, business and friendship are three different
 * readings of the same room, and a fixture that returned one order for all
 * three would make that promise a lie in the demo. The viewer is in it too, so
 * two people never see the same room.
 */
function affinity(lens: Lens, viewerId: string, personId: string): number {
  return hash(`${lens}:${viewerId}:${personId}`);
}

export function mockRankedRoom(
  lens: Lens,
  viewer: { readonly id: ViewerId; readonly name: string },
  candidates: readonly RankCandidate[]
): RankedRoom {
  // Defence, not decoration: you are never in your own ranking, and the caller
  // filtering correctly is not something this file should have to trust.
  const others = candidates.filter((person) => person.id !== viewer.id);

  const ordered = [...others].sort(
    (a, b) =>
      affinity(lens, viewer.id, b.id) - affinity(lens, viewer.id, a.id) ||
      a.id.localeCompare(b.id)
  );

  // Roughly the top 40% is the high band, and at least one person always is:
  // both pills have to exist for the filters to do anything and for AC-RANK-3
  // to have two computed backgrounds to compare.
  const highCount = Math.max(1, Math.round(ordered.length * 0.4));

  const entries: readonly RankEntry[] = ordered.map((person, index) => {
    const position = index + 1;
    return {
      id: person.id,
      name: person.name,
      photoUrl: person.photoUrl,
      position,
      band: index < highCount ? ("high" as const) : ("mid" as const),
      bond: BONDS[affinity(lens, viewer.id, person.id) % BONDS.length],
      // Keyed on POSITION rather than the hash, so every room of three or more
      // is guaranteed to contain both a card with friction and a card without.
      // AC-RANK-2 says the card must not collapse when friction is null, and a
      // probabilistic fixture would leave that branch untested some of the time.
      friction:
        position % 3 === 0
          ? null
          : FRICTIONS[affinity(lens, person.id, viewer.id) % FRICTIONS.length],
    };
  });

  return {
    status: "ranked",
    lens,
    viewer: { id: viewer.id, name: viewer.name },
    entries,
  };
}

/**
 * The two states that are not `ranked`.
 *
 * `RankedRoom` carries no reason on either -- see R14 in
 * `openspec/changes/ui-flow-screens/tasks.md`. The status IS the message: the
 * screen names the stage to go back to and nothing finer, because inventing a
 * `floorReason` field here would be widening a contract issue #10 implements.
 */
export function mockNotConsented(lens: Lens): RankedRoom {
  return { status: "not-consented", lens };
}

export function mockBelowFloor(lens: Lens): RankedRoom {
  return { status: "below-floor", lens };
}
