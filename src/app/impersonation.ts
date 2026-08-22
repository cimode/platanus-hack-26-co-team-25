/**
 * Shared shape for the impersonation flow.
 *
 * Deliberately NOT in `actions.ts`: a `"use server"` module may export nothing
 * but async functions, so a constant or a type living there fails the build
 * with "Only async functions are allowed to be exported in a use server file".
 */

/** Who the demo is currently pretending to be. Read by every screen downstream. */
export const IMPERSONATION_COOKIE = "dipia_impersonating";

export interface ImpersonateState {
  error?: string;
}
