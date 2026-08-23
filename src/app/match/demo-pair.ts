/**
 * The two participants the `/match` demo pairs up.
 *
 * Deliberately NOT in `actions.ts`: a `"use server"` module may export nothing
 * but async functions (same reason as `impersonation.ts` and `lens.ts`). Both
 * the page (to render the circles) and the action (to read the bytes) need
 * this, so it lives on its own.
 *
 * `file` names an asset under `public/match/`. The committed placeholders are
 * stand-in faces; drop the real photos in at these exact paths to use them —
 * see `public/match/README.md`.
 */
export interface DemoPerson {
  /** Filename under `public/match/`. */
  readonly file: string;
  /** Content type of that file, sent to the image model verbatim. */
  readonly contentType: string;
  /** Shown under the circle. Alias, never a real name before the match. */
  readonly name: string;
}

export const DEMO_PAIR: readonly [DemoPerson, DemoPerson] = [
  { file: "parent-a.jpg", contentType: "image/jpeg", name: "Oso Dormilón" },
  { file: "parent-b.jpg", contentType: "image/jpeg", name: "Zorro Curioso" },
];

/** The public URL a circle renders the face from. */
export function publicSrc(person: DemoPerson): string {
  return `/match/${person.file}`;
}
