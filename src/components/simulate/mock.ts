import type { RankCandidate } from "@/components/rank/mock";
import type { RankedRoom } from "@/lib/domain/reveal/rank";
import type {
  Ending,
  EventKind,
  LifeEvent,
  SimulatedLife,
} from "@/lib/domain/reveal/timeline";

/**
 * Fixture data for screen 1f.
 *
 * MOCK, and its expiry is issue #33 (`simulate-pair`), which generates these
 * from the real `timeline/` engine. Colocated with the screen for the same
 * reason as the other two (R10): a fixture behind a port looks like a swap
 * somebody already designed, when the real swap is #33 landing and one line
 * naming it.
 *
 * It deliberately does NOT structurally satisfy `TimelinePort.simulate`. That
 * port takes `{subjectId, otherId, lens}` and returns a promise; this takes the
 * `RankedRoom` screen 1c already built, so eligibility is resolved by the SAME
 * ranking rather than by a second rule that could disagree with it. Pretending
 * to be an adapter would buy a swap nobody is going to make -- #33 replaces the
 * call site, not this signature.
 *
 * Everything here is prose about two named people, so two rules hold
 * throughout: neutral Spanish with no voseo, and no gendered adjective, because
 * the roster carries names and not genders. Both are tested.
 */

/** 8-14 romantic, 5-10 business (`timeline.ts`). NEVER a hardcoded 12. */
const HORIZON: Record<"romantic" | "business", readonly [number, number]> = {
  romantic: [8, 14],
  business: [5, 10],
};

/**
 * Three phrasings per kind, so the same person reads differently under a
 * different lens -- the lens is in the seed, so the picks diverge.
 *
 * `kid` is allusive on purpose. Its chip is "Peque" and `event-tag.ts` is
 * explicit that the tag is a tag and nothing more: no offspring affordance
 * renders in this change, and narrating one in prose would be the same
 * disclosure through a different door (AC-PORT-8).
 */
const NARRATION: Record<EventKind, readonly [string, string, string]> = {
  milestone: [
    "Cumplen algo que al principio sonaba a chiste entre los dos.",
    "Un aniversario cualquiera termina siendo el que recuerdan.",
    "Marcan una fecha en el calendario y esta vez la cumplen.",
  ],
  move: [
    "Cambian de barrio y tardan un mes en encontrar el café bueno.",
    "La mudanza sale mal y se ríen de eso durante años.",
    "Una casa nueva, con una cocina que por fin les queda cómoda.",
  ],
  job: [
    "Uno de los dos cambia de trabajo y el otro reorganiza sus horarios.",
    "Llega un ascenso que obliga a renegociar quién cocina.",
    "Un año raro en el trabajo, sostenido desde la casa.",
  ],
  pet: [
    "Adoptan un animal que nadie planeó y todos defienden.",
    "Llega una mascota y la casa cambia de reglas.",
    "Un rescate de la calle que se queda para siempre.",
  ],
  kid: [
    "Aparece una conversación que venían posponiendo, y esta vez la terminan.",
    "Toman una decisión grande y la toman despacio.",
    "Algo que solo era hipotético deja de serlo.",
  ],
  ritual: [
    "Inventan una costumbre semanal que no le explican a nadie.",
    "Los domingos empiezan a tener una forma propia.",
    "Un ritual pequeño que sostiene los meses difíciles.",
  ],
  trip: [
    "Un viaje corto que estiran hasta donde alcanza el presupuesto.",
    "Se pierden en una ciudad que ninguno había elegido.",
    "Dos semanas afuera y una lista de cosas para repetir.",
  ],
  conflict: [
    "Una pelea larga sobre algo que era chico y no lo parecía.",
    "Chocan fuerte y tardan una semana en volver a hablarse.",
    "Un desacuerdo que descubre algo que faltaba decir.",
  ],
  recovery: [
    "Se piden perdón sin apuro y esta vez sirve.",
    "Vuelven después del silencio, con menos orgullo.",
    "Reparan lo que se rompió y queda más firme que antes.",
  ],
  venture: [
    "Arrancan algo propio con más entusiasmo que plan.",
    "Un proyecto lateral que empieza a ocupar los fines de semana.",
    "Registran una idea que venían masticando hace meses.",
  ],
  client: [
    "El primer cliente grande llega y con él las primeras discusiones.",
    "Cierran un contrato que les cambia el año.",
    "Un cliente difícil los obliga a ponerse de acuerdo rápido.",
  ],
  exit: [
    "Venden su parte en buenos términos y con una cena larga.",
    "Cierran el capítulo con las cuentas claras.",
    "Una salida ordenada, que no todos consiguen.",
  ],
  decision: [
    "Discuten quién decide qué, y por fin lo escriben.",
    "Una decisión importante queda en manos de uno solo.",
    "Reparten el mando y les cuesta más de lo esperado.",
  ],
  dissolution: [
    "Se separan sin escándalo y con la casa todavía ordenada.",
    "Deciden parar antes de gastarse del todo.",
    "El final llega despacio y los encuentra de acuerdo.",
  ],
  epilogue: [
    "Años después se cruzan y la conversación fluye sola.",
    "Quedan en buenos términos, de los que se preguntan cómo va todo.",
    "Se escriben una vez al año y siempre se contestan.",
  ],
  vignette: [
    "Una tarde sin nada especial que igual recuerdan.",
    "Una escena mínima: dos cafés y una discusión sobre una película.",
    "Un martes cualquiera que después citan como ejemplo.",
  ],
};

