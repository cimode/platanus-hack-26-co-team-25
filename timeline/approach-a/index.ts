/**
 * approach-a/index.ts — BAKE-OFF APPROACH A: deterministic flat arc library + LLM events.
 *
 * The baseline. Structure (arcs, years, deltas, dissolution) is 100% seeded code:
 * a flat authored arc library (~19 arcs across the three lenses) with score
 * triggers; a seeded sampler picks arcs + years and threads world-state; the
 * shared narrator (live LLM or deterministic mock) writes ONLY the prose per beat.
 *
 * Guarantees (enforced here, checked by shared.ts validators):
 *   - the friction pillar always yields one arc citing score.friction.term
 *   - >= LENS_CONSTRAINTS.minEvents events, degraded pairs included
 *   - kid events pass kidEventAllowed (wantsKids both + offspring consent both +
 *     relationship alive that year — AUDIT S11); friendship never has them
 *   - friendship timelines STRUCTURALLY lack horizonYears/dissolution/epilogue
 *     (PILLARS §6.1) — episodic vignettes keyed to shared texture
 *   - rom/biz dissolution year drawn from the RESEARCH §5.1 hazard shape via
 *     sampleDissolutionYear; nothing after it except one optional epilogue
 *   - coherence: hints are resolved in year order against threaded state, so
 *     events only reference locations/kids/pets/ventures already established
 *   - canonicity 'seeded': same inputs → identical structure (callers persist
 *     the first generation); narrated text may vary only in live mode
 *
 * Zero runtime dependencies on this path; the narrator falls back to its
 * deterministic mock whenever live mode is off or the gateway key is missing.
 */

import type {
  Arc, ArcRole, Beat, EventKind, GenerateTimeline, Lens, PairScore, Person,
  StateDelta, TermName, ThreadedState, Timeline, TimelineEvent, TimelineOpts,
} from '../shared.ts';
import {
  LENS_CONSTRAINTS, applyDelta, hashSeed, initialState, isDegradedPair,
  kidEventAllowed, mulberry32, pick, randInt, sampleDissolutionYear,
  sharedTags, shuffle,
} from '../shared.ts';
import { narrate } from '../lib/narrator.ts';

// ---------------------------------------------------------------------------
// Proto structures — hints may be state-threaded functions, resolved in year
// order so they can only reference already-established state (CONTEXT §3).
// ---------------------------------------------------------------------------

type HintSource = string | ((s: ThreadedState) => string);

interface ProtoBeat {
  year: number;
  kind: EventKind;
  domain: string;
  hint: HintSource;
  delta?: StateDelta;
}

interface ProtoArc {
  id: string;
  role: ArcRole;
  sourceTerm: TermName | null;
  label: string;
  beats: ProtoBeat[];
}

interface Ctx {
  a: Person;
  b: Person;
  score: PairScore;
  opts: TimelineOpts;
  rng: () => number;
  shared: string[];
  /** Last simulated year regular (non-ending) beats may occupy. */
  aliveEnd: number;
  /** Seeded shared-tag picker (falls back to either person's tags). */
  tag: () => string;
  /** Seeded year draw clamped into [1, aliveEnd]. */
  yearIn: (lo: number, hi: number) => number;
}

const ENDING_ARC_ID = 'ending';

// ---------------------------------------------------------------------------
// The authored friction library — one entry per pillar term, per lens.
// The friction pillar MUST generate an arc in every timeline (honesty feature),
// so coverage here is total. Hints describe concrete behavior; construct names
// never appear in user-facing text (A7/A8).
// ---------------------------------------------------------------------------

interface FrictionSpec { domain: string; conflict: string; recovery: string }

