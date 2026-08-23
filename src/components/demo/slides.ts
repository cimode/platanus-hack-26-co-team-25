/**
 * The demo deck's content, kept out of the renderer.
 *
 * Platanus's guide is explicit that a slide title must carry a MESSAGE, not a
 * label -- "aumenta la productividad 10x", never "problema". Every `title`
 * below is therefore a claim you could argue with. There is no slide called
 * "El problema" and there must never be one.
 *
 * Timings are the spoken budget, not a transition duration: problema ~20s and
 * solución ~20-30s, so everything before `live` has to land inside ~50s. The
 * numbers are here so the total can be asserted rather than estimated -- see
 * `slides.test.ts`.
 */

export type Slide =
  | { kind: "cover"; id: string; lede: string }
  | {
      kind: "statement";
      id: string;
      /** The message. Large, display face. */
      title: string;
      /** Optional second line, quieter. */
      sub?: string;
      /** Optional attribution / source, quietest. */
      source?: string;
      /** Spoken seconds this slide is budgeted for. */
      seconds: number;
    }
  | {
      kind: "figures";
      id: string;
      title: string;
      figures: { value: string; label: string }[];
      /** One line under the figures, in the accent. Carries a claim the title does not. */
      footer?: string;
      seconds: number;
    }
  | {
      kind: "scenario";
      id: string;
      /** Runs into the figure: "Imaginá que estás en un evento con" */
      setup: string;
      /** The scale. Display face, accent, very large. */
      figure: string;
      /** The question the figure makes unanswerable. */
      question: string;
      seconds: number;
    }
  | {
      kind: "loop";
      id: string;
      title: string;
      /** Steps that happen INSIDE the app. */
      steps: string[];
      /** The step that happens outside it -- the point of the whole diagram. */
      exit: { label: string; note: string };
      seconds: number;
    }
  | { kind: "live"; id: string; seconds: number }
  | { kind: "closing"; id: string; line: string };

export const SLIDES: Slide[] = [
  // The cover carries only the FRAGMENT; the closing slide completes it into
  // "Nos apasionan las conexiones reales, no un número más en un feed." Two
  // words are enough to plant it, and leaving the sentence unfinished for three
  // minutes is what makes the closing land as a payoff rather than a repeat.
  // Lowercase to echo the wordmark. Change one and you must change the other.
  {
    kind: "cover",
    id: "cover",
    lede: "conexiones reales",
  },

  // The opener is a question asked to the room, so the slide stays almost
  // empty on purpose: the audience should be looking at the speaker, not
  // reading ahead of him.
  {
    kind: "statement",
    id: "pregunta",
    title: "¿Quién acá se ha sentido solo?",
    sub: "No físicamente. Emocionalmente.",
    seconds: 8,
  },

  {
    kind: "statement",
    id: "uno-de-cinco",
    title: "1 de cada 5 jóvenes se siente crónicamente solo.",
    source: "OMS · Comisión sobre Conexión Social, 2025",
    seconds: 7,
  },

  // Two states that treated loneliness as a portfolio-level emergency. Colombia
  // is the FOOTER, not a third figure: it never created a ministry, and putting
  // its number in the same row would make the title assert something false.
  // The local number lands harder there anyway -- it is the room they are in.
  {
    kind: "figures",
    id: "ministerios",
    title: "Hay países que le crearon un ministerio.",
    figures: [
      { value: "2018", label: "Reino Unido" },
      { value: "2021", label: "Japón" },
    ],
    footer:
      "En Colombia, 1 de cada 3 adultos reportan que no tienen a ese “alguien” en quien confiar.",
    seconds: 13,
  },

  // 100/hora x 3 min = 5.0 exactly, and the demo is capped at 3:01. The number
  // is not a rhetorical flourish -- it is the length of this talk.
  {
    kind: "statement",
    id: "epidemia",
    title: "En estos 3 minutos van a morir 5 personas de soledad.",
    sub: "La llaman la epidemia silenciosa del siglo XXI.",
    source: "~100 por hora · 871.000 al año · OMS, 2025",
    seconds: 12,
  },

  {
    kind: "statement",
    id: "tesis",
    title: "Construir vínculos no es magia. Es ciencia.",
    sub: "Y la ciencia es replicable.",
    source: "Basta una conexión profunda para cambiar el pronóstico.",
    seconds: 11,
  },

  // The scale is the argument: at 15.000 the question stops being "¿me animo?"
  // and becomes "¿a quién?" -- which is a search problem, and search problems
  // have engineering answers. This is the hinge into the demo.
  {
    kind: "scenario",
    id: "escenario",
    setup: "Imaginá que estás en un evento con",
    figure: "15.000 personas",
    question: "Querés conocer a alguien. ¿Cómo sabés a quién?",
    seconds: 9,
  },

  // The loop. Four steps in the app, one outside it.
  //
  // The exit step is the whole diagram: "cruzás la sala" is the only thing here
  // that dipia does not do, and the product succeeds exactly when it stops
  // being used. The earlier version of this graphic buried that as small caps
  // on box 6 of 6; here it is the payoff, set apart and in the accent.
  //
  // Five steps, not six -- six boxes in a grid with dashed arrows does not read
  // from the back of a dark room, and "entrás a la sala" is already established
  // by the scenario slide before it.
  {
    kind: "loop",
    id: "loop",
    title: "De una sala llena de extraños a una conversación.",
    steps: [
      "Respondés 12 preguntas",
      "Elegís un lente",
      "La sala se ordena",
      "Ves la vida que compartirían",
    ],
    exit: { label: "Cruzás la sala", note: "fuera de la pantalla" },
    seconds: 13,
  },

  { kind: "live", id: "demo", seconds: 130 },

  {
    kind: "closing",
    id: "cierre",
    line: "Nos apasionan las conexiones reales, no un número más en un feed.",
  },
];

/** Total spoken budget before the live demo begins. Must fit problema + solución. */
export const SETUP_SECONDS = SLIDES.filter(
  (s) => s.kind !== "cover" && s.kind !== "closing" && s.kind !== "live"
).reduce((total, s) => total + s.seconds, 0);
