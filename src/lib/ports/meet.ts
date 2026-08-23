import type { MeetInbox } from "../domain/meet/meet";
import type { ProposeMeetInput } from "../use-cases/meet";

/**
 * The meet loop as the SCREENS name it — the same shape `RankingPort`,
 * `ProfilePort` and `TimelinePort` take.
 *
 * It exists because `proposeMeet` authorises through `rankSubjectRoom`, so its
 * dependency is `PrepareResultsDeps` — the ranking slice, with
 * `byIdForRanking` — and not the plain `ParticipantRepository` that
 * `serverDeps()` carries. Composition binds `rankingDeps()` once behind this
 * port, exactly as it already does for the other three, so a Server Action
 * passes nothing and cannot bind the wrong repository.
 */
export interface MeetPort {
  /** `true` when a request now exists (or already did) for this pair. */
  propose(input: ProposeMeetInput): Promise<boolean>;
  /** `true` when a pending request addressed to this viewer was answered. */
  respond(
    requestId: string,
    viewerId: string,
    accept: boolean
  ): Promise<boolean>;
  /** Everything `/encuentros` renders for one viewer. */
  inbox(viewerId: string): Promise<MeetInbox>;
}
