import type { Db } from "./adapters/db/client";
import { getDb } from "./adapters/db/client";
import { createGeneratedBlockRepository } from "./adapters/db/generated-block-repository";
import { createLatentRepository } from "./adapters/db/latent-repository";
import { createMeetRepository } from "./adapters/db/meet-repository";
import { createParticipantRepository } from "./adapters/db/participant-repository";
import { createResponseRepository } from "./adapters/db/response-repository";
import { createRoomRepository } from "./adapters/db/room-repository";
import { createDbRoster } from "./adapters/db/roster";
import { createGatewayLlm } from "./adapters/llm/gateway";
import { createFakeOffspringStudio } from "./adapters/offspring/fake";
import { createOpenAiOffspringStudio } from "./adapters/offspring/openai";

import { createFakePhotoStore } from "./adapters/storage/fake-photo-store";
import { createNeonObjectStoragePhotoStore } from "./adapters/storage/neon-object-storage-photo-store";
import { createDbTimelines } from "./adapters/timeline";
import type { GeneratedBlockRepository } from "./ports/generated-block-repository";
import type { LatentRepository } from "./ports/latent-repository";
import type { LlmPort } from "./ports/llm";
import type { MeetPort } from "./ports/meet";
import type { OffspringStudio } from "./ports/offspring";
import type { ParticipantRepository } from "./ports/participant-repository";
import type { ParticipantsPort } from "./ports/participants";
import type { PhotoStore } from "./ports/photo-store";
import type { ProfilePort } from "./ports/profile";
import type { RankingPort } from "./ports/ranking";
import type { ResponseRepository } from "./ports/response-repository";
import type { RoomRepository } from "./ports/room-repository";
import type { TimelinePort } from "./ports/timeline";
import { meetInbox, proposeMeet, respondToMeet } from "./use-cases/meet";
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
  /** The rows recording which twelve bank blocks each participant was shown. */
  generatedBlocks: GeneratedBlockRepository;
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
  /** The meet loop: request -> accept/decline (CONTEXT.md §5), bound like `ranking`. */
  meets: MeetPort;
  /** The AI-offspring studio for the `/match` reveal (CONTEXT.md §3 step 6). */
  offspring: OffspringStudio;
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
  | "participants"
  | "rooms"
  | "responses"
  | "latents"
  | "photos"
  | "ranking"
  | "profiles"
  | "timelines"
  | "meets"
  | "offspring"
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
 * `llm` is real, and this is the single place that knows the model is Sonnet
 * behind AI Gateway: `simulatePair` and the timeline narrator only ever see an
 * `LlmPort`, which is why their tests pass `stubLlm()` and touch no network.
 * Nothing on the quiz path reaches it any more -- a question is twelve rows
 * dealt from the committed bank, so the form costs no model call at all.
 *
 * The result is a structural superset of every use case's deps interface
 * (`QuizProgressDeps`, `AssignQuizFormDeps`, ...), so a screen passes
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
    /*
     * Bound over `rankingDeps()`, not over `serverDeps()` -- `proposeMeet`
     * authorises through `rankSubjectRoom`, which needs `byIdForRanking`, and
     * only the ranking slice carries it. Same construction as `ranking` and
     * `profiles` above, for the same reason.
     */
    get meets(): MeetPort {
      const deps = { ...rankingDeps(), meets: createMeetRepository(getDb()) };
      return {
        propose: (input) => proposeMeet(input, deps),
        respond: (requestId, viewerId, accept) =>
          respondToMeet(requestId, viewerId, accept, deps),
        inbox: (viewerId) => meetInbox(viewerId, deps),
      };
    },
    get scoreParticipant(): PrepareResultsDeps["scoreParticipant"] {
      return rankingDeps().scoreParticipant;
    },
    get photos() {
      return process.env.AWS_ENDPOINT_URL_S3
        ? createNeonObjectStoragePhotoStore()
        : createFakePhotoStore();
    },
    // The AI-offspring studio (CONTEXT.md §3 step 6). Chosen by the presence of
    // `OPENAI_API_KEY`, the same way `photos` keys on the storage endpoint: the
    // real image model when it is set, a committed placeholder when it is not,
    // so `/match` renders with or without a credential. Building either opens
    // no socket, so this stays a getter like the members above.
    get offspring() {
      return process.env.OPENAI_API_KEY
        ? createOpenAiOffspringStudio()
        : createFakeOffspringStudio();
    },
  };
}
