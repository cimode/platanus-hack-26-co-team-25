/**
 * realize.ts — turns planned (pattern step × domain × outcome) beats into
 * concrete Beat material: EventKind + grounded hint + StateDelta, threaded
 * through world state so events only reference established facts (CONTEXT §3).
 *
 * All authored per-lens content lives here. Hints are written clear of the
 * banned categories (A7/A8) and never state numeric survival odds (AUDIT S10);
 * scanBanned/scanSurvivalClaims still run downstream as the enforcement layer.
 */

import type { OutcomeName, StepName } from "./grammar.ts";
import { FRICTION_GAP_NOUN } from "./grammar.ts";
import type {
  EventKind,
  Lens,
  PairScore,
  Person,
  StateDelta,
  TermName,
  ThreadedState,
} from "./shared.ts";

// ---------------------------------------------------------------------------
// Context threaded to every realization call
// ---------------------------------------------------------------------------

export interface RealizeCtx {
  a: Person;
  b: Person;
  lens: Lens;
  state: ThreadedState; // world state established BEFORE this beat
  shared: string[]; // lowercased shared tags
  rng: () => number; // dedicated realization rng (seeded)
  score: PairScore;
  venture: string; // business venture working name (pre-derived)
  avgExit: number; // business: mean declared exitHorizon (0 short … 2 long)
  frictionDomain: string; // where the friction arc plays out (gap-noun source)
}

export interface RealizedBeat {
  kind: EventKind;
  hint: string;
  delta?: StateDelta;
}

// ---------------------------------------------------------------------------
// Tag & person helpers
// ---------------------------------------------------------------------------

const FOOD_TAGS = [
  "sushi",
  "coffee",
  "tacos",
  "ramen",
  "pizza",
  "asado",
  "baking",
];
const MEDIA_TAGS = [
  "scifi",
  "indie-music",
  "film",
  "anime",
  "books",
  "jazz",
  "gaming",
];
const ACTIVE_TAGS = [
  "climbing",
  "crossfit",
  "yoga",
  "running",
  "hiking",
  "surf",
  "cycling",
];

const lc = (s: string): string => s.toLowerCase();

/** First shared tag matching a category, else any category tag, else any shared, else fallback. */
function tagFrom(
  c: RealizeCtx,
  cats: readonly string[] | null,
  fallback: string
): string {
  if (cats) {
    const sharedHit = c.shared.find((t) => cats.includes(t));
    if (sharedHit) return sharedHit;
    const anyHit = [...c.a.declared.tags, ...c.b.declared.tags]
      .map(lc)
      .find((t) => cats.includes(t));
    if (anyHit) return anyHit;
  }
  if (c.shared.length > 0) return c.shared[0];
  return fallback;
}

/** A tag that is p's alone (not shared) — used to voice the interest-gap. */
function soloTag(p: Person, shared: string[], fallback: string): string {
  return p.declared.tags.map(lc).find((t) => !shared.includes(t)) ?? fallback;
}

/**
 * [more all-in, steadier] by declared capacity hours band (tie → [a, b]).
 * An unmeasured band (D20: the declared round is no longer asked) sits at the
 * midpoint, like `byDistance` already does, so it never wins the ordering.
 */
function byCapacity(c: RealizeCtx): [Person, Person] {
  const ca = c.a.declared.lifeShape.capacityHoursBand ?? 1.5;
  const cb = c.b.declared.lifeShape.capacityHoursBand ?? 1.5;
  return cb > ca ? [c.b, c.a] : [c.a, c.b];
}

/** [stays away longer, waits] by declared re-contact band (tie → [a, b]). */
function byDistance(c: RealizeCtx): [Person, Person] {
  const da = c.a.declared.distanceBand ?? 1;
  const db = c.b.declared.distanceBand ?? 1;
  return db > da ? [c.b, c.a] : [c.a, c.b];
}

/** [less rooted (the mover), more rooted] by declared rootedness. */
function byRootedness(c: RealizeCtx): [Person, Person] {
  const ra = c.a.declared.lifeShape.rootedness ?? 0.5;
  const rb = c.b.declared.lifeShape.rootedness ?? 0.5;
  return rb < ra ? [c.b, c.a] : [c.a, c.b];
}

function petLabel(c: RealizeCtx): string {
  const tags = new Set([...c.a.declared.tags, ...c.b.declared.tags].map(lc));
  if (tags.has("dogs")) return "rescue dog";
  if (tags.has("cats")) return "serious little cat";
  return "scruffy rescue";
}

