import type { BrowserContext } from "@playwright/test";
import { createDb } from "../../src/lib/adapters/db/client";
import { createParticipantRepository } from "../../src/lib/adapters/db/participant-repository";
import { createQuizPoolRepository } from "../../src/lib/adapters/db/quiz-pool-repository";
import { createRoomRepository } from "../../src/lib/adapters/db/room-repository";
import type {
  Consent,
  Gender,
  SessionToken,
} from "../../src/lib/domain/participant";
import { avatarFor } from "../../src/lib/domain/participant/avatar";
import { INSTRUMENT } from "../../src/lib/domain/quiz";

/**
 * Seeds straight into the `e2e-<run>` room (issue #8, reshaped by D20).
 *
 * Driving registration through the real screen for every test that needs a
 * participant would multiply the run time and make a failure downstream read
 * as a failure in the photo step. So this fixture creates the participant
 * through the #4 repositories -- photo and consents -- and hands the session
 * token to a browser context as the `dipia_session` cookie, the same
 * credential the app would have set (docs/domain.md D4). There is no declared
 * round to seed any more: a registered row is a rankable row.
 *
 * It writes only into `e2e-<run>`, the room e2e/global-setup.ts created for
 * this run; the real `platanus-hack-26-bogota` is never touched (D9). The
 * intake criteria do not use `seedParticipant`: they drive the screen itself.
 *
 * Playwright does not read `.env`; `next dev` does. Loaded the same guarded way
 * global-setup.ts does -- variables already in the environment win, and CI has
 * no `.env` at all.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env in this checkout (CI, or a clone that never ran `neon link`).
}

/** The cookie name is #6's, written as a literal so this file stays out of
 * `src/lib/adapters/http/session.ts` -- importing it would pull `next/headers`
 * into the Playwright process. */
const SESSION_COOKIE = "dipia_session";

/** Matches playwright.config.ts; `addCookies` wants a URL, not a domain. */
const BASE_URL = "http://localhost:3000";

/**
 * A 1x1 JPEG as a `data:` URL -- the same shape the fake PhotoStore returns
 * (docs/domain.md D11), so the seeded row is indistinguishable from one the
 * photo step wrote and no test ever uploads anything.
 */
const SEEDED_PHOTO =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

export interface SeedOptions {
  name?: string;
  /** D18 registers with all three true; a test may still say otherwise. */
  consent?: Partial<Consent>;
  gender?: Gender;
  birthdate?: string;
  /** Seeded with a photo unless a test wants the registration guard. */
  photo?: boolean;
}

export interface SeededParticipant {
  id: string;
  name: string;
  sessionToken: string;
}

const MISSING_URL =
  "DATABASE_URL is not set, so e2e/fixtures/intake.ts cannot seed into the " +
  "database. Point .env at a migrated Neon branch (`neon checkout " +
  "dev-domain`).";

const MISSING_ROOM =
  "E2E_ROOM_SLUG is not set. e2e/global-setup.ts creates the `e2e-<run>` room " +
  "these fixtures seed into; check that playwright.config.ts still registers it.";

function repositories() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(MISSING_URL);
  const db = createDb(url);
  return {
    participants: createParticipantRepository(db),
    rooms: createRoomRepository(db),
    pool: createQuizPoolRepository(db),
  };
}

/** The `e2e-<run>` room from global setup; never the demo room (D9). */
export function e2eRoomSlug(): string {
  const slug = process.env.E2E_ROOM_SLUG;
  if (!slug) throw new Error(MISSING_ROOM);
  return slug;
}

/**
 * Creates one participant in `e2e-<run>` and returns its session token.
 *
 * Every write goes through the ParticipantRepository rather than raw SQL, so a
 * seeded row obeys the same invariants a registered one does.
 */
export async function seedParticipant(
  options: SeedOptions = {}
): Promise<SeededParticipant> {
  const { participants, rooms } = repositories();
  const slug = e2eRoomSlug();
  const room = await rooms.bySlug(slug);
  if (!room) throw new Error(`${MISSING_ROOM} (no room with slug ${slug})`);

  const name = options.name ?? "Ana Ramírez";
  const { participant, sessionToken } = await participants.create({
    roomId: room.id,
    name,
    gender: options.gender ?? "F",
    birthdate: options.birthdate ?? "1996-05-04",
    avatar: avatarFor(options.gender ?? "F", name),
    // D18: registering is consenting, so this is what the real screen writes.
    consent: {
      romantic: options.consent?.romantic ?? true,
      business: options.consent?.business ?? true,
      friendship: options.consent?.friendship ?? true,
    },
    // Issue #49: a registered row always carries the moment its data-treatment
    // authorisation was given, so a seeded one has to as well.
    dataConsentAt: new Date(),
  });

  if (options.photo !== false) {
    await participants.setPhoto(participant.id, SEEDED_PHOTO);
  }

  return { id: participant.id, name, sessionToken };
}

/**
 * One pre-written set of first questions for the `e2e-<run>` room (D20).
 *
 * Registration adopts the oldest unclaimed set as the new participant's batch
 * 1, so a test that seeds one before registering lands on block 1 with the
 * questions already there -- and no model is ever called in e2e. The blocks
 * are the committed instrument's batch 1, the same five the quiz helper seeds.
 */
export async function seedPoolSet(): Promise<void> {
  const { rooms, pool } = repositories();
  const slug = e2eRoomSlug();
  const room = await rooms.bySlug(slug);
  if (!room) throw new Error(`${MISSING_ROOM} (no room with slug ${slug})`);

  await pool.add(
    room.id,
    INSTRUMENT.blocks.filter((block) => block.batch === 1)
  );
}

/** The participant behind a session cookie -- identity, photo and consents. */
export async function participantBySession(
  sessionToken: string
): Promise<import("../../src/lib/domain/participant").Participant | null> {
  const { participants } = repositories();
  return participants.bySessionToken(sessionToken as SessionToken);
}

/** Everyone in the `e2e-<run>` room, as the room view would see them. */
export async function roomMembers(): Promise<{ id: string; name: string }[]> {
  const { participants, rooms } = repositories();
  const room = await rooms.bySlug(e2eRoomSlug());
  if (!room) throw new Error(MISSING_ROOM);
  return participants.byRoom(room.id);
}

/**
 * Signs a browser context in as a seeded participant -- httpOnly and Lax, the
 * way #6's session helper writes it, so nothing about the cookie differs from
 * one the app set.
 */
export async function signIn(
  context: BrowserContext,
  sessionToken: string | SessionToken
): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionToken,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
