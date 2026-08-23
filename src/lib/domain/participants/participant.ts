import type { Avatar } from "../participant/avatar";
/**
 * A person on the demo roster: the id, name and team the impersonation
 * chooser needs, and nothing else.
 *
 * NOT `domain/participant/` (SINGULAR) -- that is the intake aggregate, which
 * owns consent, the photo, the lens gates and the §0 floor. Both directories
 * export a type called `Participant`, both compile at any call site, and only
 * the singular one can be ranked. Import from exactly one and say which.
 *
 * Real names, deliberately, on the ranking too. An earlier draft of the copy
 * rules reserved animal aliases for the room and the ranking; the product
 * chose real names instead, so the compensating control is VIEWER-SCOPING,
 * not pseudonymity:
 *
 *   - a ranking is only ever rendered for the person who ran it -- the port
 *     has no `forRoom()`, only `forSubject(subjectId, lens)` (CONTEXT.md §3);
 *   - anyone below the §0 floor, gate-failed, or not consenting to the active
 *     lens is ABSENT from the read model, never greyed or counted;
 *   - no score, band boundary or percentage crosses the port.
 *
 * An alias would have hidden the name from someone reading over your shoulder
 * while leaving the ranking itself just as addressable. Scoping fixes the
 * disclosure; an alias only dresses it. Do not re-litigate this by reaching
 * for aliases -- change the scoping if the threat model changes.
 */
export interface Participant {
  readonly id: string;
  readonly name: string;
  /** Shown as secondary text so two people called Ana are still tellable apart. */
  readonly team: string;
  /**
   * The plate stored at registration (`participants.avatar`). Optional because
   * the hard-coded demo roster predates it; `placeInRoom` falls back to its
   * index rotation when it is missing.
   */
  readonly avatar?: Avatar | null;
}

/**
 * Fold accents and case away before comparing.
 *
 * Without this, "sofia" fails to find "Sofía" -- which on a Spanish-language
 * roster is most of the room. NFD splits a letter from its diacritic, then the
 * combining-marks range is dropped.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filter a roster by a free-text query.
 *
 * Ranking rule: a name that STARTS with the query outranks one that merely
 * contains it, so typing "an" surfaces Ana before Fernanda. Ties keep the
 * roster's own order, which is alphabetical.
 *
 * An empty query returns the whole roster rather than nothing -- the dropdown
 * opens on focus and an empty list reads as "no one is here".
 */
export function filterParticipants(
  roster: readonly Participant[],
  query: string
): Participant[] {
  const needle = fold(query);
  if (needle === "") return [...roster];

  const starts: Participant[] = [];
  const contains: Participant[] = [];

  for (const person of roster) {
    const name = fold(person.name);
    if (name.startsWith(needle)) {
      starts.push(person);
    } else if (name.includes(needle) || fold(person.team).includes(needle)) {
      contains.push(person);
    }
  }

  return [...starts, ...contains];
}
