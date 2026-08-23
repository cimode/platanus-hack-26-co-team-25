/**
 * The quick bio, mocked.
 *
 * **This is a stand-in for an AI step.** Once intake holds real declared data, a
 * model writes these from it; until then the shape has to exist so the screen
 * can be designed and reviewed against something that reads like the real
 * thing. It is deliberately NOT a field on `PersonProfile`: issue #10's
 * `prepareResults` does not produce prose, and putting it in the shared contract
 * would make that issue responsible for something it does not own (R9/R13).
 *
 * Composed from the person's OWN tags rather than invented free-form, so the
 * sentence and the chips underneath it cannot contradict each other -- which is
 * also what the real AI step will be doing, from the same declared data.
 *
 * Neutral Spanish. No voseo, and no gendered adjective anywhere: the roster
 * carries names, not genders, and "Madrugadora" on a person whose gender nobody
 * declared is a guess the product has no business making.
 */

/** Slug to a phrase that can follow "Le gustan". */
const PHRASE: Record<string, string> = {
  fotografia: "la fotografía",
  ajedrez: "el ajedrez",
  astronomia: "mirar estrellas",
  plantas: "las plantas",
  videojuegos: "los videojuegos",
  manualidades: "las manualidades",
  anime: "el anime",
  "k-pop": "el k-pop",
  reggaeton: "el reggaetón",
  podcasts: "los podcasts",
  "cine-de-culto": "el cine de culto",
  fantasia: "la fantasía",
  ramen: "el ramen",
  arepas: "las arepas",
  "cafe-de-especialidad": "el café de especialidad",
  picante: "la comida picante",
  reposteria: "la repostería",
  vegetariano: "la cocina vegetariana",
  tango: "el tango",
  running: "salir a correr",
  escalada: "la escalada",
  ciclismo: "la bici",
  natacion: "la natación",
  senderismo: "el senderismo",
  perros: "los perros",
  gatos: "los gatos",
  aves: "las aves",
  reptiles: "los reptiles",
  peces: "los peces",
  "sin-mascotas": "vivir sin mascotas",
};

/** All third person, all ungendered. */
const OPENERS = [
  "Se levanta temprano y no lo esconde.",
  "Habla poco al principio y mucho después.",
  "Planea todo y después improvisa igual.",
  "Prefiere el plan chico y la conversación larga.",
  "Llega puntual y se queda hasta el final.",
  "Escucha más de lo que habla.",
] as const;

const CLOSERS = [
  "Busca a alguien que no le tema a los domingos lentos.",
  "Busca a alguien con quien no haya que llenar los silencios.",
  "Busca a alguien que también prefiera quedarse un rato más.",
  "Busca a alguien que pregunte y espere la respuesta.",
] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** "a, b y c" -- the Spanish list, with no serial comma. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function mockBio(id: string, tags: readonly string[]): string {
  const seed = hash(`bio:${id}`);
  const liked = tags
    .slice(0, 3)
    .map((tag) => PHRASE[tag])
    .filter(Boolean);

  return [
    OPENERS[seed % OPENERS.length],
    liked.length > 0 ? `Le gustan ${list(liked)}.` : null,
    CLOSERS[(seed >>> 8) % CLOSERS.length],
  ]
    .filter(Boolean)
    .join(" ");
}
