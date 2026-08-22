/**
 * A person in the room.
 *
 * Real names, deliberately. The Dipia copy rules reserve animal aliases for
 * the room and the ranking -- surfaces where a stranger sees you before you
 * have matched. Impersonation is an internal demo control, so it addresses
 * people by the name they signed up with.
 */
export interface Participant {
  readonly id: string;
  readonly name: string;
  /** Shown as secondary text so two people called Ana are still tellable apart. */
  readonly team: string;
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
