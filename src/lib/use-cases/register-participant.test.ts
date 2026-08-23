import { describe, expect, it } from "vitest";
import {
  type Consent,
  intakeStepOf,
  type NewParticipant,
  type Participant,
  type SessionToken,
} from "@/lib/domain/participant";
import { INSTRUMENT } from "@/lib/domain/quiz";
import type { ParticipantRepository } from "@/lib/ports/participant-repository";
import type { PhotoStore } from "@/lib/ports/photo-store";
import type { Room, RoomRepository } from "@/lib/ports/room-repository";
import {
  RegisterParticipantError,
  registerParticipant,
} from "./register-participant";

/**
 * The one registration screen's use case (issue #42, docs/domain.md D18).
 *
 * Fakes rather than a database: what is under test is the ORDER of the rules --
 * nothing is written before the payload is judged, the three consents are set
 * by the registration itself, and a photo store that refuses leaves a row with
 * no `photo_url` that the flow cannot reach.
 */

const ROOM: Room = {
  id: "22222222-2222-7222-8222-222222222222",
  slug: "e2e-room",
  name: "Room",
  instrumentVersion: INSTRUMENT.version,
  createdAt: new Date("2026-08-22T17:00:00.000Z"),
};

const TODAY = new Date("2026-08-22T12:00:00.000Z");
const BORN_27 = "1999-08-22";

const PHOTO = {
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "image/jpeg",
};

function unused(method: string): never {
  throw new Error(`${method} is not part of this use case`);
}

const rooms: RoomRepository = {
  async bySlug(slug) {
    return slug === ROOM.slug ? ROOM : null;
  },
  async byId(id) {
    return id === ROOM.id ? ROOM : null;
  },
  create: () => unused("rooms.create"),
};

/** Just enough repository to watch what registration writes. */
function fakeParticipants() {
  const rows = new Map<string, Participant>();
  const tokens = new Map<string, string>();

  const repo: ParticipantRepository = {
    async create(input: NewParticipant) {
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      const participant: Participant = {
        id,
        roomId: input.roomId,
        name: input.name,
        gender: input.gender,
        birthdate: input.birthdate,
        avatar: input.avatar,
        photoUrl: null,
        team: input.team ?? null,
        track: input.track ?? null,
        consent: { ...(input.consent as Consent) },
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
        dataConsentAt: input.dataConsentAt ?? null,
        declaredAt: null,
        quizCompletedAt: null,
        createdAt: new Date(),
      };
      rows.set(id, participant);
      tokens.set(token, id);
      return { participant, sessionToken: token as SessionToken };
    },
    async bySessionToken(token) {
      const id = tokens.get(token);
      return id ? (rows.get(id) ?? null) : null;
    },
    async setPhoto(id, url) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, photoUrl: url });
    },
    setConsent: () => unused("setConsent"),
    saveDeclared: () => unused("saveDeclared"),
    upsertRomanticGate: () => unused("upsertRomanticGate"),
    upsertBusinessGate: () => unused("upsertBusinessGate"),
    markQuizCompleted: () => unused("markQuizCompleted"),
    byRoom: () => unused("byRoom"),
    byRoomForRanking: () => unused("byRoomForRanking"),
  };

  return { repo, rows };
}

const storingPhotos: PhotoStore = {
  async put({ participantId }) {
    return { url: `https://photos.example/${participantId}.jpg` };
  },
};

const rejectingPhotos: PhotoStore = {
  put() {
    return Promise.reject(new Error("bucket unreachable"));
  },
};

const VALID = {
  roomSlug: ROOM.slug,
  name: "Ana Ramírez",
  gender: "F",
  birthdate: BORN_27,
  photo: PHOTO,
  dataConsent: true,
  today: TODAY,
};

