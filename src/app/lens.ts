/**
 * Shared shape for the lens choice.
 *
 * Separate from `actions.ts` for the same reason as `impersonation.ts`: a
 * `"use server"` module may export nothing but async functions.
 */

/** Which lens the room is being read through. */
export const LENS_COOKIE = "dipia_lens";
