/**
 * timeline.test.ts — VERIFIER suite for the AUDIT F2 bake-off (approaches A, B, C).
 *
 * Covers, through the shared interface (mock narration only — opts.live is never
 * set, so no network and no key needed):
 *   V1  interface conformance (all three export GenerateTimeline)
 *   V2  determinism of structure for A/B: same seed twice → identical timeline;
 *       different seeds → structure actually varies
 *   V3  friendship lacks duration/dissolution fields — TYPE level (compile-time
 *       asserts below) AND runtime ('horizonYears'/'dissolution'/'epilogue' not
 *       present as keys; no dissolution/epilogue events) for all three approaches
 *   V4  friction arc always present, with events, citing the scored term
 *   V5  full validator sweep: schema, coherence, kid gates, safety scans — zero
 *       errors across approaches × lenses × pairs × seeds
 *   V6  kid gates: consent off → no kid events; wantsKids one-sided (business
 *       lens) → no kid events; dissolved at year Y → no kid event at/after Y and
 *       nothing after dissolution except at most one epilogue (seed sweep)
 *   V7  banned-words scan over every template/skill/prompt string in timeline/:
 *       Gottman-four sweep over the whole tree, strict scanBanned over authored
 *       content files, documented allowlists for the two scanner-adjacent files
 *   V8  approach C validator fallback: garbage / banned / smuggled candidates are
 *       rejected (one retry) and the hard fallback fires — approach A first,
 *       internal sampler when A is unavailable; result is always valid
 *   V9  degraded pair (imputed latents) still ≥ minEvents in every lens
 *   V10 meta contract: narration 'mock' offline, canonicity per approach
 *   V11 approach B bonus-arc admission: verifyTriggerClaim admits only claims
 *       that are true of the actual PairScore
 *   V12 batch narration: validateBatch count/index/safety/length rules; the
 *       live batch path retries exactly once on invalid counts then yields
 *       null (mock fallback); the invented-state pet guard replaces pet-word
 *       sentences with their deterministic mock when no pet is established
 *
 * Run: node --experimental-strip-types --experimental-test-module-mocks timeline/timeline.test.ts
 *
 * This file is excluded from its own banned-word scans (it constructs banned
 * fixtures dynamically and names allowlisted category words); exclusions are
 * documented inline per scan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type {
  FriendshipTimeline, GenerateTimeline, Lens, PairScore, Person,
  RomanticTimeline, BusinessTimeline, Timeline, TimelineOpts,
} from './shared.ts';
import {
  LENS_CONSTRAINTS, checkFrictionArc, checkKidGates, checkCoherence,
  isDegradedPair, scanBanned, scanSurvivalClaims, validateTimeline,
} from './shared.ts';
import type { Gender } from '../matching/engine.ts';
import { scorePair } from '../matching/engine.ts';
import { generateTimeline as genA } from './approach-a/index.ts';
import { generateTimeline as genB } from './approach-b/index.ts';
import { generateTimeline as genC } from './approach-c/index.ts';
import { verifyTriggerClaim } from './approach-b/verify.ts';
import type { Arc, TimelineEvent } from './shared.ts';
import type { FullGenCandidate } from './lib/narrator.ts';

// ---------------------------------------------------------------------------
// V3 (type level) — compile-time guarantees, verified whenever tsc runs.
// Erasable: nothing here survives type stripping.
// ---------------------------------------------------------------------------

type ForbiddenFriendshipKey = Extract<keyof FriendshipTimeline, 'horizonYears' | 'dissolution' | 'epilogue'>;
type MustBeNever<T extends never> = 'ok';
// Fails to compile if FriendshipTimeline ever grows a duration/dissolution field:
const friendshipTypeGuarantee: MustBeNever<ForbiddenFriendshipKey> = 'ok';
// Fails to compile if the rom/biz variants ever LOSE their duration fields:
type _RomanticKeeps = [RomanticTimeline['horizonYears'], RomanticTimeline['dissolution'], RomanticTimeline['epilogue']];
type _BusinessKeeps = [BusinessTimeline['horizonYears'], BusinessTimeline['dissolution'], BusinessTimeline['epilogue']];
// Fails to compile if any approach drifts off the shared interface:
const _ifaceA: GenerateTimeline = genA;
const _ifaceB: GenerateTimeline = genB;
const _ifaceC: GenerateTimeline = genC;

// ---------------------------------------------------------------------------
// Person factory (same shape as matching/engine.test.ts)
// ---------------------------------------------------------------------------

interface MkOpts {
  reg?: number; pol?: number; rel?: number; agc?: number; se?: number;
  noLatents?: boolean;
  distanceBand?: number;
  money?: number; rooted?: number; family?: number; cap?: number;
  tags?: string[]; chrono?: number;
  team?: string; track?: string; cohort?: number;
  gender?: Gender; wantsKids?: boolean;
  risk?: number; exit?: number;
}

function mk(id: string, o: MkOpts = {}): Person {
  const se = o.se ?? 0.45;
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    latents: o.noLatents ? {} : {
      regulation: { mean: o.reg ?? 0.6, se },
      politeness: { mean: o.pol ?? 0.6, se },
      reliability: { mean: o.rel ?? 0.55, se },
      agency: { mean: o.agc ?? 0.4, se },
    },
    declared: {
      distanceBand: o.distanceBand ?? 1,
      lifeShape: {
        moneyPosture: o.money ?? 0.5,
        rootedness: o.rooted ?? 0.5,
        familyGravity: o.family ?? 0.5,
        capacityHoursBand: o.cap ?? 2,
      },
      tags: o.tags ?? ['climbing', 'coffee', 'synths'],
      chronotype: o.chrono ?? 1,
    },
    structural: { team: o.team, track: o.track ?? 'sim', cohort: o.cohort ?? 1, acquaintances: [] },
    gates: {
      romantic: {
        interestedIn: ['M', 'F', 'NB'],
        gender: o.gender ?? 'F',
        single: true,
        ageBand: 1,
        wantsKids: o.wantsKids ?? true,
      },
      business: { riskPosture: o.risk ?? 1, exitHorizon: o.exit ?? 1, redlinesOk: true },
    },
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  };
}

const ana = mk('ana', { team: 'atlas', gender: 'F', tags: ['climbing', 'coffee', 'synths'] });
const bruno = mk('bruno', { team: 'atlas', gender: 'M', tags: ['climbing', 'coffee', 'film'], reg: 0.65, rel: 0.62 });
const dana = mk('dana', { noLatents: true, gender: 'NB', tags: ['coffee', 'running'], team: undefined, cohort: 2 });
const nikoNoKids = mk('niko', { gender: 'M', wantsKids: false, tags: ['coffee', 'chess'] });
// Low-similarity but eligible pair — dissolutions frequent in the seed sweep.
const vera = mk('vera', { gender: 'F', reg: 0.3, pol: 0.35, rel: 0.3, distanceBand: 2, money: 0.15, rooted: 0.2, family: 0.2, cap: 0, tags: ['opera'], chrono: 0, team: undefined, track: 'a', cohort: 0 });
const walt = mk('walt', { gender: 'M', reg: 0.35, pol: 0.4, rel: 0.35, distanceBand: 2, money: 0.9, rooted: 0.85, family: 0.9, cap: 3, tags: ['golf'], chrono: 3, team: undefined, track: 'b', cohort: 3 });

const LENSES: Lens[] = ['romantic', 'business', 'friendship'];
const APPROACHES: Array<[string, GenerateTimeline]> = [['a', genA], ['b', genB], ['c', genC]];

function opts(seed: number, cA = true, cB = true): TimelineOpts {
  return { seed, offspringConsentA: cA, offspringConsentB: cB };
}

function scoreOf(a: Person, b: Person, lens: Lens): PairScore {
  const s = scorePair(a, b, lens);
  assert.ok(s.eligible, `fixture pair ${a.id}/${b.id} must be eligible under ${lens} (got: ${s.reason})`);
  return s;
}

function errorsOf(t: Timeline, a: Person, b: Person, s: PairScore, o: TimelineOpts): string[] {
  return validateTimeline(t, a, b, s, o)
    .filter((i) => i.severity === 'error')
    .map((i) => `${i.code}: ${i.message}`);
}

// ---------------------------------------------------------------------------
// Matrix — generated once, shared by several subtests
// ---------------------------------------------------------------------------

interface MatrixRow {
  approach: string; lens: Lens; pair: string; seed: number;
  a: Person; b: Person; score: PairScore; o: TimelineOpts; t: Timeline;
}

let matrixMemo: Promise<MatrixRow[]> | null = null;
function matrix(): Promise<MatrixRow[]> {
  if (matrixMemo) return matrixMemo;
  matrixMemo = (async () => {
    const rows: MatrixRow[] = [];
    const pairs: Array<[string, Person, Person]> = [['ana-bruno', ana, bruno], ['ana-dana (degraded)', ana, dana]];
    for (const [name, gen] of APPROACHES) {
      for (const lens of LENSES) {
        for (const [pair, a, b] of pairs) {
          const score = scoreOf(a, b, lens);
          for (const seed of [1, 7, 42]) {
            const o = opts(seed);
            rows.push({ approach: name, lens, pair, seed, a, b, score, o, t: await gen(a, b, score, lens, o) });
          }
        }
      }
    }
    return rows;
  })();
  return matrixMemo;
}

// ---------------------------------------------------------------------------
// V1 — interface conformance
// ---------------------------------------------------------------------------

test('V1: all three approaches export generateTimeline through the shared interface', () => {
  for (const [name, gen] of APPROACHES) assert.equal(typeof gen, 'function', `approach ${name}`);
  assert.equal(friendshipTypeGuarantee, 'ok');
});

// ---------------------------------------------------------------------------
// V2 — determinism (A and B): same seed twice → identical structure AND text
// (mock narration is deterministic); different seeds → structures vary
// ---------------------------------------------------------------------------

test('V2: approaches A and B are seeded-deterministic (same seed → identical timeline)', async () => {
  for (const [name, gen] of [['a', genA], ['b', genB]] as Array<[string, GenerateTimeline]>) {
    for (const lens of LENSES) {
      for (const [pairName, a, b] of [['ana-bruno', ana, bruno], ['ana-dana', ana, dana]] as Array<[string, Person, Person]>) {
        const score = scoreOf(a, b, lens);
        const t1 = await gen(a, b, score, lens, opts(1234));
        const t2 = await gen(a, b, score, lens, opts(1234));
        assert.deepEqual(t2, t1, `approach ${name} / ${lens} / ${pairName}: same seed must reproduce the identical timeline`);
      }
    }
  }
});

test('V2b: different seeds actually change the structure (A and B, romantic)', async () => {
  for (const [name, gen] of [['a', genA], ['b', genB]] as Array<[string, GenerateTimeline]>) {
    const score = scoreOf(ana, bruno, 'romantic');
    const shapes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = await gen(ana, bruno, score, 'romantic', opts(seed));
      shapes.add(JSON.stringify(t.arcs.map((arc) => arc.beats.map((bt) => [bt.year, bt.kind, bt.domain]))));
    }
    assert.ok(shapes.size >= 2, `approach ${name}: 6 seeds produced only ${shapes.size} distinct structures`);
  }
});

// ---------------------------------------------------------------------------
// V3 — friendship structurally lacks duration/dissolution (runtime)
// ---------------------------------------------------------------------------

test('V3: friendship timelines carry no horizonYears/dissolution/epilogue keys and no ending events (all approaches)', async () => {
  const rows = (await matrix()).filter((r) => r.lens === 'friendship');
  assert.ok(rows.length >= 18);
  for (const r of rows) {
    const anyT = r.t as unknown as Record<string, unknown>;
    for (const key of ['horizonYears', 'dissolution', 'epilogue']) {
      assert.ok(!(key in anyT), `approach ${r.approach} seed ${r.seed} (${r.pair}): friendship timeline must not carry "${key}"`);
    }
    assert.equal(r.t.lens, 'friendship');
    for (const e of r.t.events) {
      assert.ok(e.kind !== 'dissolution' && e.kind !== 'epilogue' && e.kind !== 'kid',
        `approach ${r.approach} seed ${r.seed}: friendship event kind "${e.kind}" is forbidden`);
    }
    assert.equal(checkCoherence(r.t).filter((i) => i.severity === 'error').length, 0);
  }
});

// ---------------------------------------------------------------------------
// V4 — the friction pillar generates at least one arc with events, everywhere
// ---------------------------------------------------------------------------

test('V4: friction arc present with events in every timeline (approaches × lenses × pairs × seeds)', async () => {
  const rows = await matrix();
  for (const r of rows) {
    const frictionArcs = r.t.arcs.filter((arc) => arc.role === 'friction');
    assert.ok(frictionArcs.length >= 1, `approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: no friction arc`);
    const issues = checkFrictionArc(r.t, r.score).filter((i) => i.severity === 'error');
    assert.deepEqual(issues, [], `approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: ${JSON.stringify(issues)}`);
    // The arc must cite the actually-scored friction term (drives the honesty feature).
    assert.ok(r.score.friction === null || frictionArcs.some((arc) => arc.sourceTerm === r.score.friction?.term),
      `approach ${r.approach} / ${r.lens} seed ${r.seed}: friction arc does not cite the scored term ${r.score.friction?.term}`);
  }
});

// ---------------------------------------------------------------------------
// V5 — full validator sweep (schema, coherence, kid gates, safety, S10)
// ---------------------------------------------------------------------------

test('V5: full validation — zero errors across the whole matrix', async () => {
  const rows = await matrix();
  const failures: string[] = [];
  for (const r of rows) {
    const errs = errorsOf(r.t, r.a, r.b, r.score, r.o);
    if (errs.length > 0) failures.push(`approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: ${errs.join(' | ')}`);
  }
  assert.deepEqual(failures, []);
  console.log(`  V5 validated ${rows.length} timelines with zero errors`);
});

// ---------------------------------------------------------------------------
// V6 — kid gates
// ---------------------------------------------------------------------------

test('V6a: offspring consent off on either side → no kid events (all approaches, rom + biz)', async () => {
  for (const [name, gen] of APPROACHES) {
    for (const lens of ['romantic', 'business'] as Lens[]) {
      const score = scoreOf(ana, bruno, lens);
      for (const [cA, cB] of [[false, true], [true, false], [false, false]] as Array<[boolean, boolean]>) {
        for (const seed of [1, 7, 42, 99]) {
          const t = await gen(ana, bruno, score, lens, opts(seed, cA, cB));
          assert.ok(!t.events.some((e) => e.kind === 'kid'),
            `approach ${name} / ${lens} seed ${seed} consent(${cA},${cB}): kid event leaked past the consent gate`);
        }
      }
    }
  }
});

test('V6b: wantsKids false on one side → no kid events in the business lens (all approaches)', async () => {
  const score = scoreOf(ana, nikoNoKids, 'business');
  for (const [name, gen] of APPROACHES) {
    for (const seed of [1, 7, 42]) {
      const t = await gen(ana, nikoNoKids, score, 'business', opts(seed));
      assert.ok(!t.events.some((e) => e.kind === 'kid'),
        `approach ${name} seed ${seed}: kid event despite one-sided wantsKids (AUDIT S11 desire-only gate)`);
    }
  }
});

test('V6c: dissolution sweep — dissolved at year Y → no kid at/after Y, nothing after Y but one epilogue (A and B)', async () => {
  const score = scoreOf(vera, walt, 'romantic');
  for (const [name, gen] of [['a', genA], ['b', genB]] as Array<[string, GenerateTimeline]>) {
    let dissolved = 0;
    let kidBearing = 0;
    let earlyDissolved = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const o = opts(seed);
      const t = await gen(vera, walt, score, 'romantic', o) as RomanticTimeline;
      if (t.dissolution === null) continue;
      dissolved++;
      const dYear = t.dissolution.year;
      if (dYear <= 5) earlyDissolved++;
      const kids = t.events.filter((e) => e.kind === 'kid');
      if (kids.length > 0) kidBearing++;
      for (const k of kids) {
        assert.ok(k.year < dYear, `approach ${name} seed ${seed}: kid event at year ${k.year} but dissolved at year ${dYear}`);
      }
      const after = t.events.filter((e) => e.year > dYear);
      assert.ok(after.every((e) => e.kind === 'epilogue'), `approach ${name} seed ${seed}: non-epilogue events after dissolution`);
      assert.ok(after.length <= 1, `approach ${name} seed ${seed}: more than one epilogue`);
      assert.equal(checkKidGates(t, vera, walt, o).filter((i) => i.severity === 'error').length, 0);
    }
    assert.ok(dissolved >= 5, `approach ${name}: only ${dissolved}/150 seeds dissolved — sweep not meaningful`);
    assert.ok(earlyDissolved >= 1, `approach ${name}: no early (year <= 5) dissolution found in 150 seeds`);
    console.log(`  V6c approach ${name}: ${dissolved}/150 dissolved (${earlyDissolved} at year <= 5), ${kidBearing} with pre-dissolution kid events — all gated correctly`);
  }
});

// ---------------------------------------------------------------------------
// V7 — banned-words scan over every template/skill/prompt string in timeline/
// ---------------------------------------------------------------------------

// The four conflict-construct names, assembled dynamically so this test file
// never contains them as literals.
const GOTTMAN_RE = new RegExp(
  '\\b(' + ['criti' + 'cism', 'con' + 'tempt', 'defen' + 'siveness', 'stone' + 'wall\\w*'].join('|') + ')\\b',
  'gi',
);

const TIMELINE_DIR = new URL('.', import.meta.url).pathname;

/** Every .ts/.md file in the timeline tree (recursive, node_modules excluded). */
function timelineFiles(): string[] {
  return readdirSync(TIMELINE_DIR, { recursive: true })
    .map(String)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.md')) && !f.includes('node_modules'))
    .sort();
}