const ROM_FRICTION: Record<TermName, FrictionSpec> = {
  lifeShape:    { domain: 'conflict-recovery', conflict: 'a big joint decision exposes how differently they map money, roots, and pace', recovery: 'they draft a shared five-year sketch that borrows from both maps' },
  commonGround: { domain: 'conflict-recovery', conflict: 'a season arrives where their calendars barely overlap and the silences get long', recovery: 'they institute a no-phones evening and rebuild the overlap on purpose' },
  structural:   { domain: 'conflict-recovery', conflict: 'once the world that introduced them moves on, the default time together vanishes', recovery: 'they learn to schedule each other like it matters, because it does' },
  regulation:   { domain: 'conflict-recovery', conflict: 'a stressful stretch outside the relationship spills in, and they run hot at different speeds', recovery: 'they learn each other\'s cool-down times and stop taking them personally' },
  politeness:   { domain: 'conflict-recovery', conflict: 'a blunt month — small remarks land harder than either intends', recovery: 'they adopt a house rule: say the kind version first' },
  reliability:  { domain: 'conflict-recovery', conflict: 'plans made and quietly unmade start to sting', recovery: 'fewer promises, kept louder — the new deal works' },
  distance:     { domain: 'conflict-recovery', conflict: 'after a rough patch, one goes quiet longer than the other can easily bear', recovery: 'they agree that space taken gets announced, and returns get celebrated' },
  eligibility:  { domain: 'conflict-recovery', conflict: 'the timing of the big steps asks a question they have been dodging', recovery: 'they put real dates next to the big steps, in pencil, together' },
  agency:       { domain: 'conflict-recovery', conflict: 'both reach for the wheel at the same fork, twice in one month', recovery: 'they split the map — who navigates what — and honor it' },
};

const BIZ_FRICTION: Record<TermName, FrictionSpec> = {
  lifeShape:    { domain: 'work-rhythm', conflict: 'full-tilt weeks versus measured weeks — the mismatch shows up in the sprint board', recovery: 'they re-cut the roadmap around the hours that actually exist' },
  reliability:  { domain: 'runway', conflict: 'a missed handoff lands in front of a client and cannot be waved off', recovery: 'they build the checklist ritual that makes handoffs boring again' },
  structural:   { domain: 'work-rhythm', conflict: 'operating from different rooms makes every small sync expensive', recovery: 'they anchor the week with a standing working session' },
  commonGround: { domain: 'product', conflict: 'they discover they are picturing two different products', recovery: 'they write the one-line spec both can recite' },
  politeness:   { domain: 'decision-rights', conflict: 'crunch-week feedback comes out sharper than intended', recovery: 'they adopt a rule: hard notes in writing, wins out loud' },
  regulation:   { domain: 'work-rhythm', conflict: 'deadline pressure hits them at different speeds and the office feels it', recovery: 'they name the pressure valves early and actually use them' },
  eligibility:  { domain: 'exit', conflict: 'their horizons for the venture drift apart mid-year', recovery: 'they align on checkpoints where either can revisit the plan' },
  agency:       { domain: 'decision-rights', conflict: 'two hands on the wheel stall one decision too many', recovery: 'they write down who calls what, and the writing holds' },
  distance:     { domain: 'work-rhythm', conflict: 'a quiet stretch after a hard sprint goes unexplained', recovery: 'they agree recovery time is planned, not apologized for' },
};

const FRI_FRICTION: Record<TermName, FrictionSpec> = {
  lifeShape:    { domain: 'ritual', conflict: 'free hours stop lining up and the standing plan slips for a season', recovery: 'the plan shrinks to something unmissable and survives' },
  commonGround: { domain: 'media', conflict: 'their tastes drift and the hangouts lose their default script', recovery: 'they trade recommendations across the gap and find a new shared lane' },
  structural:   { domain: 'distance-texture', conflict: 'the room that made them disappears, and with it the accidental hangouts', recovery: 'they move the friendship to on-purpose: a recurring slot, defended' },
  distance:     { domain: 'distance-texture', conflict: 'the silence between texts stretches past comfortable', recovery: 'one message, no apology needed, and the thread picks up mid-joke' },
  politeness:   { domain: 'food', conflict: 'a joke at dinner lands wrong and sits there', recovery: 'the apology comes with dessert and an actual explanation' },
  reliability:  { domain: 'project', conflict: 'one cancellation too many puts the shared project on ice', recovery: 'smaller promises, honored — the project thaws' },
  regulation:   { domain: 'trip', conflict: 'a stressful travel day shows their very different storm modes', recovery: 'the next trip is planned around each other\'s weather, and it works' },
  agency:       { domain: 'project', conflict: 'both want to run the shared project their own way', recovery: 'they split it into two halves with one owner each' },
  eligibility:  { domain: 'ritual', conflict: 'their seasons of life stop rhyming for a while', recovery: 'they find the one slot that fits both calendars and guard it' },
};

