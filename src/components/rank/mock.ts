import type { RankedRoom } from "@/lib/domain/reveal/rank";
import type { Lens } from "@/lib/domain/room/layout";
import { AVATAR_SPRITES } from "@/lib/domain/room/layout";

/**
 * Fixture data for screen 1c.
 *
 * MOCK. Deliberately colocated with the screen that paints it, not hidden in a
 * `domain/` or `ports/` layer: the ranking contract belongs to the other team
 * (issue #10, `prepareResults`), and a second contract for the same thing is
 * worse than none. When theirs lands, this file is deleted and the screen is
 * handed real data of the same shape.
 *
 * The shape is honest about what may cross to the client: a 1-based `position`
 * and a two-value `band`, never a score. `low`-band pairs are ABSENT rather
 * than greyed, because a greyed row discloses who was excluded.
 */

/** Names and teams match the roster screens 1a and 1b already use. */
const PEOPLE = [
  ["p-sofia-guzman", "Sofía Guzmán", 0],
  ["p-laura-mendez", "Laura Méndez", 1],
  ["p-camila-soto", "Camila Soto", 2],
  ["p-andres-gil", "Andrés Gil", 3],
  ["p-elena-vargas", "Elena Vargas", 0],
  ["p-mateo-herrera", "Mateo Herrera", 1],
  ["p-natalia-pena", "Natalia Peña", 2],
] as const;

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

export function mockRankedRoom(lens: Lens): RankedRoom {
  return {
    status: "ranked",
    lens,
    viewer: { id: "p-diego-morales", name: "Diego Morales" },
    entries: PEOPLE.map(([id, name, sprite], i) => ({
      id,
      name,
      photoUrl: AVATAR_SPRITES[sprite],
      position: i + 1,
      // Three high, then mid. Both bands always present, so the filter chips
      // have something to do at every lens.
      band: i < 3 ? ("high" as const) : ("mid" as const),
      bond: BONDS[i % BONDS.length],
      // Not everyone has friction; the card must render without it.
      friction: i % 3 === 2 ? FRICTIONS[i % FRICTIONS.length] : null,
    })),
  };
}

/** The two states that are not `ranked`, for building those screens. */
export function mockNotConsented(lens: Lens): RankedRoom {
  return { status: "not-consented", lens };
}

export function mockBelowFloor(lens: Lens): RankedRoom {
  return { status: "below-floor", lens };
}
