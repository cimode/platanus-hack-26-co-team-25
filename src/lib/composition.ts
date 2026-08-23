import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import { createGeneratedBlockRepository } from "./adapters/db/generated-block-repository";
import { createGenerationClaimsRepository } from "./adapters/db/generation-claims-repository";
import { createLatentRepository } from "./adapters/db/latent-repository";
import { createParticipantRepository } from "./adapters/db/participant-repository";
import { createQuizPoolRepository } from "./adapters/db/quiz-pool-repository";
import { createResponseRepository } from "./adapters/db/response-repository";
import { createRoomRepository } from "./adapters/db/room-repository";
import { createDbRoster } from "./adapters/db/roster";
import { createGatewayLlm } from "./adapters/llm/gateway";
import { createFakePhotoStore } from "./adapters/storage/fake-photo-store";
import { createNeonObjectStoragePhotoStore } from "./adapters/storage/neon-object-storage-photo-store";
import { createDbTimelines } from "./adapters/timeline";
import type { GeneratedBlockRepository } from "./ports/generated-block-repository";
import type { GenerationClaims } from "./ports/generation-claims";
import type { LatentRepository } from "./ports/latent-repository";
import type { LlmPort } from "./ports/llm";
import type { ParticipantRepository } from "./ports/participant-repository";
import type { ParticipantsPort } from "./ports/participants";
import type { PhotoStore } from "./ports/photo-store";
import type { ProfilePort } from "./ports/profile";
import type { QuizPoolRepository } from "./ports/quiz-pool";
import type { RankingPort } from "./ports/ranking";
import type { ResponseRepository } from "./ports/response-repository";
import type { RoomRepository } from "./ports/room-repository";
import type { TimelinePort } from "./ports/timeline";
import { prepareProfile } from "./use-cases/prepare-profile";
import type { PrepareResultsDeps } from "./use-cases/prepare-results";
import { prepareResults } from "./use-cases/prepare-results";
import { scoreParticipant } from "./use-cases/score-participant";

/**
 * The composition root: the ONLY module allowed to know which adapter
 * implements which port.
 *
 * Everything inside the hexagon -- `domain/`, `use-cases/`, `ports/` -- is
 * forbidden by `biome.json` from importing an adapter or an SDK. That rule is
 * what keeps the core testable, and this file is the deliberate hole in it.
 * Driving adapters (route handlers, server actions, server components) call
 * `serverDeps()` and pass the result into a use case:
 *
 *     const result = await submitIntake(input, serverDeps());
 *
 * They must not reach for `getDb()` themselves.
 *
 * Two participant-shaped dependencies coexist on purpose:
 *
 *   - `roster` -- the people who actually registered, read from the room named
 *     by `HOOKAI_ROOM_SLUG` (`adapters/db/roster.ts`). It replaced the
 *     hard-coded module the day intake started writing rows.
 *   - `participants` -- the real `ParticipantRepository` over Postgres (#4),
 *     which the intake, quiz and ranking use cases depend on.
 *
 * Every database-backed member is a getter, so calling `serverDeps()` on a page
 * that only needs the roster never opens a connection -- and `next build` can
 * prerender such pages with no `DATABASE_URL` configured.
 */
export interface Deps {
  db: Db;
  llm: LlmPort;
  roster: ParticipantsPort;
  generatedBlocks: GeneratedBlockRepository;
  /** The per-batch and per-pool-slot locks the generation chain takes. */
  claims: GenerationClaims;
  /** The room's pre-authored batch-1 sets. */
  pool: QuizPoolRepository;
  participants: ParticipantRepository;
  rooms: RoomRepository;
  responses: ResponseRepository;
  latents: LatentRepository;
  photos: PhotoStore;
  /** `prepareResults`, with its repositories already bound (issue #10). */
  ranking: RankingPort;
  /** `prepareProfile`, likewise. Screens name the port, never the use case. */
  profiles: ProfilePort;
  /** `simulatePair`, likewise (issue #33). */
  timelines: TimelinePort;
  /**
   * `scoreParticipant`, repositories already bound (issue #30).
   *
   * Exposed on its own because scoring is no longer only a read-time repair:
   * the quiz schedules it the moment block 15 lands, so the person who just
   * finished has four posteriors before anyone ranks them. It is the SAME
   * binding `rankingDeps()` builds -- one clock, one scorer -- not a second
   * one that could drift.
   */
  scoreParticipant: PrepareResultsDeps["scoreParticipant"];
}

export type ServerDeps = Pick<
  Deps,
  | "db"
  | "llm"
  | "roster"
  | "generatedBlocks"
  | "claims"
  | "pool"
  | "participants"
  | "rooms"
  | "responses"
  | "latents"
  | "photos"
  | "ranking"
  | "profiles"
  | "timelines"
  | "scoreParticipant"
>;

