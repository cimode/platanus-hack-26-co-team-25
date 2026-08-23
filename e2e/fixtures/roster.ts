import { createDb } from "../../src/lib/adapters/db/client";
import { createParticipantRepository } from "../../src/lib/adapters/db/participant-repository";
import { createRoomRepository } from "../../src/lib/adapters/db/room-repository";
import type {
  DeclaredProfile,
  Gender,
  ParticipantId,
} from "../../src/lib/domain/participant";
import { avatarFor } from "../../src/lib/domain/participant/avatar";

/**
 * The cast the room screens are tested against.
 *
 * It used to be `adapters/participants/roster.ts` -- eighteen names hardcoded
 * into PRODUCTION so the chooser had something to filter before intake
 * existed. Now that `ParticipantsPort` reads the `participants` table, that
 * module is gone and this file is where the fixture belongs: beside the tests
 * that need it, writing into `e2e-<run>` and nowhere else (D9).
 *
 * Eight people, not eighteen. Every one costs four round trips on Neon HTTP,
 * and nothing in the suite counts the room -- the specs assert on NAMES.
 *
 * They are rankable, which is the part that matters and the part the old
 * module could never be. `/rank` and `/profile` read through the §0 floor:
 * a participant without all six declared bands, without consent for the lens,
 * or without the lens's gate is ABSENT from the ranking, not merely low in it.
 * So each one gets a complete declared profile and both gates.
 *
 * Ids are NOT `p-diego-morales`. `participants.id` is a `uuid` column, so
 * those literals could never have been rows -- which is exactly why the specs
 * that hardcoded them broke the moment the roster became real. Callers look
 * their people up by name through `rosterIdByName`.
 */

/**
 * All six bands -- `saveDeclared` sets `declared_at` only for this (§0).
 *
 * `tags` are per person because `prepareProfile` returns the INTERSECTION of
 * the viewer's and the subject's. An empty list everywhere would render a
 * profile with no chips, which is a different screen from the one the design
 * and the specs describe.
 */
function declaredFor(tags: readonly string[]): DeclaredProfile {
  return {
    moneyPosture: 1,
    rootedness: 2,
    familyGravity: 0,
    capacityHoursBand: 3,
    distanceBand: 1,
    chronotype: 2,
    tags: [...tags],
    // Nobody knows anybody: an acquaintance edge suppresses a pair, and a
    // suppression no spec arranged is a 404 nobody can explain.
    acquaintances: [],
  };
}

interface CastMember {
  readonly name: string;
  readonly team: string;
  readonly gender: Gender;
  /** Who they are open to, romantically. Kept explicit so the pairs the
   *  profile and rank specs rely on are readable rather than emergent. */
  readonly interestedIn: readonly Gender[];
  /** Closed-vocabulary slugs from `domain/participant/tags.ts`. */
  readonly tags: readonly string[];
}

/**
 * Alphabetical by name, the order `/` renders and `filterParticipants` keeps
 * for equally good matches -- so the roster's order IS the tiebreak a person
 * sees while typing.
 *
 * The genders are chosen so `Laura Méndez` and `Diego Morales` are eligible
 * for each other under the romantic lens: that pair is the one
 * `e2e/profile.spec.ts` walks, and an ineligible pair would 404 for a reason
 * the spec is not testing.
 */
const CAST: readonly CastMember[] = [
  {
    name: "Ana Ramírez",
    team: "equipo 03",
    gender: "F",
    interestedIn: ["M"],
    tags: ["cafe", "fotografia", "plantas"],
  },
  {
    name: "Camila Soto",
    team: "equipo 07",
    gender: "F",
    interestedIn: ["M"],
    tags: ["cafe", "anime", "ramen"],
  },
  {
    name: "Diego Morales",
    team: "equipo 25",
    gender: "M",
    interestedIn: ["F"],
    tags: ["cafe", "ajedrez", "podcasts"],
  },
  {
    name: "Elena Vargas",
    team: "equipo 14",
    gender: "F",
    interestedIn: ["M"],
    tags: ["plantas", "astronomia", "cine-de-culto"],
  },
  {
    name: "Laura Méndez",
    team: "equipo 25",
    gender: "F",
    interestedIn: ["M"],
    // "cafe" and "ajedrez" are shared with Diego Morales on purpose: the
    // profile spec walks that pair, and `prepareProfile` returns the
    // INTERSECTION, so a disjoint pair renders a card with no chips.
    tags: ["cafe", "ajedrez", "fantasia"],
  },
  {
    name: "Mateo Herrera",
    team: "equipo 11",
    gender: "M",
    interestedIn: ["F"],
    tags: ["videojuegos", "anime", "ramen"],
  },
  {
    name: "Sofía Guzmán",
    team: "equipo 03",
    gender: "F",
    interestedIn: ["M"],
    tags: ["fotografia", "k-pop", "reggaeton"],
  },
  {
    name: "Valentina Cruz",
    team: "equipo 11",
    gender: "F",
    interestedIn: ["M"],
    tags: ["plantas", "manualidades", "podcasts"],
  },
];

