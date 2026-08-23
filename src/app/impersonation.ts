/**
 * Shared shape for the impersonation flow.
 *
 * Deliberately NOT in `actions.ts`: a `"use server"` module may export nothing
 * but async functions, so a type living there fails the build with "Only async
 * functions are allowed to be exported in a use server file".
 *
 * The cookie NAME is not here any more. It moved to
 * `src/lib/adapters/http/viewer.ts`, beside the resolver that reads it and the
 * `dipia_session` module it has to be reconciled with -- and it had to move,
 * because `impersonate-form.tsx` is a Client Component that imports this file
 * for `ImpersonateState`, and the resolver pulls in `next/headers`.
 */

export interface ImpersonateState {
  error?: string;
}