test('V7a: the four conflict-construct words appear NOWHERE in timeline/ outside the scanner and its fixtures', () => {
  // Documented exclusions:
  //   shared.ts        — defines the scanner (regexes + curated word list)
  //   lib/smoke.ts     — deliberate fixtures proving the scanner catches hits
  //   timeline.test.ts — this file (constructs fixtures dynamically)
  const excluded = new Set(['shared.ts', 'lib/smoke.ts', 'timeline.test.ts']);
  const files = timelineFiles().filter((f) => !excluded.has(f));
  assert.ok(files.length >= 12, `walk found only ${files.length} files`);
  const offenders: string[] = [];
  for (const f of files) {
    const txt = readFileSync(join(TIMELINE_DIR, f), 'utf8');
    GOTTMAN_RE.lastIndex = 0;
    const m = GOTTMAN_RE.exec(txt);
    if (m) offenders.push(`${f}: "${m[0]}"`);
  }
  assert.deepEqual(offenders, []);
  // Scanner sanity: it does catch a constructed hit.
  assert.ok(scanBanned('a moment of ' + 'con' + 'tempt').length > 0, 'scanBanned failed to catch a known construct word');
});

test('V7b: strict scanBanned — authored templates, grammar, skills, harness are fully clean', () => {
  const strictClean = [
    'approach-a/index.ts',      // authored arc library (hints, labels)
    'approach-b/index.ts',
    'approach-b/grammar.ts',    // pattern/domain/outcome vocabulary + labels
    'approach-b/realize.ts',    // realized hint templates
    'approach-b/verify.ts',
    'approach-c/demo.ts',
    'approach-c/skills/arc-science.md',      // prompt skill document
    'approach-c/skills/narrative-safety.md', // prompt skill document
    'compare.ts',
  ];
  const offenders: string[] = [];
  for (const f of strictClean) {
    const txt = readFileSync(join(TIMELINE_DIR, f), 'utf8');
    for (const hit of scanBanned(txt)) offenders.push(`${f}: ${hit.category}:"${hit.match}"`);
  }
  assert.deepEqual(offenders, []);
});