/** Rom dissolution hint, keyed to the friction term so the ending cites the same seam. */
const ROM_DISSOLUTION: Partial<Record<TermName, string>> = {
  lifeShape:    'the maps finally point to different lives',
  commonGround: 'the shared ground thins until both can name it',
  regulation:   'how they weather storms stops being workable together',
  distance:     'the quiet stretches grow longer than the together ones',
  reliability:  'the gap between plans and follow-through wears the trust thin',
};
const ROM_DISSOLUTION_DEFAULT = 'the fit that started it stops fitting, and they say so out loud';

// ---------------------------------------------------------------------------
// Origin / founding hints keyed to the pair's top driver (legibility: the
// opening beat narrates WHY the engine ranked them).
// ---------------------------------------------------------------------------

function romOriginHint(term: TermName | undefined, tagOf: () => string): string {
  switch (term) {
    case 'structural':   return 'they keep landing in the same rooms until it stops being coincidence';
    case 'commonGround': return `it starts with ${tagOf()} and conversations that refuse to end`;
    case 'lifeShape':    return 'their weeks already fit each other; the first month feels suspiciously easy';
    case 'regulation':   return 'what stands out first is how calm the hard days feel around each other';
    default:             return 'an easy beginning neither of them has to force';
  }
}

function bizFoundingHint(term: TermName | undefined, tagOf: () => string): string {
  switch (term) {
    case 'structural':   return 'sitting one desk apart turns into sketching a company on the same whiteboard';
    case 'lifeShape':    return 'matched hours and matched appetite — they schedule the founding meeting like a sprint';
    case 'reliability':  return 'two people who ship what they say — the venture starts on a handshake and a doc';
    case 'commonGround': return `a shared obsession with ${tagOf()} turns into a product idea neither can drop`;
    default:             return 'the idea shows up in a hallway conversation and refuses to leave';
  }
}

// ---------------------------------------------------------------------------
// Per-lens arc builders — each returns the full ProtoArc list in a FIXED order
// so every rng draw is deterministic for a given (seed, pair, lens).
// ---------------------------------------------------------------------------

function frictionArc(ctx: Ctx, lens: Lens): ProtoArc {
  const term = ctx.score.friction?.term ?? 'lifeShape';
  const table = lens === 'romantic' ? ROM_FRICTION : lens === 'business' ? BIZ_FRICTION : FRI_FRICTION;
  const spec = table[term];
  const hi = lens === 'friendship' ? 5 : lens === 'business' ? 4 : 6;
  const cYear = ctx.yearIn(2, hi);
  const rYear = Math.min(cYear + 1, ctx.aliveEnd);
  return {
    id: 'friction',
    role: 'friction',
    sourceTerm: term,
    label: 'The hard part',
    beats: [
      { year: cYear, kind: 'conflict', domain: spec.domain, hint: spec.conflict },
      { year: Math.max(rYear, cYear), kind: 'recovery', domain: spec.domain, hint: spec.recovery },
    ],
  };
}