function gapNoun(domain: string): string {
  return FRICTION_GAP_NOUN[domain] ?? "day-to-day";
}

/** Deterministic pick from a small authored list using the realize rng. */
function pickOf<T>(c: RealizeCtx, items: readonly T[]): T {
  return items[Math.floor(c.rng() * items.length) % items.length];
}

// ---------------------------------------------------------------------------
// Per-lens/domain topics — the noun phrase the generic frames revolve around
// ---------------------------------------------------------------------------

function topicOf(c: RealizeCtx, domain: string): string {
  const st = c.state;
  if (c.lens === "romantic") {
    switch (domain) {
      case "home":
        return "how home should run";
      case "relocation":
        return "the city question";
      case "travel":
        return `the ${tagFrom(c, ACTIVE_TAGS, "coast")} trip list`;
      case "pets":
        return st.pets.length > 0
          ? `the ${st.pets[0]}'s routine`
          : "the pet question";
      case "kids":
        return "the kid question";
      case "ritual":
        return `their ${tagFrom(c, null, "weekly")} night`;
      case "craft":
        return `the ${tagFrom(c, [...ACTIVE_TAGS, ...MEDIA_TAGS], "shared")} project`;
      case "work-balance":
        return "the line between work weeks and their weeks";
      case "conflict-recovery":
        return "the way back after a hard week";
      default:
        return `the ${domain} question`;
    }
  }
  if (c.lens === "business") {
    const v = st.venture ?? c.venture;
    switch (domain) {
      case "runway":
        return "the runway plan";
      case "first-client":
        return `landing ${v}'s first real client`;
      case "decision-rights":
        return "who makes the call when they disagree";
      case "hiring":
        return "the first hire";
      case "product":
        return `what ${v} actually is`;
      case "pivot":
        return "whether to change course";
      case "exit":
        return "what a good ending looks like";
      case "work-rhythm":
        return "their operating rhythm";
      default:
        return `the ${domain} question`;
    }
  }
  switch (domain) {
    case "ritual":
      return `the standing ${tagFrom(c, null, "weekly")} plan`;
    case "trip":
      return `the ${tagFrom(c, ACTIVE_TAGS, "road")} trip`;
    case "hobby":
      return `the ${tagFrom(c, null, "shared")} obsession`;
    case "food":
      return `the ${tagFrom(c, FOOD_TAGS, "late-night food")} rotation`;
    case "media":
      return `the ${tagFrom(c, MEDIA_TAGS, "watchlist")} canon`;
    case "project":
      return "the half-alive side project";
    case "reunion":
      return "getting the whole crew in one room";
    case "distance-texture":
      return "the long-silence rhythm they both trust";
    default:
      return `the ${domain} thing`;
  }
}

// ---------------------------------------------------------------------------
// Generic step frames (used when no domain special overrides the step)
// ---------------------------------------------------------------------------

function genericFrame(
  c: RealizeCtx,
  step: StepName,
  outcome: OutcomeName,
  topic: string
): string {
  const A = c.a.name;
  const B = c.b.name;
  switch (step) {
    case "begin":
      return `${A} and ${B} stumble into ${topic} together and something clicks`;
    case "settle":
      return `${topic} stops being an experiment and becomes how ${A} and ${B} operate`;
    case "seed":
      return `a small start on ${topic} — nothing official, just intent and a shared note`;
    case "progress":
      return `${topic} gets real: a standing slot in both calendars, defended weekly`;
    case "payoff":
      if (outcome === "redirects")
        return `${topic} works so well it quietly rewrites the bigger plan`;
      if (outcome === "lingers")
        return `${topic} lands somewhere imperfect, and they keep it anyway`;
      return `${topic} pays off in a way both of them can point to`;
    case "decide":
      return `${A} and ${B} make the big call on ${topic} — out loud, together`;
    case "aftermath":
      if (outcome === "lingers")
        return `the decision costs a little every month, and they pay it on purpose`;
      if (outcome === "redirects")
        return `the decision drags two more changes behind it, both good in the end`;
      return `the decision settles in, and the new shape holds better than the old one`;
    case "start":
      return `${topic} starts almost by accident and immediately sticks`;
    case "defend":
      return `${topic} survives its first impossible scheduling year, which makes it official`;
    case "clash":
      return `${A} and ${B} hit a real snag over ${topic}`;
    case "repair":
      if (outcome === "strengthens")
        return `they rebuild the deal around ${topic}, sturdier than before`;
      if (outcome === "redirects")
        return `fixing ${topic} means changing something structural, so they change it`;
      return `they land on a workable truce over ${topic} — not solved, but survivable`;
    case "pressure":
      return `outside pressure lands on ${topic} harder than either expected`;
    case "proof":
      return `they hold the line on ${topic}, and it holds them up in return`;
    default:
      return `${topic} takes an unplanned turn worth remembering`;
  }
}

