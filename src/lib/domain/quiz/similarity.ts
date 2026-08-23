/**
 * similarity.ts — does this scenario retell one the participant already read?
 *
 * The author prompt is told what to avoid, and the judge is asked to fail
 * repeats, but both are requests to a model. This is the refusal: a pure,
 * cheap check the author loop runs on every candidate against everything the
 * participant has seen and against the batch's own accepted siblings. A hit
 * becomes a repair problem quoting the scenario it repeats.
 *
 * Three signals, any one of which is a hit, measured on real duplicates the
 * pipeline shipped (see `similarity.test.ts`):
 *
 *   · three or more shared content words — the same cast and props
 *   · two distinct shared runs of two content words — the same phrases. ONE
 *     shared run is not enough: against the room's forty newest scenarios a
 *     single "tamaño real" or "perro vecino" is a coincidence, and a gate
 *     that fires on it rejected sound blocks in production (2026-08-23)
 *   · character 3-gram Jaccard ≥ 0.35 over the content words — near-verbatim
 *
 * A shared MOTIF with different props ("idéntico al tuyo" on a dog, then on a
 * cart) is deliberately not a hit: that is the prompt's job, through the twist
 * kind each position is assigned.
 *
 * Contract: pure TypeScript, no I/O, no model. Spanish-aware only in the
 * stopword list; everything else is language-neutral.
 */

/**
 * Function words that carry no premise. Short, deliberately: a stopword list
 * that grows toward "every common word" starts hiding real repeats ("casa",
 * "perro" and "vecino" are common and are exactly what repeats).
 */
const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "ante",
  "aqui",
  "asi",
  "cada",
  "como",
  "con",
  "cuando",
  "de",
  "del",
  "donde",
  "e",
  "el",
  "ella",
  "ellos",
  "en",
  "entre",
  "era",
  "es",
  "esa",
  "ese",
  "eso",
  "esta",
  "estan",
  "este",
  "esto",
  "hay",
  "la",
  "las",
  "le",
  "les",
  "lo",
  "los",
  "mas",
  "me",
  "mi",
  "mis",
  "muy",
  "ni",
  "no",
  "o",
  "otra",
  "otro",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "si",
  "sin",
  "sobre",
  "solo",
  "su",
  "sus",
  "te",
  "ti",
  "toda",
  "todas",
  "todo",
  "todos",
  "tu",
  "tus",
  "un",
  "una",
  "unas",
  "uno",
  "unos",
  "y",
  "ya",
]);

const MIN_SHARED_WORDS = 3;
const MIN_SHARED_PHRASE = 2;
const MIN_SHARED_PHRASES = 2;
const MIN_TRIGRAM_JACCARD = 0.35;

/** Lowercase, accents stripped, punctuation gone, stopwords dropped. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function trigrams(words: string[]): Set<string> {
  const joined = words.join(" ");
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= joined.length; i++) {
    grams.add(joined.slice(i, i + 3));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}

function sharesPhrase(a: string[], b: string[]): boolean {
  if (a.length < MIN_SHARED_PHRASE || b.length < MIN_SHARED_PHRASE) {
    return false;
  }
  const phrases = new Set<string>();
  for (let i = 0; i + MIN_SHARED_PHRASE <= a.length; i++) {
    phrases.add(a.slice(i, i + MIN_SHARED_PHRASE).join(" "));
  }
  const shared = new Set<string>();
  for (let i = 0; i + MIN_SHARED_PHRASE <= b.length; i++) {
    const phrase = b.slice(i, i + MIN_SHARED_PHRASE).join(" ");
    if (phrases.has(phrase)) shared.add(phrase);
  }
  return shared.size >= MIN_SHARED_PHRASES;
}

/** True when `a` and `b` read as the same premise. Symmetric. */
export function tooSimilar(a: string, b: string): boolean {
  const wordsA = contentWords(a);
  const wordsB = contentWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const setB = new Set(wordsB);
  const shared = new Set(wordsA.filter((word) => setB.has(word))).size;
  if (shared >= MIN_SHARED_WORDS) return true;

  if (sharesPhrase(wordsA, wordsB)) return true;

  return jaccard(trigrams(wordsA), trigrams(wordsB)) >= MIN_TRIGRAM_JACCARD;
}

/** The first of `others` that `scenario` repeats, or null. */
export function repeatedBy(
  scenario: string,
  others: readonly string[]
): string | null {
  for (const other of others) {
    if (tooSimilar(scenario, other)) return other;
  }
  return null;
}