function romanticArcs(ctx: Ctx, dYear: number | null, wantEpilogue: boolean): ProtoArc[] {
  const { score, rng, shared } = ctx;
  const arcs: ProtoArc[] = [];
  const driverTerms = score.drivers.map((d) => d.term);
  const top = score.drivers[0]?.term;

  // 1. Origin — always; narrates the top driver (why the engine ranked them).
  arcs.push({
    id: 'origin', role: 'driver', sourceTerm: top ?? 'commonGround', label: 'How it starts',
    beats: [{ year: 1, kind: 'milestone', domain: 'ritual', hint: romOriginHint(top, ctx.tag) }],
  });

  // 2. Shared-orbit ritual — driver arc when Common Ground drives, texture otherwise.
  if (shared.length > 0 || driverTerms.includes('commonGround')) {
    const t1 = ctx.tag();
    arcs.push({
      id: 'shared-orbit', role: driverTerms.includes('commonGround') ? 'driver' : 'texture',
      sourceTerm: 'commonGround', label: 'The shared orbit',
      beats: [
        { year: ctx.yearIn(1, 2), kind: 'ritual', domain: 'ritual', hint: `a weekly ${t1} ritual takes over one evening and never gives it back` },
        { year: ctx.yearIn(3, 5), kind: 'trip', domain: 'travel', hint: `a trip planned entirely around ${ctx.tag()}` },
      ],
    });
  }

  // 3. Home — driver arc when Life Shape drives: move-in, then a rootedness-keyed move.
  if (driverTerms.includes('lifeShape')) {
    const rootAvg = (ctx.a.declared.lifeShape.rootedness + ctx.b.declared.lifeShape.rootedness) / 2;
    const dest = rootAvg >= 0.55 ? 'a bigger place in the same neighborhood' : 'a new city they picked on a napkin';
    arcs.push({
      id: 'home', role: 'driver', sourceTerm: 'lifeShape', label: 'A shape that fits',
      beats: [
        { year: ctx.yearIn(2, 2), kind: 'move', domain: 'home', hint: 'they pool their books and rent a small place of their own', delta: { location: 'a small place of their own' } },
        { year: ctx.yearIn(4, 6), kind: 'move', domain: 'relocation', hint: (s) => `they trade ${s.location} for ${dest}`, delta: { location: dest } },
      ],
    });
  }

  // 4. Friction — always (the honesty feature).
  arcs.push(frictionArc(ctx, 'romantic'));

  // 5. Flag arcs — surfaced score flags become visible story seams.
  if ((score.flags.bothHighAgency ?? 0) > 0.3) {
    const y = ctx.yearIn(2, 5);
    arcs.push({
      id: 'two-pilots', role: 'flag', sourceTerm: 'agency', label: 'Two pilots, one cockpit',
      beats: [
        { year: y, kind: 'conflict', domain: 'work-balance', hint: 'two people used to steering pick the same moment to steer' },
        { year: Math.min(y + 1, ctx.aliveEnd), kind: 'recovery', domain: 'work-balance', hint: 'they split the map: who navigates what, written down and honored' },
      ],
    });
  }
  if (score.flags.pursueWithdraw !== undefined) {
    const y = ctx.yearIn(2, 5);
    arcs.push({
      id: 'space-signal', role: 'flag', sourceTerm: 'distance', label: 'The space signal',
      beats: [
        { year: y, kind: 'conflict', domain: 'conflict-recovery', hint: 'after hard days one goes quiet while the other counts the hours' },
        { year: Math.min(y + 1, ctx.aliveEnd), kind: 'recovery', domain: 'conflict-recovery', hint: 'they invent a signal: space taken is space announced' },
      ],
    });
  }

  // 6. Kid — hard-gated (AUDIT S11): desire both + offspring consent both + alive that year.
  if (kidEventAllowed(ctx.a, ctx.b, 'romantic', ctx.opts, true) && ctx.aliveEnd >= 3) {
    const kidYear = ctx.yearIn(3, 6);
    const beats: ProtoBeat[] = [
      { year: kidYear, kind: 'kid', domain: 'kids', hint: 'their first kid arrives and every priority gets renamed', delta: { addKid: 'their first kid' } },
    ];
    if (kidYear + 2 <= ctx.aliveEnd) {
      const t = ctx.tag();
      beats.push({
        year: kidYear + 2, kind: 'milestone', domain: 'kids',
        hint: (s) => s.kids.length > 0 ? `the kid's first ${t} outing becomes a new family tradition` : `a new ${t} family tradition takes hold`,
      });
    }
    arcs.push({ id: 'kid', role: 'texture', sourceTerm: 'eligibility', label: 'The very small boss', beats });
  }

  // 7. Fill pool — texture arcs, shuffled and taken until the event target.
  const petLabel = [...ctx.a.declared.tags, ...ctx.b.declared.tags].map((t) => t.toLowerCase()).includes('dogs')
    ? 'a rescue dog' : 'a senior cat with opinions';
  const pool: ProtoArc[] = [
    {
      id: 'pet', role: 'texture', sourceTerm: null, label: 'Plus one, four legs',
      beats: [{ year: ctx.yearIn(2, 4), kind: 'pet', domain: 'pets', hint: `${petLabel} picks them at the shelter`, delta: { addPet: petLabel } }],
    },
    {
      id: 'craft', role: 'texture', sourceTerm: null, label: 'Built by hand',
      beats: [{ year: ctx.yearIn(3, 7), kind: 'milestone', domain: 'craft', hint: 'a winter of weekends goes into building one absurdly over-engineered thing together' }],
    },
    {
      id: 'getaway', role: 'texture', sourceTerm: null, label: 'The great escape',
      beats: [{ year: ctx.yearIn(3, 6), kind: 'trip', domain: 'travel', hint: (s) => s.pets.length > 0 ? `the first long trip that requires negotiating who watches ${s.pets[0]}` : 'the badly planned trip that becomes the best story they own' }],
    },
  ];
  const target = randInt(rng, 7, 10);
  let count = arcs.reduce((n, arc) => n + arc.beats.length, 0);
  for (const fill of shuffle(rng, pool)) {
    if (count >= target) break;
    arcs.push(fill);
    count += fill.beats.length;
  }

  // 8. Ending — dissolution beat (+ optional epilogue), keyed to the friction seam.
  if (dYear !== null) {
    const term = score.friction?.term;
    const beats: ProtoBeat[] = [
      { year: dYear, kind: 'dissolution', domain: 'conflict-recovery', hint: (term && ROM_DISSOLUTION[term]) ?? ROM_DISSOLUTION_DEFAULT, delta: { dissolve: true } },
    ];
    if (wantEpilogue) {
      beats.push({ year: dYear + 1, kind: 'epilogue', domain: 'ritual', hint: 'each still sends the other the occasional perfect recommendation' });
    }
    arcs.push({ id: ENDING_ARC_ID, role: 'texture', sourceTerm: term ?? null, label: 'The turn', beats });
  }
  return arcs;
}