let cachedLlm: LlmPort | undefined;

/**
 * Memoised per process, like `getDb()`, so a warm Fluid Compute instance reuses
 * one gateway client across requests instead of rebuilding it per invocation.
 */
function getLlm(): LlmPort {
  if (!cachedLlm) cachedLlm = createGatewayLlm();
  return cachedLlm;
}

/** Test seam: drops the memoised LLM client so a test can swap the model. */
export function resetLlm(): void {
  cachedLlm = undefined;
}

/**
 * What `prepareResults` and `prepareProfile` rank through (issue #10).
 *
 * Built per call rather than memoised, like every other database-backed member:
 * a repository over `getDb()` is a closure, not a connection. `scoreParticipant`
 * arrives pre-bound because the ranking use cases hold it as a function, not as
 * a port — which is what lets a test count its invocations.
 */
function rankingDeps(): PrepareResultsDeps {
  const db = getDb();
  const latents = createLatentRepository(db);
  const responses = createResponseRepository(db);
  const generatedBlocks = createGeneratedBlockRepository(db);
  return {
    participants: createParticipantRepository(db),
    latents,
    responses,
    rooms: createRoomRepository(db),
    scoreParticipant: (input) =>
      scoreParticipant(input, {
        responses,
        generatedBlocks,
        latents,
        // One clock, read inside the scorer, so a participant's four rows
        // always share a `computed_at` and #10's freshness comparison is
        // against one instant rather than four.
        now: () => new Date(),
      }),
  };
}

/**
 * Dependencies available on the server today.
 *
 * `llm` used to be deliberately absent -- the only implementations of `LlmPort`
 * were the test doubles in `adapters/llm/fake.ts`, and handing production a fake
 * that quietly returns fixtures is worse than not compiling. It is real now that
 * `adapters/llm/gateway.ts` exists, and this is the single place that knows the
 * model is Sonnet behind AI Gateway: `generateQuizBatch` only ever sees an
 * `LlmPort`, which is why its tests pass `stubLlm()` and touch no network.
 *
 * The result is a structural superset of every use case's deps interface
 * (`GenerationDeps`, `QuizProgressDeps`, ...), so a screen passes
 * `serverDeps()` whole and TypeScript picks the members the use case names.
 *
 * Like the database members it is a getter, so a page that needs neither a model
 * nor a connection opens neither.
 *
 * `photos` is chosen by the presence of `AWS_ENDPOINT_URL_S3` rather than by
 * `NODE_ENV`: Playwright boots a real dev server, so an environment check would
 * have to be right about "dev but under test". No endpoint, no upload -- which
 * is why no e2e run writes to the bucket (docs/domain.md D11 as amended by #25,
 * docs/storage.md). It is deliberately NOT a getter over a memoised client:
 * the variable is read per call so a test can swap the choice, and an
 * `S3Client` is inert until a command is sent, so building one costs nothing
 * and -- unlike every database-backed member above -- opens no connection.
 */
export function serverDeps(): ServerDeps {
  return {
    get db() {
      return getDb();
    },
    /*
     * A getter, unlike the hard-coded module it replaced: the roster now opens
     * a connection, so building `serverDeps()` must not.
     *
     * No slug configured yields an empty roster rather than every room's
     * people mixed together. An empty chooser is a visible, correctable
     * mistake; a chooser showing another venue's attendees is a silent one.
     */
    get roster() {
      return createDbRoster(getDb(), process.env.HOOKAI_ROOM_SLUG ?? "");
    },
    get llm() {
      return getLlm();
    },
    get generatedBlocks() {
      return createGeneratedBlockRepository(getDb());
    },
    get claims() {
      return createGenerationClaimsRepository(getDb());
    },
    get pool() {
      return createQuizPoolRepository(getDb());
    },
    get participants() {
      return createParticipantRepository(getDb());
    },
    get rooms() {
      return createRoomRepository(getDb());
    },
    get responses() {
      return createResponseRepository(getDb());
    },
    get latents() {
      return createLatentRepository(getDb());
    },
    get ranking(): RankingPort {
      const deps = rankingDeps();
      return {
        forSubject: (subjectId, lens) => prepareResults(subjectId, lens, deps),
      };
    },
    get profiles(): ProfilePort {
      const deps = rankingDeps();
      return {
        byId: (personId, viewerId, lens) =>
          prepareProfile(personId, viewerId, lens, deps),
      };
    },
    get timelines(): TimelinePort {
      return createDbTimelines(getDb(), getLlm());
    },
    get scoreParticipant(): PrepareResultsDeps["scoreParticipant"] {
      return rankingDeps().scoreParticipant;
    },
    get photos() {
      return process.env.AWS_ENDPOINT_URL_S3
        ? createNeonObjectStoragePhotoStore()
        : createFakePhotoStore();
    },
  };
}