const RITUAL_STEPS: ReadonlySet<StepName> = new Set([
  "settle",
  "start",
  "defend",
] as StepName[]);

function defaultKind(lens: Lens, step: StepName): EventKind {
  if (step === "clash" || step === "pressure") return "conflict";
  if (step === "repair" || step === "proof") return "recovery";
  if (RITUAL_STEPS.has(step)) return "ritual";
  return lens === "friendship" ? "vignette" : "milestone";
}

// ---------------------------------------------------------------------------
// Warm-arc realization: domain specials first, then generic frames
// ---------------------------------------------------------------------------

const OPENING_STEPS: ReadonlySet<StepName> = new Set([
  "begin",
  "seed",
  "decide",
  "start",
] as StepName[]);
const CLOSING_STEPS: ReadonlySet<StepName> = new Set([
  "payoff",
  "proof",
  "settle",
  "decide",
  "aftermath",
] as StepName[]);

export function realizeWarm(
  c: RealizeCtx,
  domain: string,
  step: StepName,
  outcome: OutcomeName
): RealizedBeat {
  const A = c.a.name;
  const B = c.b.name;

  if (c.lens === "romantic") {
    if (
      domain === "home" &&
      OPENING_STEPS.has(step) &&
      c.state.location === "the city where they met"
    ) {
      return {
        kind: "move",
        hint: `${A} and ${B} move in together — a small place with good light that instantly feels like theirs`,
        delta: { location: "their first shared place" },
      };
    }
    if (domain === "home" && step === "decide") {
      const dest = pickOf(c, [
        "a bigger place across town",
        "a quieter street with trees",
        "a top-floor flat they swore was out of reach",
      ]);
      return {
        kind: "move",
        hint: `they trade up to ${dest}, and the boxes take a month to disappear`,
        delta: { location: dest },
      };
    }
    if (
      domain === "relocation" &&
      (step === "decide" || OPENING_STEPS.has(step))
    ) {
      const [mover, rooted] = byRootedness(c);
      const dest = pickOf(c, [
        "a smaller city near the mountains",
        "a bigger city for the work years",
        "a slower town by the coast",
      ]);
      return {
        kind: "move",
        hint: `after months of maps on the table, ${mover.name} makes the case and ${rooted.name} says yes — they relocate to ${dest}`,
        delta: { location: dest },
      };
    }
    if (domain === "travel" && (CLOSING_STEPS.has(step) || step === "begin")) {
      const t = tagFrom(c, ACTIVE_TAGS, "coast");
      return {
        kind: "trip",
        hint: `the ${t} trip finally happens — badly planned, perfectly timed`,
      };
    }
    if (
      domain === "pets" &&
      c.state.pets.length === 0 &&
      (OPENING_STEPS.has(step) || step === "payoff")
    ) {
      const p = petLabel(c);
      return {
        kind: "pet",
        hint: `a ${p} joins the household, and the naming argument runs three full days`,
        delta: { addPet: p },
      };
    }
  }

  if (c.lens === "business") {
    if (
      domain === "product" &&
      c.state.venture === null &&
      OPENING_STEPS.has(step)
    ) {
      return {
        kind: "venture",
        hint: `${A} and ${B} sketch ${c.venture} on a whiteboard after hours and register the name before midnight`,
        delta: { venture: c.venture },
      };
    }
    if (domain === "first-client" && CLOSING_STEPS.has(step)) {
      const v = c.state.venture ?? c.venture;
      return {
        kind: "client",
        hint: `the first paying client says yes to ${v} after a demo that nearly fell over`,
      };
    }
    if (domain === "decision-rights" && step === "decide") {
      return {
        kind: "decision",
        hint: `they write down who decides what — product, price, people — before they ever need it`,
      };
    }
    if (domain === "pivot" && step === "decide") {
      return {
        kind: "decision",
        hint: `they change course on purpose: the side feature everyone kept asking about becomes the product`,
      };
    }
    if (domain === "exit" && CLOSING_STEPS.has(step)) {
      return { kind: "exit", hint: exitHint(c) };
    }
  }

  if (
    c.lens === "friendship" &&
    domain === "trip" &&
    step !== "clash" &&
    step !== "pressure"
  ) {
    const t = tagFrom(c, ACTIVE_TAGS, "road");
    return {
      kind: "trip",
      hint: `an overplanned ${t} weekend goes completely sideways and becomes the story of the year`,
    };
  }

  const topic = topicOf(c, domain);
  return {
    kind: defaultKind(c.lens, step),
    hint: genericFrame(c, step, outcome, topic),
  };
}