function businessArcs(ctx: Ctx, dYear: number | null, wantEpilogue: boolean): ProtoArc[] {
  const { score, rng, shared } = ctx;
  const arcs: ProtoArc[] = [];
  const top = score.drivers[0]?.term;
  const sameTrack = ctx.a.structural.track !== undefined && ctx.a.structural.track === ctx.b.structural.track
    ? ctx.a.structural.track : null;
  const ventureName = sameTrack
    ? `their ${sameTrack} venture`
    : shared.length > 0 ? `their ${pick(rng, shared)}-inspired venture` : 'their two-person venture';

  // 1. Founding — always; venture named, top driver narrated.
  arcs.push({
    id: 'founding', role: 'driver', sourceTerm: top ?? 'structural', label: 'Day one',
    beats: [{ year: 1, kind: 'venture', domain: 'runway', hint: bizFoundingHint(top, ctx.tag), delta: { venture: ventureName } }],
  });

  // 2. First client — always (venture domain per the brief).
  arcs.push({
    id: 'first-client', role: 'texture', sourceTerm: null, label: 'First yes',
    beats: [{ year: ctx.yearIn(1, 2), kind: 'client', domain: 'first-client', hint: (s) => `${s.venture ?? 'the venture'} lands its first paying client after a demo held together with tape` }],
  });

  // 3. Friction — always.
  arcs.push(frictionArc(ctx, 'business'));

  // 4. Decision rights — the bothHighAgency flag becomes governance on the timeline.
  if ((score.flags.bothHighAgency ?? 0) > 0.3) {
    arcs.push({
      id: 'decision-rights', role: 'flag', sourceTerm: 'agency', label: 'Two captains, one map',
      beats: [
        { year: ctx.yearIn(1, 2), kind: 'decision', domain: 'decision-rights', hint: 'ownership zones get mapped in the first weeks: product, money, people' },
        { year: ctx.yearIn(3, 4), kind: 'decision', domain: 'decision-rights', hint: 'a deadlocked call goes to the written rule and stays settled' },
      ],
    });
  }

  // 5. Kid — same hard gate as romance (cross-lens per shared.ts kidEventAllowed).
  if (kidEventAllowed(ctx.a, ctx.b, 'business', ctx.opts, true) && ctx.aliveEnd >= 3) {
    arcs.push({
      id: 'kid', role: 'texture', sourceTerm: 'eligibility', label: 'A very small stakeholder',
      beats: [{ year: ctx.yearIn(3, 5), kind: 'kid', domain: 'work-rhythm', hint: 'a first kid arrives and the work rhythm reorganizes around a very small stakeholder', delta: { addKid: 'a first kid' } }],
    });
  }

  // 6. Fill pool.
  const pool: ProtoArc[] = [
    {
      id: 'runway', role: 'texture', sourceTerm: null, label: 'Runway math',
      beats: [{ year: ctx.yearIn(2, 3), kind: 'milestone', domain: 'runway', hint: (s) => `${s.venture ?? 'the venture'} closes a small round and the runway stops being a countdown` }],
    },
    {
      id: 'hiring', role: 'texture', sourceTerm: null, label: 'First hire',
      beats: [{ year: ctx.yearIn(2, 4), kind: 'job', domain: 'hiring', hint: (s) => `${s.venture ?? 'the venture'} makes its first hire; teaching the playbook turns out to be the hard part` }],
    },
    {
      id: 'pivot', role: 'texture', sourceTerm: null, label: 'The turn of the wheel',
      beats: [{ year: ctx.yearIn(2, 4), kind: 'venture', domain: 'pivot', hint: (s) => `${s.venture ?? 'the venture'} pivots after honest numbers; the new direction feels obvious in hindsight` }],
    },
    {
      id: 'rhythm', role: 'texture', sourceTerm: 'lifeShape', label: 'The machine room',
      beats: [{ year: ctx.yearIn(1, 3), kind: 'ritual', domain: 'work-rhythm', hint: 'the Monday planning ritual that keeps the machine honest' }],
    },
  ];
  const target = randInt(rng, 6, 9);
  let count = arcs.reduce((n, arc) => n + arc.beats.length, 0);
  for (const fill of shuffle(rng, pool)) {
    if (count >= target) break;
    arcs.push(fill);
    count += fill.beats.length;
  }

  // 7. Ending — dissolution (wind-down) OR an exit beat shaped by exitHorizon.
  if (dYear !== null) {
    const beats: ProtoBeat[] = [
      { year: dYear, kind: 'dissolution', domain: 'exit', hint: (s) => `${s.venture ?? 'the venture'} has run its course`, delta: { dissolve: true } },
    ];
    if (wantEpilogue) {
      beats.push({ year: dYear + 1, kind: 'epilogue', domain: 'exit', hint: 'they stay each other\'s first phone call for hard problems' });
    }
    arcs.push({ id: ENDING_ARC_ID, role: 'texture', sourceTerm: score.friction?.term ?? null, label: 'The wind-down', beats });
  } else {
    const ga = ctx.a.gates.business;
    const gb = ctx.b.gates.business;
    const exitAvg = ga && gb ? (ga.exitHorizon + gb.exitHorizon) / 2 : 1;
    const longHold = exitAvg >= 1.5;
    arcs.push({
      id: 'exit-plan', role: 'texture', sourceTerm: 'eligibility', label: longHold ? 'The long game' : 'The handshake',
      beats: [longHold
        ? { year: ctx.aliveEnd, kind: 'milestone', domain: 'exit', hint: (s) => `${s.venture ?? 'the venture'} re-signs for the long game — no exit, on purpose` }
        : { year: ctx.aliveEnd, kind: 'exit', domain: 'exit', hint: (s) => `${s.venture ?? 'the venture'} finds its buyer, and the handshake matches the plan from year one` },
      ],
    });
  }
  return arcs;
}

