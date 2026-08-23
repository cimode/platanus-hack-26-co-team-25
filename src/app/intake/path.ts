/**
 * The URL the registration screen renders at; the page re-resolves the slug
 * against `rooms` (docs/domain.md D9). `/qr` encodes it, so a scanned code
 * lands on the form with the room already chosen.
 *
 * This is all that is left of `guards.ts`: the guard it used to export served
 * the declared screens, and the declared round is out of the flow (D20).
 */
export function intakePath(slug: string): string {
  return `/intake?${new URLSearchParams({ room: slug }).toString()}`;
}