// ---------------------------------------------------------------------------
// Friction hints — authored per (lens, term). The honesty arc's concrete voice.
// ---------------------------------------------------------------------------

type FrictionVoice = {
  clash: (c: RealizeCtx) => string;
  repair: (c: RealizeCtx) => string;
};

const FRICTION_HINTS: Record<Lens, Record<TermName, FrictionVoice>> = {
  romantic: {
    regulation: {
      clash: (_c) =>
        `a stressful month lands harder on one of them than the other, and their recovery speeds don't match — one is ready to talk hours before the other can`,
      repair: () =>
        `they build a cool-down protocol: space first, words after, and a fixed time to come back to the table`,
    },
    politeness: {
      clash: () =>
        `tired-week sharpness creeps into how they talk to each other, and it stings more than either admits`,
      repair: () =>
        `they agree on a house rule — hard things get said carefully, or they wait until morning`,
    },
    reliability: {
      clash: () =>
        `small promises start slipping — the booked table, the errand, the call — and the slippage reads as a message even when it isn't`,
      repair: () =>
        `they shrink the promises down to ones that always get kept, and the trust compounds back`,
    },
    agency: {
      clash: (c) =>
        `${c.a.name} and ${c.b.name} both default to driving — the trip, the budget, the weekend — and neither is used to the passenger seat`,
      repair: () =>
        `they carve the map in two: each owns whole territories, and overruling costs a very nice dinner`,
    },
    distance: {
      clash: (c) => {
        const [w, p] = byDistance(c);
        return `after closeness or conflict, ${w.name} stays away longer than ${p.name} can comfortably wait`;
      },
      repair: (c) => {
        const [w, p] = byDistance(c);
        return `${p.name} learns to leave the porch light on without knocking, and ${w.name} learns to send one word from halfway back`;
      },
    },
    lifeShape: {
      clash: () =>
        `their weeks are shaped differently — hours, money posture, how rooted they want to be — and the mismatch bills them a little every month`,
      repair: () =>
        `they redesign the default week around the overlap instead of the gaps`,
    },
    commonGround: {
      clash: (c) =>
        `their interest maps barely overlap — ${c.a.name}'s ${soloTag(c.a, c.shared, "own")} weekends and ${c.b.name}'s ${soloTag(c.b, c.shared, "own")} ones keep running in parallel`,
      repair: (c) =>
        `they stop trying to merge hobbies and invent one thing that is only theirs — a ${c.shared[0] ?? "weekly"} table, built from scratch`,
    },
    structural: {
      clash: () =>
        `their circles barely touch — different teams, different tracks — so the relationship runs on scheduled effort instead of ambient contact`,
      repair: () =>
        `they build shared ground on purpose: one joint project and one mixed dinner a month, until the circles genuinely overlap`,
    },
    eligibility: {
      clash: () =>
        `the life-stage arithmetic sits slightly askew, and both can feel it humming behind every big plan`,
      repair: () =>
        `they put actual dates on the big plans, and the background hum quiets down`,
    },
  },
  business: {
    regulation: {
      clash: () =>
        `a bad quarter hits their nerves at different depths — one's alarm reads as the other's overreaction`,
      repair: () =>
        `they split the worry jobs: one owns the downside plan, one owns the next win, both own the numbers`,
    },
    politeness: {
      clash: () =>
        `feedback starts arriving unsanded, and drafts quietly stop being shown early`,
      repair: () =>
        `they adopt a review ritual: name what works first, mark what doesn't precisely, never in front of a client`,
    },
    reliability: {
      clash: () =>
        `a promised deliverable slips twice in one quarter, and the runway spreadsheet notices before anyone says it out loud`,
      repair: () =>
        `they install a weekly ship-or-say ritual: smaller promises, kept visibly, counted out loud`,
    },
    agency: {
      clash: () =>
        `both reach for the wheel on the same pricing call, and neither lets go until the room goes quiet`,
      repair: () =>
        `they write the decision map — who calls what, plus a tie-break rule both actually respect`,
    },
    distance: {
      clash: () =>
        `their follow-up rhythms mismatch — one answers in minutes, the other in days`,
      repair: () =>
        `they set response lanes — urgent, today, whenever — and label everything`,
    },
    lifeShape: {
      clash: (c) => {
        const [f, s] = byCapacity(c);
        return `the capacity gap shows: ${f.name} lives inside the venture while ${s.name} guards outside hours, and a quiet ledger of who-did-what starts keeping itself`;
      },
      repair: () =>
        `they re-price the split — ownership follows hours, reviewed quarterly, no vibes accounting`,
    },
    commonGround: {
      clash: () =>
        `they discover they picture different products when they say the same words`,
      repair: () =>
        `they write the one-pager together and tape it to the wall; the words finally mean one thing`,
    },
    structural: {
      clash: () =>
        `they come from different corners of the room — no shared shorthand — and early meetings run long on translation`,
      repair: () =>
        `two weeks of working side by side builds the shorthand the org chart never gave them`,
    },
    eligibility: {
      clash: () =>
        `their clocks disagree — risk appetite and exit timing sit one notch apart, and every big bet reopens the question`,
      repair: () =>
        `they write the horizon down: which year they revisit, and what number changes the answer`,
    },
  },
  friendship: {
    regulation: {
      clash: (c) =>
        `a stressful season makes ${c.a.name} terrible company for a while, and they both know it`,
      repair: (c) =>
        `${c.b.name} keeps showing up anyway — with ${tagFrom(c, FOOD_TAGS, "takeout")} and zero questions`,
    },
    politeness: {
      clash: () => `the teasing runs one notch too hot one night`,
      repair: () =>
        `a plain apology and a recalibrated line — the joke survives, slightly smaller`,
    },
    reliability: {
      clash: (c) => {
        const [p, m] = [c.a, c.b];
        return `${p.name} keeps being the planner and ${m.name} keeps being the maybe`;
      },
      repair: (c) =>
        `${c.b.name} books first for once, and ${c.a.name} learns to let plans wobble`,
    },
    agency: {
      clash: () => `every plan somehow defaults to one person's itinerary`,
      repair: () =>
        `they alternate who plans — odd months, even months — and both kinds of trips get better`,
    },
    distance: {
      clash: () =>
        `life gets loud and the thread goes quiet for months at a stretch`,
      repair: (c) => {
        const [, t] = byDistance(c);
        return `${t.name} sends one message and the months of silence turn out to weigh nothing — with these two, one texter is enough`;
      },
    },
    lifeShape: {
      clash: () =>
        `their free hours live at opposite ends of the week, and plans keep quietly expiring in the group chat`,
      repair: () =>
        `they claim one immovable slot and guard it like a meeting with a boss`,
    },
    commonGround: {
      clash: () =>
        `outside the one thing they share, their worlds barely rhyme, and default hangouts go stale`,
      repair: () =>
        `they let the friendship be specific: one shared thing done extremely well beats five generic ones`,
    },
    structural: {
      clash: () =>
        `their calendars only overlap by accident — no shared team, no shared track — and every hangout takes three reschedules`,
      repair: (c) =>
        `${c.a.name} starts pinning a monthly date nobody is allowed to move; proximity gets manufactured on purpose`,
    },
    eligibility: {
      clash: () => `schedules and seasons drift apart for a while`,
      repair: () =>
        `they find the one season that works for both and make it theirs`,
    },
  },
};

