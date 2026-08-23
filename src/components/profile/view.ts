import type { PersonProfile } from "@/lib/domain/reveal/profile";

/**
 * What screen 1d paints: the shared contract plus the one thing the contract
 * does not carry.
 *
 * `bio` is NOT on `PersonProfile` and must not become so. `prepareResults`
 * produces a ranking, not prose; the bio comes from an AI step over intake's
 * declared data and has its own source. Composing them here -- a view type
 * beside the screen -- is the same rule R9/R13 settled: contract if someone
 * else implements it, otherwise view.
 *
 * It lives in its own module rather than beside the fixture that used to build
 * it. A view type sourced from a mock is a type that disappears when the mock
 * does, and `ProfilePort.byId` is designed to delete that mock.
 */
export interface ProfileView extends PersonProfile {
  readonly bio: string;
}
