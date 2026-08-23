import {
  type DECLARED_BAND_KEYS,
  TAG_GROUPS,
  type TagGroup,
} from "@/lib/domain/participant";

/**
 * The copy of the declared round (issue #8, reshaped by #42).
 *
 * Server (the page picks which screen to render) and client (the screen renders
 * it) both read this, so it lives in a plain module rather than inside the
 * `"use client"` island: every export of a `"use client"` module crosses the
 * boundary as a client reference, and a server component importing one gets a
 * proxy instead of the array.
 *
 * Every band is asked as a QUESTION and nothing else is on screen -- no label,
 * no hint, no screen title, nothing that names the axis (the product correction
 * of 2026-08-22). The question is the radio group's accessible name and the
 * only handle a test has on it.
 *
 * The four options keep the exact 0..3 semantics the six columns have always
 * stored: index 0 is the low end of the band, index 3 the high end (D6). Only
 * the words changed.
 */

/** The six band columns, keyed the way `DeclaredProfile` keys them. */
export type BandKey = (typeof DECLARED_BAND_KEYS)[number];

export interface BandCopy {
  key: BandKey;
  /**
   * What the radio group posts under. Deliberately opaque: the column name
   * would otherwise be served in the markup AND in the RSC payload, and
   * "rootedness" in the bytes names the axis just as loudly as a heading would
   * (issue #42, AC-5). The action maps it back.
   */
  field: string;
  /** The radio group's accessible name. Ends in "?" -- it is a question. */
  question: string;
  /** Exactly four, and the index IS the band that gets stored (D6). */
  options: readonly [string, string, string, string];
}

export const BANDS: Record<BandKey, BandCopy> = {
  // 0 = every peso counts … 3 = spends freely.
  moneyPosture: {
    key: "moneyPosture",
    field: "q1",
    question: "¿Cómo va tu bolsillo este mes?",
    options: [
      "Cuento cada peso, incluso los del cafecito",
      "Ando con cuidado y me cuadra",
      "Tranquilo, alcanza y sobra un poco",
      "Gasto primero y reviso después",
    ],
  },
  // 0 = could leave tomorrow … 3 = not going anywhere.
  rootedness: {
    key: "rootedness",
    field: "q2",
    question: "¿Qué tan pegado estás al lugar donde vives?",
    options: [
      "Me voy mañana con una maleta",
      "Me mudaría sin hacer drama",
      "Ya eché raíces, pero cortitas",
      "De aquí no me saca ni una grúa",
    ],
  },
  // 0 = barely … 3 = everything orbits it.
  familyGravity: {
    key: "familyGravity",
    field: "q3",
    question: "¿Cuánto pesa tu familia en una semana normal?",
    options: [
      "Casi nada, nos escribimos en cumpleaños",
      "De vez en cuando, sin agenda",
      "Bastante: hay llamada fija",
      "Todo gira alrededor, almuerzo incluido",
    ],
  },
  // 0 = almost none … 3 = most of it.
  capacityHoursBand: {
    key: "capacityHoursBand",
    field: "q4",
    question:
      "En las últimas cuatro semanas, ¿cuánto tiempo le dedicaste a lo que tú elegiste?",
    options: [
      "Casi nada, el día se me evaporó",
      "Unas pocas horas sueltas",
      "Un buen rato cada semana",
      "Casi todo mi tiempo libre",
    ],
  },
  // 0 = same day … 3 = whenever it happens.
  distanceBand: {
    key: "distanceBand",
    field: "q5",
    question:
      "Conoces a alguien con quien conectas. ¿Cuánto tardas en escribirle?",
    options: [
      "El mismo día, antes de que se enfríe",
      "Antes de que se acabe la semana",
      "En algún momento del mes",
      "Cuando se dé, se dio",
    ],
  },
  // 0 = early bird … 3 = night owl.
  chronotype: {
    key: "chronotype",
    field: "q6",
    question: "¿A qué hora funcionas de verdad?",
    options: [
      "Amanezco con energía sospechosa",
      "Rindo en la mañana, sin exagerar",
      "Arranco cuando cae la tarde",
      "Soy criatura de la madrugada",
    ],
  },
};

/** Which band a posted field belongs to -- the inverse of `BandCopy.field`. */
export const BAND_OF_FIELD: Record<string, BandKey> = Object.fromEntries(
  Object.values(BANDS).map((band) => [band.field, band.key])
);

/** The tag picker's question, asked exactly like a band (AC-5). */
export const TAGS_QUESTION = "¿En qué se te va el tiempo libre?";

export interface DeclaredScreen {
  /** What `?screen=` carries and what the form posts back. */
  id: string;
  bands: readonly BandKey[];
  /** The tag picker rides on the last screen. */
  tags: boolean;
}

/**
 * The round, split into screens.
 *
 * ~26 taps is a lot for one scroll on a 390 px phone, and each Continue
 * persists its own screen, so an abandoner keeps what they tapped
 * (`PILLARS.md` §8 -- the declared round is the demo insurance).
 *
 * The last band and the tag picker share the LAST screen on purpose:
 * `declared_at` is set by the repository the moment the sixth band lands, and
 * `/intake/declared` forwards a participant whose round is complete straight
 * into the questions. A tag screen after the sixth band would therefore be a
 * screen nobody could ever return to.
 */
export const DECLARED_SCREENS: readonly DeclaredScreen[] = [
  {
    id: "a",
    bands: ["moneyPosture", "rootedness", "familyGravity"],
    tags: false,
  },
  {
    id: "b",
    bands: ["capacityHoursBand", "distanceBand"],
    tags: false,
  },
  {
    id: "c",
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
  interests: "ratos libres",
  media: "pantallas",
  food: "comida",
  activity: "movimiento",
  pets: "animales",
};

export const TAG_GROUP_ORDER = Object.keys(TAG_GROUPS) as TagGroup[];