/** Declaration order is the story's shape, not its chronology; years sort it. */
const KINDS = Object.keys(NARRATION) as readonly EventKind[];

const EPILOGUES: readonly string[] = [
  "Un año después, la conversación vuelve por su cuenta.",
  "Con el tiempo aprenden a contarlo sin bajar la voz.",
];

/** FNV-1a. Fourth copy; three of them are fixtures that #10 and #33 delete. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One event per kind, spread across the span and sorted ascending.
 *
 * ALL SIXTEEN, every time. AC-SIM-5 asks for a fixture containing one event of
 * each kind so "16 cards, each with exactly one chip" has something to count --
 * and a sampled subset would leave most of `tagFor`'s branches rendered by
 * nothing, which is how a chip mapping ships with a hole in it.
 */
function eventsFor(seed: number, span: number): readonly LifeEvent[] {
  return KINDS.map((kind, index) => {
    const spin = hash(`${seed}:${kind}`);
    const variants = NARRATION[kind];
    return {
      // Spread over the span rather than bunched: `index / KINDS.length` keeps
      // the order of the story while the jitter stops every pair sharing a
      // calendar.
      year: Math.min(
        span,
        1 + Math.floor((index * span) / KINDS.length) + (spin % 2)
      ),
      kind,
      text: variants[spin % variants.length],
    };
  }).sort((a, b) => a.year - b.year);
}

/**
 * Together or apart, with both branches reachable across one roster.
 *
 * Keyed so that roughly a third end apart and, of those, half carry an
 * epilogue. If the split were probabilistic, one of the ending card's branches
 * would ship rendered by nothing -- which is exactly the defect two verify
 * passes found on screens 1c and 1d.
 */
function endingFor(seed: number, horizonYears: number): Ending {
  if (seed % 3 !== 0) return { outcome: "together" };
  return {
    outcome: "apart",
    year: 1 + ((seed >>> 5) % horizonYears),
    epilogue:
      (seed >>> 11) % 2 === 0
        ? EPILOGUES[(seed >>> 13) % EPILOGUES.length]
        : null,
  };
}

/**
 * One simulated life, as this viewer is allowed to see it.
 *
 * Unknown id, the viewer themselves, and anyone absent from the viewer's
 * ranking all reach the same `null`. The caller renders one `notFound()` and
 * cannot leak which it was -- a distinguishable 404 is an oracle for who is in
 * the room (AC-SIM-2).
 */
export function mockSimulatedLife(
  otherId: string,
  room: RankedRoom,
  candidates: readonly RankCandidate[]
): SimulatedLife | null {
  if (room.status !== "ranked") return null;
  if (otherId === room.viewer.id) return null;

  const entry = room.entries.find((candidate) => candidate.id === otherId);
  const source = candidates.find((candidate) => candidate.id === otherId);
  if (!(entry && source)) return null;

  const seed = hash(`life:${room.lens}:${room.viewer.id}:${otherId}`);
  const base = {
    subject: { id: room.viewer.id, name: room.viewer.name },
    other: { id: entry.id, name: entry.name, photoUrl: entry.photoUrl },
  };

  if (room.lens === "friendship") {
    // No horizon KEY, not a null one. Friendship makes no duration claim
    // (PILLARS.md §6.1), and the span below only spaces the events out -- it is
    // never rendered and nothing may read it as a horizon.
    return {
      ...base,
      lens: "friendship",
      events: eventsFor(seed, 6 + (seed % 7)),
    };
  }

  const [low, high] = HORIZON[room.lens];
  const horizonYears = low + (seed % (high - low + 1));

  return {
    ...base,
    lens: room.lens,
    horizonYears,
    events: eventsFor(seed, horizonYears),
    ending: endingFor(seed, horizonYears),
  };
}