test('V7c: scanner-adjacent files carry ONLY their documented category-name tokens', () => {
  // approach-c/index.ts names scanner categories as map keys in its retry-note
  // sanitizer (never sent to the LLM as banned words; values are descriptions).
  const cAllowed = new Set(['ultimatum', 'infidelity', 'illness', 'death', 'religion', 'politics']);
  const cHits = scanBanned(readFileSync(join(TIMELINE_DIR, 'approach-c/index.ts'), 'utf8'));
  for (const h of cHits) {
    assert.ok(cAllowed.has(h.match.toLowerCase()), `approach-c/index.ts: unexpected banned token "${h.match}" (${h.category})`);
  }
  // lib/narrator.ts SAFETY_RULES names three banned categories in its negative
  // instruction ("NEVER include: ultimatums... religious... political...").
  // Allowlisted here (category naming, not content) and REPORTED as a finding:
  // the shared prompt would fail its own scanner.
  const nAllowed = new Set(['ultimatums', 'religious', 'political']);
  const nHits = scanBanned(readFileSync(join(TIMELINE_DIR, 'lib/narrator.ts'), 'utf8'));
  for (const h of nHits) {
    assert.ok(nAllowed.has(h.match.toLowerCase()), `lib/narrator.ts: unexpected banned token "${h.match}" (${h.category})`);
  }
  console.log(`  V7c allowlisted tokens — approach-c/index.ts: ${cHits.length}, lib/narrator.ts: ${nHits.length} (see findings)`);
});

