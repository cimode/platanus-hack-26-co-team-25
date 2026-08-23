import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSENT,
  type DeclaredProfile,
  type Participant,
  type ParticipantId,
  type SessionToken,
  TAGS,
} from "../domain/participant";
import type { ParticipantRepository } from "../ports/participant-repository";
import { submitDeclared } from "./submit-declared";

/**
 * `submitDeclared` use case (issue #8): resolves the participant by session
 * token, merges a partial declared profile onto the saved one, validates the
 * bands (0..3) and the tags (subset of TAGS, at most 12), calls `saveDeclared`
 * once with `acquaintances: []` and reports `complete` only when all six bands
 * are present (docs/domain.md §3, D6).
 *
 * Both tests use an inline in-memory ParticipantRepository -- no adapter
 * import, so the biome.json hexagon rule holds -- and refer to the vocabulary
 * by `TAGS[0]` from src/lib/domain/participant, never by a literal slug.
 */

const KNOWN_TOKEN = "sess-ana" as SessionToken;
const UNKNOWN_TOKEN = "sess-nobody" as SessionToken;
const PARTICIPANT_ID: ParticipantId = "p1";

/** Not in the 30-slug vocabulary, and deliberately not slug-shaped either. */
const NOT_A_TAG = "definitely not a tag";

const NO_BANDS: DeclaredProfile = {
  moneyPosture: null,
  rootedness: null,
  familyGravity: null,
  capacityHoursBand: null,
  distanceBand: null,
  chronotype: null,
  tags: [],
  acquaintances: [],
};

function unused(method: string): never {
  throw new Error(`${method} is not part of the submitDeclared contract`);
}

/**
 * One participant addressable by session token, whose declared profile starts
 * as `saved` and only ever changes through `saveDeclared(id, declared)` -- the
 * same seam the real repository writes the band columns through.
 *
 * Every call is recorded, so "saveDeclared was never called" is checkable, and
 * a re-read through `bySessionToken` returns what was written, so "the tags
 * survive the next screen" is an assertion about the merge rather than about
 * the fake.
 */
function inMemoryParticipants(saved: DeclaredProfile = NO_BANDS): {
  participants: ParticipantRepository;
  saves: Array<{ id: ParticipantId; declared: DeclaredProfile }>;
} {
  const saves: Array<{ id: ParticipantId; declared: DeclaredProfile }> = [];
  let declared: DeclaredProfile = { ...saved };

  const base: Omit<Participant, "declared"> = {
    id: PARTICIPANT_ID,
    roomId: "room-1",
    name: "Ana Ramírez",
    gender: "F",
    birthdate: "1996-05-04",
    photoUrl: "https://store.test/photos/p1.jpg",
    team: "hookai",
    track: "AI",
    consent: { ...DEFAULT_CONSENT, friendship: true },
    dataConsentAt: null,
    declaredAt: null,
    quizCompletedAt: null,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
  };

  const participants: ParticipantRepository = {
    create: () => unused("create"),
    bySessionToken: async (token) =>
      token === KNOWN_TOKEN ? { ...base, declared: { ...declared } } : null,
    setPhoto: () => unused("setPhoto"),
    setConsent: () => unused("setConsent"),
    saveDeclared: async (id, next) => {
      saves.push({ id, declared: { ...next } });
      declared = { ...next };
    },
    upsertRomanticGate: () => unused("upsertRomanticGate"),
    upsertBusinessGate: () => unused("upsertBusinessGate"),
    markQuizCompleted: () => unused("markQuizCompleted"),
    byRoom: () => unused("byRoom"),
    byRoomForRanking: () => unused("byRoomForRanking"),
  };

  return { participants, saves };
}

describe("submitDeclared", () => {
  it("AC-5 · refuses 13 tags, a tag outside TAGS and an unknown session without calling saveDeclared", async () => {
    const { participants, saves } = inMemoryParticipants();
    const deps = { participants };

    // Thirteen slugs that all belong to the vocabulary: what fails is the cap,
    // not membership (docs/domain.md §3, `cardinality(tags) <= 12`).
    const thirteen = TAGS.slice(0, 13);
    expect(thirteen).toHaveLength(13);
    const tooMany = await submitDeclared(
      { sessionToken: KNOWN_TOKEN, patch: { tags: [...thirteen] } },
      deps
    );
    expect(tooMany).toEqual({ ok: false, reason: "tags" });

    // A slug nobody could have tapped: the picker only offers TAGS, and the
    // action is a public endpoint, so the use case checks anyway.
    const unknownTag = await submitDeclared(
      { sessionToken: KNOWN_TOKEN, patch: { tags: [NOT_A_TAG] } },
      deps
    );
    expect(unknownTag).toEqual({ ok: false, reason: "tags" });

    // A cookie that matches nobody (docs/domain.md D4: the action holds the
    // token, never an id).
    const noSession = await submitDeclared(
      { sessionToken: UNKNOWN_TOKEN, patch: { tags: [TAGS[0]] } },
      deps
    );
    expect(noSession).toEqual({ ok: false, reason: "no-session" });

    // The row is untouched by all three.
    expect(saves).toEqual([]);
    const me = await participants.bySessionToken(KNOWN_TOKEN);
    expect(me?.declared.tags).toEqual([]);
  });

  it("AC-6 · merges each screen onto the saved profile and reports complete only when all six bands exist", async () => {
    // Five bands answered on earlier screens; chronotype is the one left.
    const { participants, saves } = inMemoryParticipants({
      moneyPosture: 1,
      rootedness: 2,
      familyGravity: 0,
      capacityHoursBand: 3,
      distanceBand: 1,
      chronotype: null,
      tags: [],
      acquaintances: [],
    });
    const deps = { participants };

    const tagsScreen = await submitDeclared(
      { sessionToken: KNOWN_TOKEN, patch: { tags: [TAGS[0]] } },
      deps
    );
    expect(tagsScreen).toEqual({ ok: true, complete: false });

    expect(saves).toHaveLength(1);
    expect(saves[0].id).toBe(PARTICIPANT_ID);
    expect(saves[0].declared).toEqual({
      moneyPosture: 1,
      rootedness: 2,
      familyGravity: 0,
      capacityHoursBand: 3,
      distanceBand: 1,
      // The screen that asks for it has not been answered yet: a patch that
      // does not mention a band may not overwrite it, and may not complete
      // the round (docs/domain.md §0 -- `declared_at` is part of the floor).
      chronotype: null,
      tags: [TAGS[0]],
      acquaintances: [],
    });

    const chronotypeScreen = await submitDeclared(
      { sessionToken: KNOWN_TOKEN, patch: { chronotype: 2 } },
      deps
    );
    expect(chronotypeScreen).toEqual({ ok: true, complete: true });

    expect(saves).toHaveLength(2);
    expect(saves[1].id).toBe(PARTICIPANT_ID);
    expect(saves[1].declared).toEqual({
      moneyPosture: 1,
      rootedness: 2,
      familyGravity: 0,
      capacityHoursBand: 3,
      distanceBand: 1,
      chronotype: 2,
      // Retained from the previous screen rather than blanked by a patch that
      // never mentioned tags.
      tags: [TAGS[0]],
      // The acquaintances picker is cut from this issue; the list is always
      // written empty (docs/domain.md §3).
      acquaintances: [],
    });
  });
});