function friendshipArcs(ctx: Ctx): ProtoArc[] {
  const { score, rng } = ctx;
  const arcs: ProtoArc[] = [];
  const top = score.drivers[0]?.term;
  const t1 = ctx.tag();

  // 1. The standing ritual — always; keyed to shared texture (the top driver).
  arcs.push({
    id: 'standing-thing', role: 'driver', sourceTerm: top ?? 'commonGround', label: 'The standing thing',
    beats: [
      { year: 1, kind: 'ritual', domain: 'ritual', hint: `the ${t1} ritual: same spot, same order, no invite needed` },
      { year: ctx.yearIn(3, 5), kind: 'vignette', domain: 'ritual', hint: 'the ritual survives two job changes and a move across town' },
    ],
  });

  // 2. Friction — always (friendships grind too; that is the honesty feature).
  arcs.push(frictionArc(ctx, 'friendship'));

  // 3. The long-gap texture — PILLARS §4 inversion 1: one texter is enough.
  arcs.push({
    id: 'long-gap', role: 'texture', sourceTerm: 'distance', label: 'The long-gap superpower',
    beats: [{ year: ctx.yearIn(4, 6), kind: 'vignette', domain: 'distance-texture', hint: 'months of silence, then one text, and the conversation resumes mid-sentence' }],
  });

  // 4. Fill pool — vignettes keyed to shared texture.
  const pool: ProtoArc[] = [
    {
      id: 'road-trip', role: 'texture', sourceTerm: null, label: 'The pilgrimage',
      beats: [{ year: ctx.yearIn(2, 5), kind: 'trip', domain: 'trip', hint: `the ${ctx.tag()}-powered road trip that produces the group chat's permanent header photo` }],
    },
    {
      id: 'side-project', role: 'texture', sourceTerm: null, label: 'The joke that shipped',
      beats: [{ year: ctx.yearIn(2, 5), kind: 'milestone', domain: 'project', hint: `a tiny ${ctx.tag()} side project they ship as a joke and quietly maintain for years` }],
    },
    {
      id: 'tasting-menu', role: 'texture', sourceTerm: null, label: 'The annual menu',
      beats: [{ year: ctx.yearIn(1, 4), kind: 'vignette', domain: 'food', hint: `the ${ctx.tag()}-adjacent dinner experiment becomes an annual tasting menu of questionable ambition` }],
    },
    {
      id: 'two-person-club', role: 'texture', sourceTerm: null, label: 'The two-person club',
      beats: [{ year: ctx.yearIn(1, 5), kind: 'vignette', domain: 'media', hint: `a two-person ${ctx.tag()} club with strong opinions and no other members` }],
    },
  ];
  const target = randInt(rng, 6, 8);
  let count = arcs.reduce((n, arc) => n + arc.beats.length, 0);
  for (const fill of shuffle(rng, pool)) {
    if (count >= target) break;
    arcs.push(fill);
    count += fill.beats.length;
  }
  return arcs;
}