describe("registerParticipant", () => {
  it("AC-1 · one submit creates the row with identity, photo and all three consents", async () => {
    const { repo, rows } = fakeParticipants();

    const { participant, sessionToken } = await registerParticipant(VALID, {
      participants: repo,
      rooms,
      photos: storingPhotos,
    });

    expect(participant.name).toBe("Ana Ramírez");
    expect(participant.gender).toBe("F");
    expect(participant.birthdate).toBe(BORN_27);
    // Dressed from the gender, once, and stored with the row (feminine pair).
    expect(participant.avatar).toMatch(/^(avatar3|avatar4)$/);
    expect(rows.get(participant.id)?.avatar).toBe(participant.avatar);
    expect(participant.photoUrl).toBe(
      `https://photos.example/${participant.id}.jpg`
    );
    // D18: participating IS consenting, and no screen ever asked.
    expect(participant.consent).toEqual({
      romantic: true,
      business: true,
      friendship: true,
    });

    // The stored row agrees, and the credential resumes past registration.
    // Issue #49: the authorisation is recorded with its moment, not as a flag.
    expect(participant.dataConsentAt).toEqual(TODAY);
    expect(rows.get(participant.id)?.dataConsentAt).toEqual(TODAY);

    expect(rows.get(participant.id)?.photoUrl).toBe(participant.photoUrl);
    // D20: registration hands off straight to the questions.
    expect(intakeStepOf(await repo.bySessionToken(sessionToken))).toBe("quiz");
  });

  it("AC-2 · a 15-year-old and a missing photo are both refused before a row exists", async () => {
    const young = fakeParticipants();
    await expect(
      registerParticipant(
        { ...VALID, birthdate: "2011-08-22" },
        { participants: young.repo, rooms, photos: storingPhotos }
      )
    ).rejects.toMatchObject({ reason: "birthdate-too-young" });
    expect(young.rows.size).toBe(0);

    const noPhoto = fakeParticipants();
    await expect(
      registerParticipant(
        { ...VALID, photo: null },
        { participants: noPhoto.repo, rooms, photos: storingPhotos }
      )
    ).rejects.toMatchObject({ reason: "photo-missing" });
    expect(noPhoto.rows.size).toBe(0);
  });

  // kind: edge. The store is the one dependency that can fail after the row
  // exists, so it is the one case that needs the row to stay unreachable.
  it("AC-4 · a photo store that rejects leaves no photo_url and resumes on the registration screen", async () => {
    const { repo, rows } = fakeParticipants();

    const error = await registerParticipant(VALID, {
      participants: repo,
      rooms,
      photos: rejectingPhotos,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(RegisterParticipantError);
    const failure = error as RegisterParticipantError;
    expect(failure.reason).toBe("photo");

    const [row] = [...rows.values()];
    expect(row.photoUrl).toBeNull();

    // The same session token, followed, lands back on the registration screen
    // -- never in the quiz.
    const token = failure.sessionToken as SessionToken;
    const resumed = await repo.bySessionToken(token);
    expect(resumed?.photoUrl).toBeNull();
    expect(intakeStepOf(resumed)).toBe("register");
  });

  // kind: edge (issue #49 AC-3). Habeas data is checked before anything is
  // read or written, so the refusal has to be provable by the repository
  // having been asked for nothing at all.
  it("AC-3 · without the data-treatment flag it refuses and creates no row", async () => {
    const { repo, rows } = fakeParticipants();

    await expect(
      registerParticipant(
        { ...VALID, dataConsent: false },
        { participants: repo, rooms, photos: storingPhotos }
      )
    ).rejects.toMatchObject({ reason: "data-consent" });

    expect(rows.size).toBe(0);
  });

  it("refuses an unknown room, a blank name and a gender that is not one of the three", async () => {
    const { repo, rows } = fakeParticipants();
    const deps = { participants: repo, rooms, photos: storingPhotos };

    await expect(
      registerParticipant({ ...VALID, roomSlug: "nope" }, deps)
    ).rejects.toMatchObject({ reason: "room-not-found" });
    await expect(
      registerParticipant({ ...VALID, name: "   " }, deps)
    ).rejects.toMatchObject({ reason: "invalid-name" });
    await expect(
      registerParticipant({ ...VALID, gender: "X" }, deps)
    ).rejects.toMatchObject({ reason: "invalid-gender" });
    await expect(
      registerParticipant(
        { ...VALID, photo: { ...PHOTO, contentType: "application/pdf" } },
        deps
      )
    ).rejects.toMatchObject({ reason: "photo-unsupported-type" });

    expect(rows.size).toBe(0);
  });
});
