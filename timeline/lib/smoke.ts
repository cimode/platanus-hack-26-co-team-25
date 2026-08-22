/**
 * smoke.ts — foundation self-check for the score→timeline layer.
 * Run: node --experimental-strip-types timeline/lib/smoke.ts
 * Pure offline (mock narrator); exits non-zero on any failure.
 */

import { scorePair, type Person } from '../../src/lib/domain/matching/engine.ts';
import {
  HAZARD_PEAK_END_YEAR, HAZARD_PEAK_START_YEAR, LENS_CONSTRAINTS,
  hashSeed, hazardShape, initialState, applyDelta, kidEventAllowed, mulberry32,
  sampleDissolutionYear, scanBanned, scanSurvivalClaims, sharedTags,
  validateTimeline, checkSchema,
  type Beat, type EventKind, type Timeline, type TimelineOpts,
} from '../shared.ts';
import { fullGenerate, mockNarrateBeat, narrate, nominate, readEnvFile } from './narrator.ts';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { console.log(`  ok  ${name}`); return; }
  failures++;
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

// Minimal pair (mirrors demo.ts shapes) --------------------------------------
const mkPerson = (id: string, name: string, wantsKids: boolean, tags: string[]): Person => ({
  id, name,
  latents: {
    regulation: { mean: 0.7, se: 0.35 }, politeness: { mean: 0.6, se: 0.35 },
    reliability: { mean: 0.7, se: 0.35 }, agency: { mean: 0.5, se: 0.35 },
  },
  declared: {
    distanceBand: 1,
    lifeShape: { moneyPosture: 0.5, rootedness: 0.6, familyGravity: 0.5, capacityHoursBand: 2 },
    tags, chronotype: 1,
  },
  structural: { team: 't', track: 'x', cohort: 0 },
  gates: {
    romantic: { interestedIn: ['F', 'M', 'NB'], gender: 'M', single: true, ageBand: 1, wantsKids },
    business: { riskPosture: 1, exitHorizon: 1, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
});
const A = mkPerson('a1', 'Ana', true, ['climbing', 'sushi', 'dogs']);
const B = mkPerson('b1', 'Bruno', true, ['climbing', 'scifi', 'dogs']);
const OPTS: TimelineOpts = { seed: 42, offspringConsentA: true, offspringConsentB: true, live: false };

console.log('== PRNG & hashing ==');
{
  const r1 = mulberry32(123); const r2 = mulberry32(123);
  const s1 = [r1(), r1(), r1()]; const s2 = [r2(), r2(), r2()];
  check('mulberry32 deterministic', JSON.stringify(s1) === JSON.stringify(s2));
  check('mulberry32 in [0,1)', s1.every((x) => x >= 0 && x < 1));
  check('hashSeed order-sensitive', hashSeed('ab', 'c') !== hashSeed('a', 'bc'));
}

console.log('== Hazard shape (RESEARCH §5.1: rises, peaks yr 4–8, declines) ==');
{
  check('rises before peak', hazardShape(1) < hazardShape(2) && hazardShape(2) < hazardShape(HAZARD_PEAK_START_YEAR));
  check('flat at peak', hazardShape(HAZARD_PEAK_START_YEAR) === hazardShape(HAZARD_PEAK_END_YEAR));
  check('declines after peak', hazardShape(HAZARD_PEAK_END_YEAR + 1) < hazardShape(HAZARD_PEAK_END_YEAR)
    && hazardShape(12) < hazardShape(9));
  const rng = mulberry32(7);
  const draws = Array.from({ length: 50 }, () => sampleDissolutionYear(rng, 0.4, 12));
  check('dissolution draws valid', draws.every((d) => d === null || (d >= 2 && d <= 12)));
  const hiSim = Array.from({ length: 200 }, (_, i) => sampleDissolutionYear(mulberry32(i), 0.68, 12));
  const loSim = Array.from({ length: 200 }, (_, i) => sampleDissolutionYear(mulberry32(i), 0.05, 12));
  const nulls = (xs: Array<number | null>) => xs.filter((x) => x === null).length;
  check('higher sim → survives more', nulls(hiSim) > nulls(loSim), `${nulls(hiSim)} vs ${nulls(loSim)}`);
}

console.log('== Safety scanners ==');
{
  check('catches gottman word', scanBanned('a moment of contempt').length > 0);
  check('catches infidelity stem', scanBanned('He was cheating on her').length > 0);
  check('catches money shame', scanBanned('they went bankrupt').length > 0);
  check('clean text passes', scanBanned('They open a bakery and adopt a dog.').length === 0);
  check('catches percent claim', scanSurvivalClaims('a 71% chance').length > 0);
  check('catches N-of-M claim', scanSurvivalClaims('in 71 of 100 runs').length > 0);
  check('clean text has no survival claims', scanSurvivalClaims('Year 4 brings a rough stretch.').length === 0);
}

console.log('== Mock templates are safe & deterministic for every kind ==');
{
  const kinds: EventKind[] = ['milestone', 'move', 'job', 'pet', 'kid', 'ritual', 'trip', 'conflict',
    'recovery', 'venture', 'client', 'decision', 'exit', 'dissolution', 'epilogue', 'vignette'];
  let dirty = 0; let nondet = 0;
  for (const kind of kinds) {
    for (let v = 0; v < 6; v++) { // several seeds → hit every template variant
      const beat: Beat = { year: 3, kind, domain: 'ritual', hint: 'they turn Sunday climbing into a standing date' };
      const t1 = mockNarrateBeat(beat, A, B, 100 + v, 0);
      const t2 = mockNarrateBeat(beat, A, B, 100 + v, 0);
      if (t1 !== t2) nondet++;
      if (scanBanned(t1).length > 0 || scanSurvivalClaims(t1).length > 0) { dirty++; console.error(`    dirty [${kind}]: ${t1}`); }
    }
  }
  check('all template renders clean', dirty === 0, `${dirty} dirty renders`);
  check('mock narration deterministic', nondet === 0);
}

console.log('== narrate() mock path ==');
{
  const beats: Beat[] = [
    { year: 1, kind: 'milestone', domain: 'home', hint: 'they get a place with a climbing wall nearby' },
    { year: 2, kind: 'pet', domain: 'pets', hint: 'a rescue dog joins', delta: { addPet: 'a rescue dog' } },
    { year: 4, kind: 'conflict', domain: 'conflict-recovery', hint: 'capacity hours collide with travel plans' },
    { year: 5, kind: 'recovery', domain: 'conflict-recovery', hint: 'they rebuild the weekly rhythm' },
    { year: 6, kind: 'trip', domain: 'travel', hint: 'a long-promised coast trip happens' },
  ];
  const r1 = await narrate(beats, [A, B], 'romantic', OPTS);
  const r2 = await narrate(beats, [A, B], 'romantic', OPTS);
  check('mock mode reported', r1.narration === 'mock');
  check('one text per beat', r1.texts.length === beats.length);
  check('deterministic across calls', JSON.stringify(r1.texts) === JSON.stringify(r2.texts));
  check('all texts safe', r1.texts.every((t) => scanBanned(t).length === 0));
}

console.log('== nominate() & fullGenerate() mock paths ==');
{
  const score = scorePair(A, B, 'romantic');
  check('pair eligible for smoke', score.eligible);
  const grammar = {
    patterns: ['slow-build', 'spark-and-test', 'steady-state'],
    domains: ['home', 'travel', 'ritual'],
    outcomes: ['strengthens', 'strains', 'transforms'],
  };
  const n1 = await nominate(A, B, score, 'romantic', grammar, OPTS);
  const n2 = await nominate(A, B, score, 'romantic', grammar, OPTS);
  check('nomination deterministic', JSON.stringify(n1) === JSON.stringify(n2));
  check('nomination within grammar', grammar.patterns.includes(n1.nomination.pattern)
    && grammar.domains.includes(n1.nomination.domain) && grammar.outcomes.includes(n1.nomination.outcome));
  check('trigger claim well-formed', /^(driver|friction|flag):[a-zA-Z]+$/.test(n1.nomination.triggerClaim));

  for (const lens of ['romantic', 'business', 'friendship'] as const) {
    const sc = scorePair(A, B, lens);
    const fg = await fullGenerate(A, B, sc, lens, OPTS, { arcScience: '(stub)', narrativeSafety: '(stub)' });
    const cand = fg.candidate;
    check(`fullGenerate[${lens}] returns candidate`, cand !== null);
    if (!cand) continue;
    check(`fullGenerate[${lens}] >=5 events`, cand.events.length >= LENS_CONSTRAINTS[lens].minEvents, `${cand.events.length}`);
    check(`fullGenerate[${lens}] has friction arc`, cand.arcs.some((a) => a.role === 'friction'));
    if (lens === 'friendship') {
      check('fullGenerate[friendship] no duration fields', cand.dissolution === undefined && cand.horizonYears === undefined && cand.epilogue === undefined);
    }
    check(`fullGenerate[${lens}] events safe`, cand.events.every((e) => scanBanned(e.text).length === 0));
  }
}

console.log('== Gates, state threading, degraded pairs ==');
{
  check('kid gate passes when all conditions hold', kidEventAllowed(A, B, 'romantic', OPTS, true));
  check('kid gate fails without consent', !kidEventAllowed(A, B, 'romantic', { ...OPTS, offspringConsentB: false }, true));
  const noKids = mkPerson('c1', 'Cai', false, ['sushi']);
  check('kid gate fails on wantsKids mismatch', !kidEventAllowed(A, noKids, 'romantic', OPTS, true));
  check('kid gate fails after dissolution', !kidEventAllowed(A, B, 'romantic', OPTS, false));
  check('kid gate always fails in friendship', !kidEventAllowed(A, B, 'friendship', OPTS, true));

  let s = initialState();
  s = applyDelta(s, { location: 'Bogotá', addPet: 'a rescue dog' }, 2);
  s = applyDelta(s, { addKid: 'their first kid', dissolve: true }, 6);
  check('state threads location/pets/kids', s.location === 'Bogotá' && s.pets.length === 1 && s.kids.length === 1);
  check('dissolution year recorded once', s.dissolvedAtYear === 6);
  check('sharedTags works', JSON.stringify(sharedTags(A, B)) === JSON.stringify(['climbing', 'dogs']));
}

console.log('== Validators ==');
{
  const score = scorePair(A, B, 'romantic');
  const good: Timeline = {
    lens: 'romantic',
    personA: { id: A.id, name: A.name }, personB: { id: B.id, name: B.name },
    horizonYears: 10,
    dissolution: null,
    epilogue: null,
    arcs: [
      { id: 'f1', role: 'friction', sourceTerm: score.friction?.term ?? 'lifeShape', label: 'Where it grinds', beats: [
        { year: 4, kind: 'conflict', domain: 'conflict-recovery', hint: 'schedules collide' },
        { year: 5, kind: 'recovery', domain: 'conflict-recovery', hint: 'a new rhythm' },
      ] },
      { id: 'd1', role: 'driver', sourceTerm: 'commonGround', label: 'What carries them', beats: [
        { year: 1, kind: 'milestone', domain: 'home', hint: 'first place' },
        { year: 2, kind: 'pet', domain: 'pets', hint: 'dog', delta: { addPet: 'a rescue dog' } },
        { year: 7, kind: 'trip', domain: 'travel', hint: 'the coast trip' },
      ] },
    ],
    events: [
      { year: 1, arcId: 'd1', kind: 'milestone', domain: 'home', text: 'They find a small place near the climbing gym.' },
      { year: 2, arcId: 'd1', kind: 'pet', domain: 'pets', text: 'A rescue dog joins the household.' },
      { year: 4, arcId: 'f1', kind: 'conflict', domain: 'conflict-recovery', text: 'Two calendars collide for a whole season.' },
      { year: 5, arcId: 'f1', kind: 'recovery', domain: 'conflict-recovery', text: 'They rebuild the week around what matters.' },
      { year: 7, arcId: 'd1', kind: 'trip', domain: 'travel', text: 'The long-promised coast trip finally happens, dog included.' },
    ],
    meta: { approach: 'smoke', seed: 42, narration: 'mock', canonicity: 'seeded', degraded: false },
  };
  const issues = validateTimeline(good, A, B, score, OPTS);
  check('valid timeline has no errors', issues.filter((i) => i.severity === 'error').length === 0,
    issues.map((i) => i.code).join(','));

  // Friendship structural guarantee: smuggled duration fields must be flagged.
  const badFri = {
    lens: 'friendship',
    personA: { id: A.id, name: A.name }, personB: { id: B.id, name: B.name },
    dissolution: { year: 5, arcId: 'x' }, // ILLEGAL for friendship
    arcs: good.arcs,
    events: good.events.map((e) => ({ ...e, kind: 'vignette' as const, domain: 'ritual' })),
    meta: good.meta,
  } as unknown as Timeline;
  const friIssues = checkSchema(badFri);
  check('friendship duration smuggling caught', friIssues.some((i) => i.code === 'schema.friendship-structural'));

  // Missing friction arc must be an error.
  const noFriction: Timeline = { ...good, arcs: good.arcs.filter((a) => a.role !== 'friction'), events: good.events.filter((e) => e.arcId !== 'f1') };
  const nf = validateTimeline(noFriction, A, B, score, OPTS);
  check('missing friction arc caught', nf.some((i) => i.code === 'friction.missing'));

  // Kid event without consent must be an error.
  const withKid: Timeline = { ...good, events: [...good.events, { year: 8, arcId: 'd1', kind: 'kid', domain: 'kids', text: 'A very small new boss arrives.' }] };
  const kidIssues = validateTimeline(withKid, A, B, score, { ...OPTS, offspringConsentA: false });
  check('ungated kid event caught', kidIssues.some((i) => i.code === 'kids.gate'));

  // Event after dissolution (non-epilogue) must be an error.
  const afterDiss: Timeline = {
    ...good,
    dissolution: { year: 5, arcId: 'f1' },
    events: [
      ...good.events.filter((e) => e.year < 5),
      { year: 5, arcId: 'f1', kind: 'dissolution', domain: 'conflict-recovery', text: 'They part ways deliberately, on their own terms.' },
      { year: 7, arcId: 'd1', kind: 'trip', domain: 'travel', text: 'A trip that should not exist.' },
    ],
  };
  const ad = validateTimeline(afterDiss, A, B, score, OPTS);
  check('post-dissolution event caught', ad.some((i) => i.code === 'coherence.after-dissolution'));

  // Banned word in event text must be an error.
  const banned: Timeline = { ...good, events: good.events.map((e, i) => i === 0 ? { ...e, text: 'A moment of contempt.' } : e) };
  const bi = validateTimeline(banned, A, B, score, OPTS);
  check('banned word in event caught', bi.some((i) => i.code === 'safety.banned'));
}

console.log('== env parsing ==');
{
  const env = readEnvFile(); // .env may not exist — must not throw
  check('readEnvFile never throws', typeof env === 'object');
}

console.log('');
if (failures > 0) {
  console.error(`SMOKE FAILED: ${failures} check(s)`);
  process.exit(1);
}
console.log('SMOKE OK — foundation ready for approaches a/b/c');