// ---------------------------------------------------------------------------
// Resolution — flatten beats in year order, thread state, resolve hint fns.
// Events can therefore only reference state already established (CONTEXT §3).
// ---------------------------------------------------------------------------

function resolveBeats(protoArcs: ProtoArc[]): { arcs: Arc[]; beats: Beat[]; arcIds: string[] } {
  const flat = protoArcs.flatMap((arc, ai) => arc.beats.map((pb, bi) => ({ arc, pb, ai, bi })));
  flat.sort((x, y) => x.pb.year - y.pb.year || x.ai - y.ai || x.bi - y.bi);

  const grouped = new Map<string, Beat[]>(protoArcs.map((p) => [p.id, []]));
  const beats: Beat[] = [];
  const arcIds: string[] = [];
  let state = initialState();
  for (const f of flat) {
    const hint = typeof f.pb.hint === 'function' ? f.pb.hint(state) : f.pb.hint;
    const beat: Beat = { year: f.pb.year, kind: f.pb.kind, domain: f.pb.domain, hint, ...(f.pb.delta ? { delta: f.pb.delta } : {}) };
    beats.push(beat);
    arcIds.push(f.arc.id);
    grouped.get(f.arc.id)?.push(beat);
    state = applyDelta(state, f.pb.delta, f.pb.year);
  }
  const arcs: Arc[] = protoArcs.map((p) => ({
    id: p.id, role: p.role, sourceTerm: p.sourceTerm, label: p.label, beats: grouped.get(p.id) ?? [],
  }));
  return { arcs, beats, arcIds };
}

/** Backstop: degraded pairs must still reach minEvents (they always do by
 *  construction, but the guarantee is enforced, not assumed). */
