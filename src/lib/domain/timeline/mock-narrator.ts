/**
 * mock-narrator.ts -- the DETERMINISTIC narrator, moved verbatim from
 * `timeline/lib/narrator.ts` (its mock half: `TEMPLATES`, `fillTemplate`,
 * `mockNarrateBeat`, and the seeded mock nomination inside `nominate`).
 *
 * It is the reason `src/lib/domain/timeline/` can be driven with no model at
 * all. `generateTimeline` takes its narrator as a PARAMETER (dependency
 * inversion, `docs/testing.md`); this module is the parameter you pass when
 * there is no model, and the per-beat fallback the adapter reaches for when a
 * beat's own call fails. A model outage degrades the prose to these sentences
 * -- never the structure (issue #33 AC-4).
 *
 * Pure: no SDK, no I/O, no `Math.random`, no `Date`.
 */

import type { Lens, PairScore, Person } from "../matching/engine.ts";
import type {
  Beat,
  EventKind,
  GrammarSpace,
  NarrateResult,
  NominateResult,
  Nomination,
  TimelineNarrator,
  TimelineOpts,
} from "./shared.ts";
import { hashSeed, mulberry32, pick, sharedTags } from "./shared.ts";

const TEMPLATES: Partial<Record<EventKind, readonly string[]>> = {
  milestone: [
    "{hint} — {A} and {B} mark it with a long overdue {tag} day.",
    "{hint}; it quietly becomes the thing they measure other years against.",
    "{hint} — small on paper, load-bearing in practice.",
  ],
  move: [
    "{hint}; boxes, a new map pin, and a week of figuring out where the good {tag} spot is.",
    "{hint} — {A} scouts the neighborhood, {B} handles the logistics, and it works.",
    "{hint}; the new place is smaller than promised and better than expected.",
  ],
  job: [
    "{hint} — the calendars take a month to recover, then find a new rhythm.",
    "{hint}; {A} and {B} celebrate with the {tag} tradition they never skip.",
    "{hint} — a bet on the long game, made together.",
  ],
  pet: [
    "{hint} — naming rights are settled over {tag}, and the couch is never the same.",
    "{hint}; within a month neither can remember the place without it.",
  ],
  kid: [
    "{hint} — the household reorganizes around a very small new boss.",
    "{hint}; sleep gets rare, the {tag} plans go on pause, and neither would trade it.",
  ],
  ritual: [
    "{hint} — it starts as a joke and calcifies into the calendar.",
    "{hint}; miss it once and the week feels off. They stop missing it.",
    "Every year since, {hint} — the ritual {A} and {B} defend against every scheduling conflict.",
  ],
  trip: [
    "{hint} — the photos are terrible and the stories are excellent.",
    "{hint}; they come back with an inside joke that survives the decade.",
    "{hint} — planned around {tag}, derailed by weather, rescued by improvisation.",
  ],
  conflict: [
    "{hint} — a rough stretch; both keep showing up anyway.",
    "{hint}; the disagreement is real and neither pretends otherwise.",
    "{hint} — they name the problem out loud, which is harder than it sounds.",
  ],
  recovery: [
    "{hint} — the repair takes actual work, and it lands.",
    "{hint}; what changes is not the problem but how they schedule around it.",
    "{hint} — an honest reset, and the {tag} plans resume.",
  ],
  venture: [
    "{hint} — the whiteboard photo from that night becomes the company origin story.",
    "{hint}; {A} and {B} split the work along the seam that was always there.",
  ],
  client: [
    "{hint} — the first yes changes the tone of every meeting after it.",
    "{hint}; they frame the invoice. Nobody frames the sixteen drafts behind it.",
  ],
  decision: [
    "{hint} — they write down who decides what, before they need it.",
    "{hint}; the tie-break rule is used twice all year, and respected both times.",
  ],
  exit: [
    "{hint} — the handshake takes a minute; the paperwork takes a quarter.",
    "{hint}; they close the chapter on the timeline they said they would.",
  ],
  dissolution: [
    "{hint} — they wind it down deliberately, on their own terms, with the paperwork done right.",
    "{hint}; the ending is quiet, chosen, and handled like adults.",
  ],
  epilogue: [
    "Years later, {hint} — the respect outlasts the arrangement.",
    "{hint}; from a distance, each still roots for the other.",
  ],
  vignette: [
    "{hint} — it becomes one of those stories {A} and {B} keep retelling.",
    "{hint}; the {tag} habit they share does the heavy lifting.",
    "{hint} — nobody plans it, everybody remembers it.",
  ],
};

const DEFAULT_TEMPLATES: readonly string[] =
  TEMPLATES.vignette as readonly string[];

function fillTemplate(
  tpl: string,
  beat: Beat,
  a: Person,
  b: Person,
  tag: string
): string {
  const hint = beat.hint.trim().replace(/[.;]\s*$/, "");
  let text = tpl
    .replace(
      /\{hint\}/g,
      hint || `year ${beat.year} brings a ${beat.domain} moment`
    )
    .replace(/\{A\}/g, a.name)
    .replace(/\{B\}/g, b.name)
    .replace(/\{tag\}/g, tag);
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

/** Deterministic mock prose for one beat (exported for reuse in approach C's fallback). */
export function mockNarrateBeat(
  beat: Beat,
  a: Person,
  b: Person,
  seed: number,
  index: number
): string {
  const rng = mulberry32(
    hashSeed(seed, a.id, b.id, beat.year, beat.kind, index)
  );
  const shared = sharedTags(a, b);
  const tagPool =
    shared.length > 0 ? shared : [...a.declared.tags, ...b.declared.tags];
  const tag = tagPool.length > 0 ? pick(rng, tagPool) : "weekend";
  const templates = TEMPLATES[beat.kind] ?? DEFAULT_TEMPLATES;
  return fillTemplate(pick(rng, templates), beat, a, b, tag);
}

/**
 * Every beat's deterministic sentence, in beat order. `narration: 'mock'` is
 * the honest label: nothing here saw a model.
 */
export function mockNarrate(
  beats: readonly Beat[],
  persons: readonly [Person, Person],
  _lens: Lens,
  opts: TimelineOpts
): Promise<NarrateResult> {
  const [a, b] = persons;
  return Promise.resolve({
    texts: beats.map((beat, i) => mockNarrateBeat(beat, a, b, opts.seed, i)),
    narration: "mock",
  });
}

/**
 * The seeded bonus-arc nomination, lifted verbatim from `nominate()`'s mock
 * branch. It proposes from the SAME grammar the live path does, so
 * `verifyTriggerClaim` still has something real to admit or reject and the
 * offline structure stays fully deterministic.
 */
export function mockNominate(
  a: Person,
  b: Person,
  score: PairScore,
  lens: Lens,
  grammar: GrammarSpace,
  opts: TimelineOpts
): Promise<NominateResult> {
  const rng = mulberry32(hashSeed(opts.seed, "nominate", a.id, b.id, lens));
  const useFriction = score.friction !== null && rng() < 0.5;
  const term = useFriction
    ? (score.friction?.term ?? "commonGround")
    : (score.drivers[0]?.term ?? "commonGround");
  const nomination: Nomination = {
    pattern: pick(rng, grammar.patterns),
    domain: pick(rng, grammar.domains),
    outcome: pick(rng, grammar.outcomes),
    triggerClaim: `${useFriction ? "friction" : "driver"}:${term}`,
  };
  return Promise.resolve({ nomination, narration: "mock" });
}

/** The whole narrator, with no model behind it. The default `generateTimeline` takes. */
export const mockNarrator: TimelineNarrator = {
  narrate: mockNarrate,
  nominate: mockNominate,
};
