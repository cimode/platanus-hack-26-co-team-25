import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSENT,
  type Participant,
  type ParticipantId,
  type SessionToken,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import type { PhotoStore, PhotoUpload } from "../ports/photo-store";
import { SetPhotoError, setPhoto } from "./set-photo";

/**
 * `setPhoto` use case (issue #6): resolves the participant by session token,
 * enforces the server ceiling (image/jpeg | image/png | image/webp, <= 1 MiB),
 * stores the bytes through the PhotoStore port and saves the returned URL.
 *
 * Both tests use inline in-memory stubs for ParticipantRepository and
 * PhotoStore -- no adapter import, so the biome.json hexagon rule holds.
 *
 * The ceiling is written as a literal here on purpose: importing the constant
 * the implementation uses would make this suite agree with whatever that
 * constant becomes. 1 MiB is Next's default Server Action body limit, which is
 * a fact about the platform, not an implementation detail.
 */

const ONE_MIB = 1024 * 1024;
const TWO_KIB = 2 * 1024;

const KNOWN_TOKEN = "sess-ana" as SessionToken;
const UNKNOWN_TOKEN = "sess-nobody" as SessionToken;
const PARTICIPANT_ID: ParticipantId = "p1";
const STORED_URL = "https://store.test/photos/p1-abc.jpg";

function unused(method: string): never {
  throw new Error(`${method} is not part of the setPhoto contract`);
}

/**
 * One participant, addressable by session token, whose `photoUrl` starts null
 * and only ever changes through `setPhoto(id, url)` -- the same seam the real
 * repository writes `participants.photo_url` through.
 */
function inMemoryParticipants(): {
  participants: ParticipantRepository;
  read: () => Participant;
} {
  const base: Participant = {
    id: PARTICIPANT_ID,
    roomId: "room-1",
    name: "Ana Ramírez",
    photoUrl: null,
    team: "hookai",
    track: "AI",
    consent: { ...DEFAULT_CONSENT },
    declared: {
      moneyPosture: null,
      rootedness: null,
      familyGravity: null,
      capacityHoursBand: null,
      distanceBand: null,
      chronotype: null,
      tags: [],
      acquaintances: [],
    },
    declaredAt: null,
    quizCompletedAt: null,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
  };
  let photoUrl: string | null = null;

  const participants: ParticipantRepository = {
    create: () => unused("create"),
    bySessionToken: async (token) =>
      token === KNOWN_TOKEN ? { ...base, photoUrl } : null,
    setPhoto: async (id, url) => {
      if (id !== base.id) unused("setPhoto for another participant");
      photoUrl = url;
    },
    setConsent: () => unused("setConsent"),
    saveDeclared: () => unused("saveDeclared"),
    upsertRomanticGate: () => unused("upsertRomanticGate"),
    upsertBusinessGate: () => unused("upsertBusinessGate"),
    markQuizCompleted: () => unused("markQuizCompleted"),
    byRoom: () => unused("byRoom"),
    byRoomForRanking: () => unused("byRoomForRanking"),
  };

  return { participants, read: () => ({ ...base, photoUrl }) };
}

/** Records every `put`, so "the store was never touched" is checkable. */
function recordingPhotoStore(url = STORED_URL): {
  photos: PhotoStore;
  puts: PhotoUpload[];
} {
  const puts: PhotoUpload[] = [];
  return {
    puts,
    photos: {
      put: async (upload) => {
        puts.push(upload);
        return { url };
      },
    },
  };
}

/** The rejection itself, so its `reason` is asserted rather than a message. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected setPhoto to reject, but it resolved");
}

function reasonOf(error: unknown): string {
  expect(error).toBeInstanceOf(SetPhotoError);
  return (error as SetPhotoError).reason;
}

describe("setPhoto", () => {
  it("AC-3 · rejects a non-image, an oversized photo and an unknown session without touching the store", async () => {
    const { participants, read } = inMemoryParticipants();
    const { photos, puts } = recordingPhotoStore();
    const deps = { participants, photos };

    const notAnImage = await rejectionOf(
      setPhoto(
        {
          sessionToken: KNOWN_TOKEN,
          bytes: new Uint8Array(10),
          contentType: "text/plain",
        },
        deps
      )
    );
    expect(reasonOf(notAnImage)).toBe("unsupported-type");

    const tooLarge = await rejectionOf(
      setPhoto(
        {
          sessionToken: KNOWN_TOKEN,
          bytes: new Uint8Array(ONE_MIB + 1),
          contentType: "image/jpeg",
        },
        deps
      )
    );
    expect(reasonOf(tooLarge)).toBe("too-large");

    const noSession = await rejectionOf(
      setPhoto(
        {
          sessionToken: UNKNOWN_TOKEN,
          bytes: new Uint8Array(TWO_KIB),
          contentType: "image/jpeg",
        },
        deps
      )
    );
    expect(reasonOf(noSession)).toBe("no-session");

    // Nothing left the process, and the row is untouched.
    expect(puts).toHaveLength(0);
    expect(read().photoUrl).toBeNull();
    const stillThere = await participants.bySessionToken(KNOWN_TOKEN);
    expect(stillThere?.photoUrl).toBeNull();
  });

  it("AC-4 · stores the bytes once under the participant's id and saves the returned URL", async () => {
    const { participants } = inMemoryParticipants();
    const { photos, puts } = recordingPhotoStore(STORED_URL);

    const bytes = new Uint8Array(TWO_KIB).fill(7);
    const result = await setPhoto(
      { sessionToken: KNOWN_TOKEN, bytes, contentType: "image/jpeg" },
      { participants, photos }
    );

    expect(result).toEqual({ photoUrl: STORED_URL });

    expect(puts).toHaveLength(1);
    expect(puts[0].participantId).toBe(PARTICIPANT_ID);
    expect(puts[0].bytes).toEqual(bytes);
    expect(puts[0].bytes.byteLength).toBe(TWO_KIB);

    const saved = await participants.bySessionToken(KNOWN_TOKEN);
    expect(saved?.photoUrl).toBe(STORED_URL);
  });
});