function backfill(protoArcs: ProtoArc[], ctx: Ctx, lens: Lens): void {
  const min = LENS_CONSTRAINTS[lens].minEvents;
  let count = protoArcs.reduce((n, arc) => n + arc.beats.length, 0);
  if (count >= min) return;
  const beats: ProtoBeat[] = [];
  while (count < min) {
    beats.push({
      year: ctx.yearIn(1, ctx.aliveEnd),
      kind: lens === 'friendship' ? 'vignette' : 'milestone',
      domain: lens === 'friendship' ? 'ritual' : LENS_CONSTRAINTS[lens].domains[0],
      hint: 'an unremarkable day that both remember, years later, as the good kind',
    });
    count++;
  }
  protoArcs.push({ id: 'texture-more', role: 'texture', sourceTerm: null, label: 'The quiet good parts', beats });
}

// ---------------------------------------------------------------------------
// generateTimeline — the common interface (timeline/shared.ts)
// ---------------------------------------------------------------------------

export const generateTimeline: GenerateTimeline = async (a, b, score, lens, opts): Promise<Timeline> => {
  const rng = mulberry32(hashSeed(opts.seed, 'approach-a', a.id, b.id, lens));

  // 1. Horizon + dissolution (rom/biz only — friendship has neither, PILLARS §6.1).
  let horizon = 0;
  let dYear: number | null = null;
  let wantEpilogue = false;
  if (lens !== 'friendship') {
    const span = LENS_CONSTRAINTS[lens].yearSpan;
    horizon = randInt(rng, span[0], span[1]);
    dYear = sampleDissolutionYear(rng, score.sim, horizon); // RESEARCH §5.1 hazard shape
    wantEpilogue = dYear !== null && rng() < 0.5;
  }
  const aliveEnd = lens === 'friendship'
    ? randInt(rng, 5, 8)                                    // vignette year-keys, NOT a duration claim
    : dYear !== null ? Math.max(1, dYear - 1) : horizon;

  // 2. Context for the builders.
  const shared = sharedTags(a, b);
  const allTags = [...new Set([...a.declared.tags, ...b.declared.tags].map((t) => t.toLowerCase()))];
  const ctx: Ctx = {
    a, b, score, opts, rng, shared, aliveEnd,
    tag: () => (shared.length > 0 ? pick(rng, shared) : allTags.length > 0 ? pick(rng, allTags) : 'weekend'),
    yearIn: (lo, hi) => {
      const h = Math.max(1, Math.min(hi, aliveEnd));
      const l = Math.max(1, Math.min(lo, h));
      return randInt(rng, l, h);
    },
  };

  // 3. Sample the arc structure from the flat library (seeded, score-triggered).
  const protoArcs = lens === 'romantic' ? romanticArcs(ctx, dYear, wantEpilogue)
    : lens === 'business' ? businessArcs(ctx, dYear, wantEpilogue)
    : friendshipArcs(ctx);
  backfill(protoArcs, ctx, lens);

  // 4. Resolve beats in year order against threaded state.
  const { arcs, beats, arcIds } = resolveBeats(protoArcs);

  // 5. Narrate — live LLM or deterministic mock; never throws, never crashes on a missing key.
  const { texts, narration, model } = await narrate(beats, [a, b], lens, opts);
  const events: TimelineEvent[] = beats.map((bt, i) => ({
    year: bt.year, arcId: arcIds[i], kind: bt.kind, domain: bt.domain, text: texts[i],
  }));

  // 6. Assemble — friendship variant structurally lacks duration/dissolution fields.
  const base = {
    personA: { id: a.id, name: a.name },
    personB: { id: b.id, name: b.name },
    arcs,
    events,
    meta: {
      approach: 'a',
      seed: opts.seed,
      narration,
      canonicity: 'seeded' as const,
      degraded: isDegradedPair(a, b),
      ...(model !== undefined ? { model } : {}),
    },
  };
  if (lens === 'friendship') return { lens: 'friendship', ...base };

  const epilogueText = events.find((e) => e.kind === 'epilogue')?.text ?? null;
  const dissolution = dYear !== null ? { year: dYear, arcId: ENDING_ARC_ID } : null;
  return lens === 'romantic'
    ? { lens: 'romantic', ...base, horizonYears: horizon, dissolution, epilogue: epilogueText }
    : { lens: 'business', ...base, horizonYears: horizon, dissolution, epilogue: epilogueText };
};