/**
 * The name -> uuid map travels as an environment variable, not module state.
 *
 * `seedRoster` runs in Playwright's main process during global setup; the
 * workers that call `rosterIdByName` are FORKED from it. A fork inherits the
 * environment and nothing else, so a module-level Map would be populated in
 * the setup process and empty in every worker -- and the failure would read
 * as "Diego Morales is not in the cast" from a file that had just seeded him.
 * `E2E_ROOM_SLUG` crosses the same boundary the same way.
 */
const ROSTER_ENV = "E2E_ROSTER_IDS";

function repositories() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url);
  return {
    participants: createParticipantRepository(db),
    rooms: createRoomRepository(db),
  };
}

/**
 * Creates the cast in `roomSlug` and returns their real ids, keyed by name.
 *
 * Every write goes through the repository rather than raw SQL, so a seeded row
 * obeys the invariants a registered one does -- `declared_at` is set by
 * `saveDeclared`, never by this file.
 */
export async function seedRoster(
  roomSlug: string
): Promise<Map<string, string>> {
  const { participants, rooms } = repositories();
  const room = await rooms.bySlug(roomSlug);
  if (!room) throw new Error(`no room with slug ${roomSlug}`);

  const seeded = new Map<string, string>();

  for (const person of CAST) {
    const { participant } = await participants.create({
      roomId: room.id,
      name: person.name,
      team: person.team,
      gender: person.gender,
      birthdate: "1996-05-04",
      avatar: avatarFor(person.gender, person.name),
      // D18: registering is consenting, and all three lenses are consented so
      // no spec has to explain an absence it did not arrange.
      consent: { romantic: true, business: true, friendship: true },
      dataConsentAt: new Date(),
    });

    const id = participant.id as ParticipantId;
    await participants.saveDeclared(id, declaredFor(person.tags));
    await participants.upsertRomanticGate(id, {
      gender: person.gender,
      interestedIn: [...person.interestedIn],
      single: true,
      ageBand: 1,
      wantsKids: true,
    });
    await participants.upsertBusinessGate(id, {
      riskPosture: 1,
      exitHorizon: 1,
      redlinesOk: true,
    });

    seeded.set(person.name, participant.id);
  }

  process.env[ROSTER_ENV] = JSON.stringify(Object.fromEntries(seeded));
  return seeded;
}

/**
 * The real uuid behind a cast member's name.
 *
 * Throws rather than returning undefined: a spec that misspells a name would
 * otherwise navigate to `/profile/undefined` and get the same 404 every
 * suppression cause returns, which is indistinguishable from the thing those
 * specs are actually asserting.
 */
export function rosterIdByName(name: string): string {
  const raw = process.env[ROSTER_ENV];
  if (!raw) {
    throw new Error(
      `${ROSTER_ENV} is not set. e2e/global-setup.ts seeds the cast and ` +
        "publishes their ids; without DATABASE_URL it seeds nothing and the " +
        "specs that name a person skip themselves on the same variable."
    );
  }
  const ids = JSON.parse(raw) as Record<string, string>;
  const id = ids[name];
  if (!id) {
    throw new Error(
      `"${name}" is not in the e2e cast. Known: ${Object.keys(ids).join(", ")}`
    );
  }
  return id;
}

/** Whether the cast was seeded at all -- the skip condition for room specs. */
export function rosterSeeded(): boolean {
  return !!process.env[ROSTER_ENV];
}

/** The names, in the order `/` renders them. */
export const CAST_NAMES: readonly string[] = CAST.map((person) => person.name);
