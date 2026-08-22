import { describe, expect, it } from "vitest";

/**
 * The participant aggregate (issue #4, docs/domain.md §2): `Participant` is the
 * subject's own full view, `RoomMember` is the only shape other participants
 * may ever see, and the session token lives in its own table (D4) -- never on
 * the aggregate.
 *
 * AC-8 is `kind: safety`, so it RUNS today. The domain module does not exist
 * yet, so the three aliases below stand in for `Consent`, `Participant` and
 * `RoomMember` with the field lists docs/domain.md §2 specifies. When
 * src/lib/domain/participant lands, replace them with
 *
 *     import { type Participant, type RoomMember, toRoomMember } from ".";
 *
 * build `member` with toRoomMember() and keep every assertion. Two of them are
 * type-level and only `tsc` enforces them: a widened `RoomMember` or a
 * `sessionToken` on `Participant` fails the build even when the runtime strip
 * still works.
 */

// Stand-ins until #4 lands -- see the header. The real types replace these.
interface Consent {
  romantic: boolean;
  business: boolean;
  friendship: boolean;
}

interface Participant {
  id: string;
  roomId: string;
  name: string;
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consent: Consent;
}

interface RoomMember {
  id: string;
  name: string;
  photoUrl: string | null;
}

/** What other participants may see of one another -- nothing else. */
const ROOM_MEMBER_KEYS = ["id", "name", "photoUrl"] as const;
type RoomMemberKey = (typeof ROOM_MEMBER_KEYS)[number];

/** Substrings that must never appear in a serialised RoomMember. */
const LEAKS = [
  "interested_in",
  "interestedIn",
  "gender",
  "single",
  "wants_kids",
  "wantsKids",
  "consent_",
  "consent",
  "ageBand",
  "sessionToken",
  "token",
];

/** Exact type equality, so `keyof RoomMember` is pinned, not just covered. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

describe("floor", () => {
  // TODO: un-skip when src/lib/domain/participant/floor.ts exists.
  // Blocked on: floorReason, meetsFloor, bandToUnit, isDeclaredComplete and
  // the RankableParticipant type.
  it.skip("AC-3 · floorReason names what keeps a participant below the floor under each lens", () => {});
});

describe("RoomMember", () => {
  // Runs today (kind: safety). Vacuous until toRoomMember() exists: `member`
  // is a literal of the stand-in type. When the module lands, build it with
  // toRoomMember(rankable) from a full Participant fixture carrying consent,
  // six bands, team, track, a romantic gate { gender: "F", interestedIn:
  // ["M"], single: true, ageBand: 2, wantsKids: true } and a business gate,
  // and keep the assertions as they are.
  it("AC-8 · RoomMember is exactly id, name and photoUrl, and Participant never carries the session token", () => {
    const participant: Participant = {
      id: "11111111-1111-7111-8111-111111111111",
      roomId: "22222222-2222-7222-8222-222222222222",
      name: "Ana Ramírez",
      photoUrl: "https://blob.example/ana.jpg",
      team: "t-7",
      track: "fintech",
      consent: { romantic: true, business: true, friendship: true },
    };

    const member: RoomMember = {
      id: participant.id,
      name: participant.name,
      photoUrl: participant.photoUrl,
    };
    expect(Object.keys(member).sort()).toEqual([...ROOM_MEMBER_KEYS].sort());

    const json = JSON.stringify(member);
    for (const leak of LEAKS) {
      expect(json).not.toContain(leak);
    }

    // D4: the credential is not a field of the aggregate. Removing the
    // directive is a type error, so no select, relation or serialiser of
    // Participant can carry it.
    // @ts-expect-error sessionToken is not a property of Participant.
    const credential: unknown = participant.sessionToken;
    expect(credential).toBeUndefined();

    // Type-level: keyof RoomMember is exactly the three keys. Adding a field
    // to the type -- even one toRoomMember() never populates -- turns this
    // false and fails tsc independently of the runtime strip.
    const exact: Equals<keyof RoomMember, RoomMemberKey> = true;
    expect(exact).toBe(true);

    // The literal still carries `consent` at runtime; it is the TYPE that
    // refuses it. Widening RoomMember leaves the directive unused -> tsc error.
    const widened: RoomMember = {
      id: participant.id,
      name: participant.name,
      photoUrl: participant.photoUrl,
      // @ts-expect-error RoomMember carries no consent (docs/domain.md §2).
      consent: participant.consent,
    };
    expect(Object.keys(widened)).toHaveLength(ROOM_MEMBER_KEYS.length + 1);
  });
});
