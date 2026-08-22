import {
  type DECLARED_BAND_KEYS,
  TAG_GROUPS,
  type TagGroup,
} from "@/lib/domain/participant";

/**
 * The copy of the declared round (issue #8, PILLARS.md §2 "free pillars").
 *
 * Server (the page picks which screen to render) and client (the screen renders
 * it) both read this, so it lives in a plain module rather than inside the
 * `"use client"` island: every export of a `"use client"` module crosses the
 * boundary as a client reference, and a server component importing one gets a
 * proxy instead of the array.
 *
 * The band LABEL is the accessible name of its radio group -- the only handle a
 * test has on it -- and the hint is deliberately not part of that name.
 */

/** The six band columns, keyed the way `DeclaredProfile` keys them. */
export type BandKey = (typeof DECLARED_BAND_KEYS)[number];

export interface BandCopy {
  key: BandKey;
  /** The radio group's accessible name. */
  label: string;
  /** Rendered under the label; never part of the accessible name. */
  hint: string;
  /** Exactly four, and the index IS the band that gets stored (D6). */
  options: readonly [string, string, string, string];
}

export const BANDS: Record<BandKey, BandCopy> = {
  moneyPosture: {
    key: "moneyPosture",
    label: "Money posture",
    hint: "How you hold money right now.",
    options: ["Every peso counts", "Careful", "Comfortable", "Spends freely"],
  },
  rootedness: {
    key: "rootedness",
    label: "Rootedness",
    hint: "How planted you are where you live.",
    options: [
      "Could leave tomorrow",
      "Open to moving",
      "Fairly planted",
      "Not going anywhere",
    ],
  },
  familyGravity: {
    key: "familyGravity",
    label: "Family gravity",
    hint: "How much the people you grew up with shape an ordinary week.",
    options: ["Barely", "Now and then", "A lot", "Everything orbits it"],
  },
  capacityHoursBand: {
    key: "capacityHoursBand",
    label: "Capacity hours",
    hint: "Time you actually spent on what you chose, over the last four weeks.",
    options: ["Almost none", "A few", "A good chunk", "Most of it"],
  },
  distanceBand: {
    key: "distanceBand",
    label: "Distance and re-contact",
    hint: "You meet someone you click with. How long before you reach out?",
    options: [
      "Same day",
      "Within a week",
      "Within a month",
      "Whenever it happens",
    ],
  },
  chronotype: {
    key: "chronotype",
    label: "Chronotype",
    hint: "When you are actually awake.",
    options: ["Early bird", "Morning-ish", "Evening-ish", "Night owl"],
  },
};

export interface DeclaredScreen {
  /** What `?screen=` carries and what the form posts back. */
  id: string;
  /** Sits beside "Step 4 of 5". */
  title: string;
  bands: readonly BandKey[];
  /** The tag picker rides on the last screen (PILLARS.md §2 Common Ground). */
  tags: boolean;
}

/**
 * The round, split into screens.
 *
 * ~26 taps is a lot for one scroll on a 390 px phone, and each Continue
 * persists its own screen, so an abandoner keeps what they tapped
 * (`PILLARS.md` §8 -- the declared round is the demo insurance).
 *
 * Chronotype and the tag picker share the LAST screen on purpose: `declared_at`
 * is set by the repository the moment the sixth band lands, and `/intake/declared`
 * forwards a participant whose round is complete to the gates. A tag screen
 * after the sixth band would therefore be a screen nobody could ever return to.
 */
export const DECLARED_SCREENS: readonly DeclaredScreen[] = [
  {
    id: "life-shape",
    title: "Life shape — three taps, no wrong answers.",
    bands: ["moneyPosture", "rootedness", "familyGravity"],
    tags: false,
  },
  {
    id: "capacity",
    title: "The time you have, and how you keep in touch.",
    bands: ["capacityHoursBand", "distanceBand"],
    tags: false,
  },
  {
    id: "rhythm",
    title: "Your rhythm, and what you are into.",
    bands: ["chronotype"],
    tags: true,
  },
];

/** The vocabulary, rendered. Keys are the slugs stored in `participants.tags`. */
export const TAG_LABELS: Record<string, string> = {
  fotografia: "Fotografía",
  ajedrez: "Ajedrez",
  astronomia: "Astronomía",
  plantas: "Plantas",
  videojuegos: "Videojuegos",
  manualidades: "Manualidades",
  anime: "Anime",
  "k-pop": "K-pop",
  reggaeton: "Reggaetón",
  podcasts: "Podcasts",
  "cine-de-culto": "Cine de culto",
  fantasia: "Fantasía",
  ramen: "Ramen",
  arepas: "Arepas",
  "cafe-de-especialidad": "Café de especialidad",
  picante: "Picante",
  reposteria: "Repostería",
  vegetariano: "Vegetariano",
  tango: "Tango",
  running: "Running",
  escalada: "Escalada",
  ciclismo: "Ciclismo",
  natacion: "Natación",
  senderismo: "Senderismo",
  perros: "Perros",
  gatos: "Gatos",
  aves: "Aves",
  reptiles: "Reptiles",
  peces: "Peces",
  "sin-mascotas": "Sin mascotas",
};

/** The five groups the picker renders, in the order it renders them. */
export const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  interests: "Interests",
  media: "Media",
  food: "Food",
  activity: "Activity",
  pets: "Pets",
};

export const TAG_GROUP_ORDER = Object.keys(TAG_GROUPS) as TagGroup[];
