import { and, eq, isNotNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type {
  BusinessGate,
  Consent,
  DeclaredBand,
  DeclaredProfile,
  Gender,
  Lens,
  NewParticipant,
  Participant,
  ParticipantId,
  RankableParticipant,
  RomanticGate,
  RoomId,
  RoomMember,
  SessionToken,
} from "@/lib/domain/participant";
import {
  isDeclaredComplete,
  meetsFloor,
  validateBusinessGate,
  validateRomanticGate,
} from "@/lib/domain/participant";
import type { ParticipantRepository } from "@/lib/ports/participant-repository";
import type { Db } from "./client.ts";
import {
  acquaintances,
  businessGates,
  participantSessions,
  participants,
  romanticGates,
} from "./schema/index.ts";
import { isUuid } from "./uuid.ts";

/**
 * neon-http `ParticipantRepository` (docs/domain.md §7).
 *
 * `byRoom()` selects only id, name and photo_url and returns `RoomMember[]`.
 * `byRoomForRanking(roomId, lens)` runs one query per table, joins in memory
 * and returns only the participants for whom `meetsFloor(p, lens)` holds -- the
 * full §0 floor is applied HERE, which is what makes the repository the
 * enforcement point of the S15 invariant (docs/domain.md §5).
 *
 * Multi-row writes are one `db.batch()`; `db.transaction()` throws on neon-http
 * (data-access skill §2). Because a batch is non-interactive, ids the batch
 * needs up front are generated in the application (`crypto.randomUUID()`,
 * data-access §3) rather than read back from an earlier statement.
 */

/** A `Participant` is the subject's own full view -- these columns, by name. */
const PARTICIPANT_COLUMNS = {
  id: participants.id,
  roomId: participants.roomId,
  name: participants.name,
  gender: participants.gender,
  birthdate: participants.birthdate,
  photoUrl: participants.photoUrl,
  team: participants.team,
  track: participants.track,
  consentRomantic: participants.consentRomantic,
  consentBusiness: participants.consentBusiness,
  consentFriendship: participants.consentFriendship,
  moneyPosture: participants.moneyPosture,
  rootedness: participants.rootedness,
  familyGravity: participants.familyGravity,
  capacityHoursBand: participants.capacityHoursBand,
  distanceBand: participants.distanceBand,
  chronotype: participants.chronotype,
  tags: participants.tags,
  declaredAt: participants.declaredAt,
  quizCompletedAt: participants.quizCompletedAt,
  createdAt: participants.createdAt,
};

/** What another participant may see -- and the only columns that read it. */
const ROOM_MEMBER_COLUMNS = {
  id: participants.id,
  name: participants.name,
  photoUrl: participants.photoUrl,
};

const ROMANTIC_GATE_COLUMNS = {
  participantId: romanticGates.participantId,
  gender: romanticGates.gender,
  interestedIn: romanticGates.interestedIn,
  single: romanticGates.single,
  ageBand: romanticGates.ageBand,
  wantsKids: romanticGates.wantsKids,
};

const BUSINESS_GATE_COLUMNS = {
  participantId: businessGates.participantId,
  riskPosture: businessGates.riskPosture,
  exitHorizon: businessGates.exitHorizon,
  redlinesOk: businessGates.redlinesOk,
};

type ParticipantRow = {
  id: string;
  roomId: string;
  name: string;
  gender: Gender | null;
  birthdate: string | null;
  photoUrl: string | null;
  team: string | null;
  track: string | null;
  consentRomantic: boolean;
  consentBusiness: boolean;
  consentFriendship: boolean;
  moneyPosture: number | null;
  rootedness: number | null;
  familyGravity: number | null;
  capacityHoursBand: number | null;
  distanceBand: number | null;
  chronotype: number | null;
  tags: string[];
  declaredAt: Date | null;
  quizCompletedAt: Date | null;
  createdAt: Date;
};

/** A non-empty tuple of statements is what `db.batch()` accepts. */
type Batchable = readonly [BatchItem<"pg">, ...BatchItem<"pg">[]];

/** smallint arrives as `number`; the check constraints keep it inside 0..3. */
function toBand(value: number | null): DeclaredBand | null {
  return value === null ? null : (value as DeclaredBand);
}

function toParticipant(
  row: ParticipantRow,
  known: ParticipantId[]
): Participant {
  return {
    id: row.id,
    roomId: row.roomId,
    name: row.name,
    gender: row.gender,
    birthdate: row.birthdate,
    photoUrl: row.photoUrl,
    team: row.team,
    track: row.track,
    consent: {
      romantic: row.consentRomantic,
      business: row.consentBusiness,
      friendship: row.consentFriendship,
    },
    declared: {
      moneyPosture: toBand(row.moneyPosture),
      rootedness: toBand(row.rootedness),
      familyGravity: toBand(row.familyGravity),
      capacityHoursBand: toBand(row.capacityHoursBand),
      distanceBand: toBand(row.distanceBand),
      chronotype: toBand(row.chronotype),
      tags: row.tags,
      acquaintances: known,
    },
    declaredAt: row.declaredAt,
    quizCompletedAt: row.quizCompletedAt,
    createdAt: row.createdAt,
  };
}

/** The consent column the lens's floor reads (docs/domain.md §0). */
function consentColumn(lens: Lens) {
  if (lens === "romantic") return participants.consentRomantic;
  if (lens === "business") return participants.consentBusiness;
  return participants.consentFriendship;
}

export function createParticipantRepository(db: Db): ParticipantRepository {
  return {
    async create(
      input: NewParticipant
    ): Promise<{ participant: Participant; sessionToken: SessionToken }> {
      // The session row needs the participant id, and a batch cannot read an
      // earlier statement's result (data-access §3), so the id is minted here.
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();

      const [rows] = await db.batch([
        db
          .insert(participants)
          .values({
            id,
            roomId: input.roomId,
            name: input.name,
            gender: input.gender,
            birthdate: input.birthdate,
            // D18: participating is consenting, so the three flags are written
            // by the registration itself rather than by a screen of their own.
            consentRomantic: input.consent.romantic,
            consentBusiness: input.consent.business,
            consentFriendship: input.consent.friendship,
            team: input.team ?? null,
            track: input.track ?? null,
          })
          .returning(PARTICIPANT_COLUMNS),
        db.insert(participantSessions).values({ token, participantId: id }),
      ]);

      // D4: the credential travels beside the participant, never on it.
      return {
        participant: toParticipant(rows[0], []),
        sessionToken: token as SessionToken,
      };
    },

    async bySessionToken(token: SessionToken): Promise<Participant | null> {
      // A cookie is attacker-controlled input. `participant_sessions.token` is
      // a Postgres `uuid`, which errors on a malformed literal instead of
      // matching nothing -- so a stale or tampered `hookai_session` would 500
      // every screen rather than taking the unknown-session path to /intake.
      if (!isUuid(token)) return null;

      const [rows, known] = await db.batch([
        db
          .select(PARTICIPANT_COLUMNS)
          .from(participantSessions)
          .innerJoin(
            participants,
            eq(participants.id, participantSessions.participantId)
          )
          .where(eq(participantSessions.token, token))
          .limit(1),
        db
          .select({ knowsId: acquaintances.knowsId })
          .from(acquaintances)
          .innerJoin(
            participantSessions,
            eq(participantSessions.participantId, acquaintances.participantId)
          )
          .where(eq(participantSessions.token, token)),
      ]);

      if (rows.length === 0) return null;
      return toParticipant(
        rows[0],
        known.map((row) => row.knowsId)
      );
    },

    async setPhoto(id: ParticipantId, url: string): Promise<void> {
      await db
        .update(participants)
        .set({ photoUrl: url })
        .where(eq(participants.id, id));
    },

    async setConsent(id: ParticipantId, consent: Consent): Promise<void> {
      await db
        .update(participants)
        .set({
          consentRomantic: consent.romantic,
          consentBusiness: consent.business,
          consentFriendship: consent.friendship,
        })
        .where(eq(participants.id, id));
    },

    async saveDeclared(
      id: ParticipantId,
      declared: DeclaredProfile
    ): Promise<void> {
      // §0: `declared_at` is part of the floor, so it is set only when all six
      // bands are present -- a half-finished declared round leaves it null and
      // the participant out of every ranking.
      const complete = isDeclaredComplete(declared);
      const known = [...new Set(declared.acquaintances)].filter(
        (other) => other !== id
      );

      const statements: BatchItem<"pg">[] = [
        db
          .update(participants)
          .set({
            moneyPosture: declared.moneyPosture,
            rootedness: declared.rootedness,
            familyGravity: declared.familyGravity,
            capacityHoursBand: declared.capacityHoursBand,
            distanceBand: declared.distanceBand,
            chronotype: declared.chronotype,
            tags: declared.tags,
            declaredAt: complete ? new Date() : null,
          })
          .where(eq(participants.id, id)),
        db.delete(acquaintances).where(eq(acquaintances.participantId, id)),
      ];
      // An empty `values()` throws, so the insert joins the batch only when
      // there is something to insert; the update keeps the batch non-empty.
      if (known.length > 0) {
        statements.push(
          db
            .insert(acquaintances)
            .values(known.map((knowsId) => ({ participantId: id, knowsId })))
        );
      }

      await db.batch(statements as unknown as Batchable);
    },

    async upsertRomanticGate(
      id: ParticipantId,
      gate: RomanticGate
    ): Promise<void> {
      validateRomanticGate(gate);
      const values = {
        gender: gate.gender,
        interestedIn: gate.interestedIn,
        single: gate.single,
        ageBand: gate.ageBand,
        wantsKids: gate.wantsKids,
        updatedAt: new Date(),
      };
      await db
        .insert(romanticGates)
        .values({ participantId: id, ...values })
        .onConflictDoUpdate({
          target: romanticGates.participantId,
          set: values,
        });
    },

    async upsertBusinessGate(
      id: ParticipantId,
      gate: BusinessGate
    ): Promise<void> {
      validateBusinessGate(gate);
      const values = {
        riskPosture: gate.riskPosture,
        exitHorizon: gate.exitHorizon,
        redlinesOk: gate.redlinesOk,
        updatedAt: new Date(),
      };
      await db
        .insert(businessGates)
        .values({ participantId: id, ...values })
        .onConflictDoUpdate({
          target: businessGates.participantId,
          set: values,
        });
    },

    async markQuizCompleted(id: ParticipantId, at: Date): Promise<void> {
      await db
        .update(participants)
        .set({ quizCompletedAt: at })
        .where(eq(participants.id, id));
    },

    async byRoom(roomId: RoomId): Promise<RoomMember[]> {
      // PILLARS.md §2 A8: a room view renders faces and names. Consent flags,
      // gate rows, declared bands and the session token are not selected at
      // all, so no serialiser downstream can leak what was never read.
      const rows = await db
        .select(ROOM_MEMBER_COLUMNS)
        .from(participants)
        .where(eq(participants.roomId, roomId))
        .orderBy(participants.createdAt);

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        photoUrl: row.photoUrl,
      }));
    },

    async byRoomForRanking(
      roomId: RoomId,
      lens: Lens
    ): Promise<RankableParticipant[]> {
      // One query per table, joined in memory -- never a query per participant.
      // The three floor rules that are columns are pushed into SQL; the gate
      // rule is applied by `meetsFloor()` below, so the §0 rule still has one
      // home and this method cannot drift from it.
      const [rows, romantic, business, known] = await db.batch([
        db
          .select(PARTICIPANT_COLUMNS)
          .from(participants)
          .where(
            and(
              eq(participants.roomId, roomId),
              isNotNull(participants.photoUrl),
              isNotNull(participants.declaredAt),
              eq(consentColumn(lens), true)
            )
          )
          .orderBy(participants.createdAt),
        db
          .select(ROMANTIC_GATE_COLUMNS)
          .from(romanticGates)
          .innerJoin(
            participants,
            eq(participants.id, romanticGates.participantId)
          )
          .where(eq(participants.roomId, roomId)),
        db
          .select(BUSINESS_GATE_COLUMNS)
          .from(businessGates)
          .innerJoin(
            participants,
            eq(participants.id, businessGates.participantId)
          )
          .where(eq(participants.roomId, roomId)),
        db
          .select({
            participantId: acquaintances.participantId,
            knowsId: acquaintances.knowsId,
          })
          .from(acquaintances)
          .innerJoin(
            participants,
            eq(participants.id, acquaintances.participantId)
          )
          .where(eq(participants.roomId, roomId)),
      ]);

      const romanticById = new Map<string, RomanticGate>(
        romantic.map((row) => [
          row.participantId,
          {
            gender: row.gender as Gender,
            interestedIn: row.interestedIn as Gender[],
            single: row.single,
            ageBand: row.ageBand,
            wantsKids: row.wantsKids,
          },
        ])
      );
      const businessById = new Map<string, BusinessGate>(
        business.map((row) => [
          row.participantId,
          {
            riskPosture: row.riskPosture,
            exitHorizon: row.exitHorizon,
            redlinesOk: row.redlinesOk,
          },
        ])
      );
      const knownById = new Map<string, ParticipantId[]>();
      for (const row of known) {
        const list = knownById.get(row.participantId) ?? [];
        list.push(row.knowsId);
        knownById.set(row.participantId, list);
      }

      return rows
        .map((row) => ({
          participant: toParticipant(row, knownById.get(row.id) ?? []),
          romanticGate: romanticById.get(row.id),
          businessGate: businessById.get(row.id),
          acquaintances: knownById.get(row.id) ?? [],
        }))
        .filter((rankable) => meetsFloor(rankable, lens));
    },
  };
}