test('V7d: skill documents contain no survival/probability claims (AUDIT S10 wording)', () => {
  for (const f of ['approach-c/skills/arc-science.md', 'approach-c/skills/narrative-safety.md']) {
    const hits = scanSurvivalClaims(readFileSync(join(TIMELINE_DIR, f), 'utf8'));
    assert.deepEqual(hits, [], `${f}: ${JSON.stringify(hits)}`);
  }
});

test('V7e: no numeric survival fractions or banned words in any generated user-facing text', async () => {
  const rows = await matrix();
  for (const r of rows) {
    const texts = r.t.events.map((e) => e.text);
    for (const arc of r.t.arcs) texts.push(arc.label);
    if (r.t.lens !== 'friendship' && r.t.epilogue) texts.push(r.t.epilogue);
    for (const txt of texts) {
      assert.deepEqual(scanBanned(txt), [], `approach ${r.approach} / ${r.lens} seed ${r.seed}: banned content in "${txt}"`);
      assert.deepEqual(scanSurvivalClaims(txt), [], `approach ${r.approach} / ${r.lens} seed ${r.seed}: survival claim in "${txt}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// V8 — approach C: validator rejects garbage, retries once, hard fallback fires
// ---------------------------------------------------------------------------

/** A structurally VALID romantic candidate (used as the base for poisoning). */
function validRomCandidate(a: Person, b: Person): FullGenCandidate {
  const arcs: Arc[] = [
    {
      id: 'g-friction', role: 'friction', sourceTerm: 'lifeShape', label: 'Where it grinds',
      beats: [
        { year: 2, kind: 'conflict', domain: 'conflict-recovery', hint: 'the gap surfaces' },
        { year: 3, kind: 'recovery', domain: 'conflict-recovery', hint: 'they adapt the week' },
      ],
    },
    {
      id: 'g-driver', role: 'driver', sourceTerm: 'commonGround', label: 'What carries them',
      beats: [
        { year: 1, kind: 'milestone', domain: 'ritual', hint: 'an easy start' },
        { year: 4, kind: 'ritual', domain: 'ritual', hint: 'a yearly tradition' },
        { year: 5, kind: 'trip', domain: 'travel', hint: 'a small trip' },
      ],
    },
  ];
  const events: TimelineEvent[] = [
    { year: 1, arcId: 'g-driver', kind: 'milestone', domain: 'ritual', text: `${a.name} and ${b.name} start with an easy first month.` },
    { year: 2, arcId: 'g-friction', kind: 'conflict', domain: 'conflict-recovery', text: 'A planning gap surfaces and they name it plainly.' },
    { year: 3, arcId: 'g-friction', kind: 'recovery', domain: 'conflict-recovery', text: 'They redesign the week around the gap.' },
    { year: 4, arcId: 'g-driver', kind: 'ritual', domain: 'ritual', text: 'A tradition takes over one evening a week.' },
    { year: 5, arcId: 'g-driver', kind: 'trip', domain: 'travel', text: 'A short trip produces a long story.' },
  ];
  return { arcs, events, horizonYears: 8, dissolution: null, epilogue: null };
}

async function withGarbageC(
  t: import('node:test').TestContext,
  bust: string,
  fakeFullGenerate: (...args: unknown[]) => Promise<unknown>,
  alsoBreakApproachA = false,
): Promise<{ gen: GenerateTimeline; calls: () => number }> {
  const real = await import('./lib/narrator.ts');
  let calls = 0;
  t.mock.module('./lib/narrator.ts', {
    namedExports: {
      ...real,
      fullGenerate: async (...args: unknown[]) => { calls++; return fakeFullGenerate(...args); },
    },
  });
  if (alsoBreakApproachA) {
    t.mock.module('./approach-a/index.ts', {
      namedExports: { generateTimeline: async () => { throw new Error('approach A unavailable'); } },
    });
  }
  const mod = await import(`./approach-c/index.ts?bust=${bust}`) as typeof import('./approach-c/index.ts');
  return { gen: mod.generateTimeline, calls: () => calls };
}

test('V8a: empty-garbage candidate → one retry, then fallback to approach A; result is valid', async (t) => {
  const { gen, calls } = await withGarbageC(t, 'empty', async () => ({
    candidate: { arcs: [], events: [] }, narration: 'mock' as const,
  }));
  const score = scoreOf(ana, bruno, 'romantic');
  const o = opts(7);
  const tl = await gen(ana, bruno, score, 'romantic', o);
  assert.equal(calls(), 2, 'validator must retry exactly once before falling back');
  assert.equal(tl.meta.approach, 'c-fallback-a');
  assert.deepEqual(errorsOf(tl, ana, bruno, score, o), []);
  assert.ok(tl.arcs.some((arc) => arc.role === 'friction'));
  assert.ok(tl.events.length >= LENS_CONSTRAINTS.romantic.minEvents);
});

test('V8b: banned-content candidate (valid structure, poisoned text) → rejected, fallback fires', async (t) => {
  const poison = 'A moment of ' + 'con' + 'tempt' + ' colors the week.'; // constructed, never literal here
  const { gen, calls } = await withGarbageC(t, 'banned', async () => {
    const cand = validRomCandidate(ana, bruno);
    cand.events[3] = { ...cand.events[3], text: poison };
    return { candidate: cand, narration: 'mock' as const };
  });
  const score = scoreOf(ana, bruno, 'romantic');
  const o = opts(11);
  const tl = await gen(ana, bruno, score, 'romantic', o);
  assert.equal(calls(), 2);
  assert.ok(tl.meta.approach.startsWith('c-fallback'), `expected fallback, got ${tl.meta.approach}`);
  assert.deepEqual(errorsOf(tl, ana, bruno, score, o), []);
  for (const e of tl.events) assert.deepEqual(scanBanned(e.text), []);
});

test('V8c: friendship candidate smuggling dissolution/horizon/epilogue → rejected; internal fallback when approach A is also down', async (t) => {
  const { gen, calls } = await withGarbageC(t, 'smuggle', async () => ({
    candidate: {
      arcs: [
        {
          id: 'g-friction', role: 'friction', sourceTerm: 'commonGround', label: 'Where it grinds',
          beats: [
            { year: 2, kind: 'conflict', domain: 'hobby', hint: 'tastes drift' },
            { year: 3, kind: 'recovery', domain: 'hobby', hint: 'they trade recommendations' },
          ],
        },
        {
          id: 'g-texture', role: 'texture', sourceTerm: null, label: 'The good stuff',
          beats: [
            { year: 1, kind: 'vignette', domain: 'food', hint: 'a first hangout' },
            { year: 4, kind: 'trip', domain: 'trip', hint: 'a short trip' },
            { year: 5, kind: 'vignette', domain: 'media', hint: 'a running joke' },
          ],
        },
      ],
      events: [
        { year: 1, arcId: 'g-texture', kind: 'vignette', domain: 'food', text: 'An easy first hangout.' },
        { year: 2, arcId: 'g-friction', kind: 'conflict', domain: 'hobby', text: 'Their tastes drift apart for a season.' },
        { year: 3, arcId: 'g-friction', kind: 'recovery', domain: 'hobby', text: 'They trade recommendations across the gap.' },
        { year: 4, arcId: 'g-texture', kind: 'trip', domain: 'trip', text: 'A short trip becomes a long story.' },
        { year: 5, arcId: 'g-texture', kind: 'vignette', domain: 'media', text: 'A running joke resurfaces.' },
      ],
      // The smuggle: duration/ending fields on a friendship timeline (PILLARS §6.1).
      horizonYears: 9,
      dissolution: { year: 3, arcId: 'g-friction' },
      epilogue: 'They stay in touch.',
    },
    narration: 'mock' as const,
  }), true);
  const score = scoreOf(ana, bruno, 'friendship');
  const o = opts(13);
  const tl = await gen(ana, bruno, score, 'friendship', o);
  assert.equal(calls(), 2);
  assert.equal(tl.meta.approach, 'c-fallback-internal', 'with approach A down, the built-in sampler must answer');
  assert.equal(tl.lens, 'friendship');
  const anyT = tl as unknown as Record<string, unknown>;
  for (const key of ['horizonYears', 'dissolution', 'epilogue']) assert.ok(!(key in anyT), `fallback leaked "${key}"`);
  assert.deepEqual(errorsOf(tl, ana, bruno, score, o), []);
  assert.ok(tl.events.length >= LENS_CONSTRAINTS.friendship.minEvents);
  assert.ok(tl.arcs.some((arc) => arc.role === 'friction'));
});

// ---------------------------------------------------------------------------
// V9 — degraded pairs (imputed latents) still get full timelines
// ---------------------------------------------------------------------------

test('V9: degraded pair → >= minEvents in every lens, every approach; meta.degraded set', async () => {
  assert.ok(isDegradedPair(ana, dana), 'fixture must be degraded');
  assert.ok(!isDegradedPair(ana, bruno), 'control fixture must not be degraded');
  for (const [name, gen] of APPROACHES) {
    for (const lens of LENSES) {
      const score = scoreOf(ana, dana, lens);
      for (const seed of [3, 9, 21]) {
        const o = opts(seed);
        const t = await gen(ana, dana, score, lens, o);
        assert.ok(t.events.length >= LENS_CONSTRAINTS[lens].minEvents,
          `approach ${name} / ${lens} seed ${seed}: degraded pair got only ${t.events.length} events`);
        assert.equal(t.meta.degraded, true, `approach ${name} / ${lens}: meta.degraded not set`);
        assert.deepEqual(errorsOf(t, ana, dana, score, o), []);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// V10 — meta contract (offline runs)
// ---------------------------------------------------------------------------

test('V10: meta — narration is mock offline; canonicity seeded (A/B) vs storage (C); approach labels', async () => {
  const rows = await matrix();
  for (const r of rows) {
    assert.equal(r.t.meta.narration, 'mock', `approach ${r.approach}: offline run must be mock narration`);
    assert.equal(r.t.meta.seed, r.seed);
    if (r.approach === 'a' || r.approach === 'b') {
      assert.equal(r.t.meta.approach, r.approach);
      assert.equal(r.t.meta.canonicity, 'seeded');
    } else {
      assert.equal(r.t.meta.approach, 'c', 'mock-mode C must validate on attempt 1 (no fallback)');
      assert.equal(r.t.meta.canonicity, 'storage');
    }
  }
});

// ---------------------------------------------------------------------------
// V11 — approach B: the LLM proposes, only code admits
// ---------------------------------------------------------------------------

test('V11: verifyTriggerClaim admits only claims true of the actual PairScore', () => {
  const score = scoreOf(ana, bruno, 'romantic');
  const space = {
    patterns: ['spark', 'slow-build', 'grind-repair', 'leap', 'ritual', 'stress-test'],
    domains: LENS_CONSTRAINTS.romantic.domains.filter((d) => d !== 'kids'),
    outcomes: ['strengthens', 'lingers', 'redirects'],
  };
  const freshDomain = space.domains.find((d) => d !== 'kids') as string;
  const base = { pattern: 'spark', domain: freshDomain, outcome: 'strengthens' };

  // True driver claim → admitted.
  const topDriver = score.drivers[0].term;
  const ok = verifyTriggerClaim({ ...base, triggerClaim: `driver:${topDriver}` }, score, 'romantic', space, []);
  assert.equal(ok.admitted, true, ok.reason);
  assert.equal(ok.sourceTerm, topDriver);

  // A term that is NOT a top driver → rejected.
  const notDriver = (['agency', 'eligibility', 'distance', 'politeness', 'reliability'] as const)
    .find((term) => !score.drivers.some((d) => d.term === term)) as string;
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: `driver:${notDriver}` }, score, 'romantic', space, []).admitted, false);

  // Wrong friction term → rejected; the actual one → admitted.
  const actual = score.friction?.term as string;
  const wrong = actual === 'structural' ? 'commonGround' : 'structural';
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: `friction:${wrong}` }, score, 'romantic', space, []).admitted, false);
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: `friction:${actual}` }, score, 'romantic', space, []).admitted, true);

  // Unfired flag → rejected. Malformed claim → rejected. Duplicate domain → rejected.
  assert.equal(score.flags.pursueWithdraw, undefined);
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: 'flag:pursueWithdraw' }, score, 'romantic', space, []).admitted, false);
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: 'because vibes' }, score, 'romantic', space, []).admitted, false);
  assert.equal(verifyTriggerClaim({ ...base, triggerClaim: `driver:${topDriver}` }, score, 'romantic', space,
    [{ pattern: 'ritual', domain: freshDomain }]).admitted, false);
});

// ---------------------------------------------------------------------------
// V12 — adversarial edge pairs: no-tags/no-distanceBand, both-high-agency,
// pursue-withdraw, max capacity gap — every approach, every lens, many seeds
// ---------------------------------------------------------------------------

function mkEdge(id: string, o: MkOpts & { noTags?: boolean; noDistance?: boolean }): Person {
  const p = mk(id, o);
  if (o.noTags) p.declared.tags = [];
  if (o.noDistance) p.declared.distanceBand = undefined;
  return p;
}

test('V12: edge pairs — degraded inputs, flag-firing pairs, capacity gaps: always valid, never throw, C never falls back', async () => {
  const edgePairs: Array<[string, Person, Person]> = [
    ['no-tags+no-distance',
      mkEdge('nta', { noTags: true, noDistance: true, gender: 'F' }),
      mkEdge('ntb', { noTags: true, noDistance: true, gender: 'M', cap: 1, chrono: 2 })],
    ['both-high-agency',
      mk('haa', { agc: 0.95, se: 0.45, gender: 'F', tags: ['music'] }),
      mk('hab', { agc: 0.95, se: 0.45, gender: 'M', tags: ['music'] })],
    ['pursue-withdraw',
      mk('pwa', { reg: 0.1, se: 0.3, gender: 'F', tags: ['music'] }),
      mk('pwb', { distanceBand: 3, gender: 'M', tags: ['music'] })],
    ['capacity-gap-3',
      mk('cga', { cap: 0, gender: 'F', tags: ['music'] }),
      mk('cgb', { cap: 3, gender: 'M', tags: ['chess'] })],
  ];
  // Precondition: the flag pairs actually fire their flags.
  const sHA = scoreOf(edgePairs[1][1], edgePairs[1][2], 'romantic');
  const sPW = scoreOf(edgePairs[2][1], edgePairs[2][2], 'romantic');
  assert.ok((sHA.flags.bothHighAgency ?? 0) > 0.5, 'both-high-agency fixture must fire the flag');
  assert.ok(sPW.flags.pursueWithdraw !== undefined, 'pursue-withdraw fixture must fire the flag');

  let runs = 0;
  for (const [pname, a, b] of edgePairs) {
    for (const lens of LENSES) {
      const score = scoreOf(a, b, lens);
      for (const [gname, gen] of APPROACHES) {
        for (let seed = 1; seed <= 10; seed++) {
          const o = opts(seed);
          const t = await gen(a, b, score, lens, o);
          runs++;
          assert.deepEqual(errorsOf(t, a, b, score, o), [], `approach ${gname} / ${lens} / ${pname} seed ${seed}`);
          if (gname === 'c') assert.equal(t.meta.approach, 'c', `approach c / ${lens} / ${pname} seed ${seed}: unexpected fallback`);
        }
      }
    }
  }
  console.log(`  V12 edge sweep: ${runs} runs, all valid`);

  // Approach A surfaces flag arcs deterministically when the score flags fire
  // (approach B drops them on friction-domain collisions — see findings).
  for (let seed = 1; seed <= 5; seed++) {
    const tHA = await genA(edgePairs[1][1], edgePairs[1][2], sHA, 'romantic', opts(seed));
    assert.ok(tHA.arcs.some((x) => x.role === 'flag' && x.sourceTerm === 'agency'),
      `approach a seed ${seed}: bothHighAgency fired but no agency flag arc`);
    const tPW = await genA(edgePairs[2][1], edgePairs[2][2], sPW, 'romantic', opts(seed));
    assert.ok(tPW.arcs.some((x) => x.role === 'flag' && x.sourceTerm === 'distance'),
      `approach a seed ${seed}: pursueWithdraw fired but no distance flag arc`);
  }
});

test('V11b: any admitted bonus arc in the matrix cites a real score component', async () => {
  const rows = (await matrix()).filter((r) => r.approach === 'b');
  let bonusSeen = 0;
  for (const r of rows) {
    for (const arc of r.t.arcs.filter((x) => x.role === 'bonus')) {
      bonusSeen++;
      const legit = new Set<string | null>([
        r.score.friction?.term ?? null,
        ...r.score.drivers.map((d) => d.term),
        ...(r.score.flags.bothHighAgency !== undefined ? ['agency'] : []),
        ...(r.score.flags.pursueWithdraw !== undefined ? ['distance'] : []),
      ]);
      assert.ok(legit.has(arc.sourceTerm), `approach b / ${r.lens} seed ${r.seed}: bonus arc cites "${arc.sourceTerm}" which is not a scored driver/friction/flag`);
    }
  }
  console.log(`  V11b bonus arcs admitted across matrix: ${bonusSeen}`);
});

// ---------------------------------------------------------------------------
// V12 — batch narration: count validation, retry-once fallback, pet guard.
// No network: narrateBatchLive is driven by a stub LiveClient whose
// generateObject returns scripted objects (zod comes from node_modules).
// ---------------------------------------------------------------------------

const V12_BEATS = [
  { year: 1, kind: 'milestone', domain: 'home', hint: 'an easy first month' },
  { year: 3, kind: 'ritual', domain: 'ritual', hint: 'a standing plan takes hold' },
] as const;

/** Stub LiveClient: generateObject succeeds, returning scripted objects in order. */
async function stubLiveClient(objects: unknown[]) {
  const { z } = await import('zod');
  let calls = 0;
  const client = {
    mode: 'live' as const,
    model: 'stub/primary',
    z,
    gateway: (id: string) => id,
    generateObject: async () => ({ object: objects[Math.min(calls++, objects.length - 1)] }),
  };
  return { client, calls: () => calls };
}

test('V12a: validateBatch — count, index bijection (1- or 0-based), safety, length cap', async () => {
  const { validateBatch, MAX_SENTENCE_CHARS } = await import('./lib/narrator.ts');

  // Shuffled 1-based indexes → accepted, texts come back in beat order.
  const ok = validateBatch({ sentences: [{ index: 2, text: 'Second.' }, { index: 1, text: 'First.' }] }, 2);
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && ok.texts, ['First.', 'Second.']);

  // 0-based bijection tolerated and normalized.
  const zero = validateBatch({ sentences: [{ index: 0, text: 'First.' }, { index: 1, text: 'Second.' }] }, 2);
  assert.ok(zero.ok);
  assert.deepEqual(zero.ok && zero.texts, ['First.', 'Second.']);

  // Wrong count, bad indexes, empty text, over-cap, banned content → rejected.
  assert.equal(validateBatch({ sentences: [{ index: 1, text: 'Only one.' }] }, 2).ok, false);
  assert.equal(validateBatch({ sentences: [{ index: 1, text: 'A.' }, { index: 3, text: 'B.' }] }, 2).ok, false);
  assert.equal(validateBatch({ sentences: [{ index: 1, text: '  ' }, { index: 2, text: 'B.' }] }, 2).ok, false);
  assert.equal(validateBatch({ sentences: [{ index: 1, text: 'x'.repeat(MAX_SENTENCE_CHARS + 1) }, { index: 2, text: 'B.' }] }, 2).ok, false);
  const poison = 'A moment of ' + 'con' + 'tempt' + ' colors the week.'; // constructed, never literal here
  assert.equal(validateBatch({ sentences: [{ index: 1, text: poison }, { index: 2, text: 'B.' }] }, 2).ok, false);
  assert.equal(validateBatch({ sentences: [{ index: 1, text: 'They beat 3 of 4 odds.' }, { index: 2, text: 'B.' }] }, 2).ok, false);
});

test('V12b: narrateBatchLive — invalid count twice → exactly one retry, then null (mock fallback)', async () => {
  const { narrateBatchLive } = await import('./lib/narrator.ts');
  const bad = { sentences: [{ index: 1, text: 'Only one sentence for two beats.' }] };
  const { client, calls } = await stubLiveClient([bad, bad]);
  const beats = V12_BEATS.map((b) => ({ ...b }));
  const res = await narrateBatchLive(client as never, beats as never, ana, bruno, 'romantic', opts(5));
  assert.equal(res, null, 'twice-invalid batch must yield null so narrate() falls back to mock');
  assert.equal(calls(), 2, 'must retry exactly once (2 calls total)');
});

test('V12c: narrateBatchLive — invalid then valid → recovers live on the single retry', async () => {
  const { narrateBatchLive } = await import('./lib/narrator.ts');
  const bad = { sentences: [] };
  const good = { sentences: [{ index: 1, text: 'An easy first month lands.' }, { index: 2, text: 'The standing plan takes hold.' }] };
  const { client, calls } = await stubLiveClient([bad, good]);
  const beats = V12_BEATS.map((b) => ({ ...b }));
  const res = await narrateBatchLive(client as never, beats as never, ana, bruno, 'romantic', opts(5));
  assert.ok(res !== null);
  assert.equal(calls(), 2);
  assert.deepEqual(res?.texts, ['An easy first month lands.', 'The standing plan takes hold.']);
  assert.equal(res?.petGuardReplacements, 0);
  assert.equal(res?.model, 'stub/primary');
});

test('V12d: pet guard — pet-word sentence with pets:none → deterministic mock replacement, counted', async () => {
  const { narrateBatchLive, mockNarrateBeat, mentionsPet, buildInventory } = await import('./lib/narrator.ts');
  const beats = V12_BEATS.map((b) => ({ ...b })); // no pet deltas → inventory pets: none
  assert.deepEqual(buildInventory(beats as never).pets, []);
  const good = {
    sentences: [
      { index: 1, text: 'An easy first month lands.' },
      { index: 2, text: 'Their dog claims the couch during the standing plan.' },
    ],
  };
  const { client } = await stubLiveClient([good]);
  const o = opts(5);
  const res = await narrateBatchLive(client as never, beats as never, ana, bruno, 'romantic', o);
  assert.ok(res !== null);
  assert.equal(res?.petGuardReplacements, 1);
  assert.equal(res?.texts[0], 'An easy first month lands.');
  assert.equal(res?.texts[1], mockNarrateBeat(beats[1] as never, ana, bruno, o.seed, 1), 'replacement must be the beat\'s deterministic mock sentence');

  // With an established pet, the same sentence passes.
  const petBeats = [
    { year: 1, kind: 'pet', domain: 'home', hint: 'a rescue arrives', delta: { addPet: 'a rescue dog' } },
    { ...V12_BEATS[1] },
  ];
  assert.deepEqual(buildInventory(petBeats as never).pets, ['a rescue dog']);
  const { client: client2 } = await stubLiveClient([{
    sentences: [
      { index: 1, text: 'A rescue dog moves in and renames the couch.' },
      { index: 2, text: 'The dog joins the standing plan.' },
    ],
  }]);
  const res2 = await narrateBatchLive(client2 as never, petBeats as never, ana, bruno, 'romantic', o);
  assert.equal(res2?.petGuardReplacements, 0);
  assert.equal(res2?.texts[1], 'The dog joins the standing plan.');

  // Guard word list sanity.
  for (const s of ['their dog', 'two cats', 'a new puppy', 'the pup', 'a kitten', 'their pet']) assert.ok(mentionsPet(s), s);
  for (const s of ['a carpet on the floor', 'they adopt a routine', 'puppet show', 'catalog of rituals']) assert.ok(!mentionsPet(s), s);
});
