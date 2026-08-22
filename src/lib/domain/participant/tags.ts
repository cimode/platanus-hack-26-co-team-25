/**
 * The tag picker vocabulary (PILLARS.md §2 Common Ground): 30 slugs, six in
 * each of interests / media / food / activity / pets. Tags are stored as slugs
 * so the engine's Jaccard kernel compares like with like.
 *
 * The vocabulary is closed on purpose. Free text would make the Jaccard kernel
 * compare "cafe" with "café" and score two coffee people as strangers, and
 * Common Ground carries .21 / .28 of `w_rank` on the romance and friendship
 * lenses -- it is not a decoration.
 */

/** The five groups the picker renders, in the order it renders them. */
export const TAG_GROUPS = {
  interests: [
    "fotografia",
    "ajedrez",
    "astronomia",
    "plantas",
    "videojuegos",
    "manualidades",
  ],
  media: [
    "anime",
    "k-pop",
    "reggaeton",
    "podcasts",
    "cine-de-culto",
    "fantasia",
  ],
  food: [
    "ramen",
    "arepas",
    "cafe-de-especialidad",
    "picante",
    "reposteria",
    "vegetariano",
  ],
  activity: [
    "tango",
    "running",
    "escalada",
    "ciclismo",
    "natacion",
    "senderismo",
  ],
  pets: ["perros", "gatos", "aves", "reptiles", "peces", "sin-mascotas"],
} as const satisfies Record<string, readonly string[]>;

export type TagGroup = keyof typeof TAG_GROUPS;

/** Every slug the picker offers, flattened. */
export const TAGS: readonly string[] = Object.values(TAG_GROUPS).flat();

/** `participants_tags_cap` in SQL is the same number (docs/domain.md §3). */
export const MAX_TAGS = 12;

/** Known slugs only, at most 12. Throws naming what failed. */
export function validateTags(tags: string[]): void {
  if (tags.length > MAX_TAGS) {
    throw new Error(`tags: at most ${MAX_TAGS}, got ${tags.length}`);
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!TAGS.includes(tag)) {
      throw new Error(`tags: "${tag}" is not one of the ${TAGS.length} slugs`);
    }
    if (seen.has(tag)) {
      throw new Error(`tags: "${tag}" appears twice`);
    }
    seen.add(tag);
  }
}