export function realizeFriction(
  c: RealizeCtx,
  term: TermName,
  phase: "clash" | "repair"
): RealizedBeat {
  const voice = FRICTION_HINTS[c.lens][term];
  return {
    kind: phase === "clash" ? "conflict" : "recovery",
    hint: phase === "clash" ? voice.clash(c) : voice.repair(c),
  };
}

// ---------------------------------------------------------------------------
// Flag-arc realization (bothHighAgency, pursueWithdraw)
// ---------------------------------------------------------------------------

export type FlagName = "bothHighAgency" | "pursueWithdraw";

export function realizeFlag(
  c: RealizeCtx,
  flag: FlagName,
  phase: "clash" | "repair"
): RealizedBeat {
  const kind: EventKind = phase === "clash" ? "conflict" : "recovery";
  if (flag === "bothHighAgency") {
    if (c.lens === "business") return realizeFriction(c, "agency", phase);
    return {
      kind,
      hint:
        phase === "clash"
          ? `two strong defaults collide — both plan the trips, both steer the budget, both edit the plan mid-drive`
          : `they split the map for real: each owns whole territories, and overruling costs the next restaurant pick`,
    };
  }
  const [w, p] = byDistance(c);
  return {
    kind,
    hint:
      phase === "clash"
        ? `after hard conversations ${w.name} disappears into the quiet longer than ${p.name} can easily wait, and the waiting grows its own weather`
        : `they agree on a signal that means "still here, still coming back" — and the quiet stops being a question`,
  };
}

// ---------------------------------------------------------------------------
// Special beats — kid, dissolution path, exit, quiet stretch
// ---------------------------------------------------------------------------

export type SpecialBeat =
  | "kid"
  | "unravel"
  | "dissolution"
  | "epilogue"
  | "exit"
  | "quiet";

function exitHint(c: RealizeCtx): string {
  const v = c.state.venture ?? c.venture;
  if (c.avgExit <= 0.5)
    return `right on the schedule they wrote in year one, ${c.a.name} and ${c.b.name} take the exit they always said yes to — ${v} finds a bigger home`;
  if (c.avgExit < 1.5)
    return `an acquirer circles ${v}; they set a number and a walk-away line, and shake on revisiting next year`;
  return `a flattering offer for ${v} gets a polite no — the plan was always the long game`;
}

export function realizeSpecial(
  c: RealizeCtx,
  special: SpecialBeat
): RealizedBeat {
  const A = c.a.name;
  const B = c.b.name;
  const noun = gapNoun(c.frictionDomain);
  switch (special) {
    case "kid": {
      const petBit =
        c.state.pets.length > 0
          ? `; the ${c.state.pets[0]} appoints itself night guard`
          : "";
      return {
        kind: "kid",
        hint: `their first kid arrives${petBit} — every schedule bends around the crib`,
        delta: { addKid: "their first kid" },
      };
    }
    case "unravel":
      return {
        kind: "conflict",
        hint:
          c.lens === "business"
            ? `the ${noun} gap eats another quarter, and both start sketching separate plan Bs`
            : `the ${noun} gap stops responding to effort; the conversations get shorter and kinder`,
      };
    case "dissolution":
      return {
        kind: "dissolution",
        hint:
          c.lens === "business"
            ? `the ${noun} gap outlasts every fix; ${A} and ${B} agree ${c.state.venture ?? c.venture} has run its course`
            : `after long, honest work on the ${noun} gap, ${A} and ${B} choose separate roads`,
        delta: { dissolve: true },
      };
    case "epilogue":
      return {
        kind: "epilogue",
        hint:
          c.lens === "business"
            ? `${A} and ${B} still send each other deal memos and introductions; the working respect never lapsed`
            : `${A} and ${B} still swap the occasional update — short, warm, and honest`,
      };
    case "exit":
      return { kind: "exit", hint: exitHint(c) };
    case "quiet":
      return {
        kind: "milestone",
        hint:
          c.lens === "business"
            ? `a year of boring green numbers for ${c.state.venture ?? c.venture} — the kind of boring they built on purpose`
            : `a year with no headline at ${c.state.location} — trips taken, work shipped, nothing that needs fixing`,
      };
    default:
      return {
        kind: "milestone",
        hint: `a small unplanned year that turns out fine`,
      };
  }
}

/** Business venture working name, derived from shared structure/tags. */
export function deriveVentureName(
  a: Person,
  b: Person,
  shared: string[]
): string {
  if (
    a.structural.track !== undefined &&
    a.structural.track === b.structural.track
  ) {
    return `their ${a.structural.track} venture`;
  }
  const tag = shared.find(
    (t) => !FOOD_TAGS.includes(t) && !MEDIA_TAGS.includes(t)
  );
  if (tag) return `their ${tag} venture`;
  return "their two-person venture";
}
