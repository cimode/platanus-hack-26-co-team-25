/**
 * compare.ts — three-way bake-off harness for the score→timeline layer (AUDIT F2).
 *
 * Runs every present approach (timeline/approach-{a,b,c}/index.ts, shared
 * interface from shared.ts) over the SAME sample set:
 *   1. sofia × diego  — romantic          (both-high-agency pair, kid gate passes)
 *   2. sofia × mateo  — business          (same team + track, capacity match)
 *   3. sofia × carla  — friendship        (heavy tag overlap)
 *   4. sofia × nina   — business DEGRADED (nina has zero measured latents → imputed priors)
 * …and writes timeline/COMPARISON.md: side-by-side timelines (seed 11), structure
 * stats across seeds 11/22/33, friction-arc check, safety scan, narration mode,
 * determinism check, and an empty human verdict section.
 *
 * Stub-tolerant: a missing approach directory is reported, not fatal.
 *
 * Run:            node --experimental-strip-types timeline/compare.ts
 * Live narration: TIMELINE_LIVE=1 node --experimental-strip-types timeline/compare.ts
 *
 * The room members are replicated VERBATIM from matching/demo.ts (which is a
 * console script with no exports — importing it would run its printout).
 */

import { writeFileSync } from 'node:fs';
import { scorePair, type Person, type Lens, type PairScore } from '../matching/engine.ts';
import {
  isDegradedPair, validateTimeline,
  type GenerateTimeline, type Timeline, type TimelineOpts,
} from './shared.ts';

// ---------------------------------------------------------------------------
// The room (verbatim subset of matching/demo.ts)
// ---------------------------------------------------------------------------

const sofia: Person = {
  id: 'sofia', name: 'Sofia',
  latents: {
    regulation: { mean: 0.72, se: 0.35 },
    politeness: { mean: 0.68, se: 0.35 },
    reliability: { mean: 0.75, se: 0.35 },
    agency: { mean: 0.82, se: 0.30 },
  },
  declared: {
    distanceBand: 3,
    lifeShape: { moneyPosture: 0.6, rootedness: 0.7, familyGravity: 0.5, capacityHoursBand: 2 },
    tags: ['climbing', 'scifi', 'sushi', 'indie-music', 'dogs'],
    chronotype: 1,
  },
  structural: { team: 'alpha', track: 'fintech', cohort: 0, acquaintances: ['mateo'] },
  gates: {
    romantic: { interestedIn: ['M'], gender: 'F', single: true, ageBand: 1, wantsKids: true },
    business: { riskPosture: 1, exitHorizon: 1, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
};

const mateo: Person = {
  id: 'mateo', name: 'Mateo',
  latents: {
    regulation: { mean: 0.66 }, politeness: { mean: 0.71 },
    reliability: { mean: 0.62 }, agency: { mean: 0.45 },
  },
  declared: {
    distanceBand: 0,
    lifeShape: { moneyPosture: 0.55, rootedness: 0.65, familyGravity: 0.45, capacityHoursBand: 2 },
    tags: ['climbing', 'sushi', 'startups', 'dogs'],
    chronotype: 1,
  },
  structural: { team: 'alpha', track: 'fintech', cohort: 0 },
  gates: {
    romantic: { interestedIn: ['F'], gender: 'M', single: true, ageBand: 1, wantsKids: false },
    business: { riskPosture: 2, exitHorizon: 1, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
};

const diego: Person = {
  id: 'diego', name: 'Diego',
  latents: {
    regulation: { mean: 0.60 }, politeness: { mean: 0.55 },
    reliability: { mean: 0.80 }, agency: { mean: 0.85, se: 0.30 },
  },
  declared: {
    distanceBand: 1,
    lifeShape: { moneyPosture: 0.7, rootedness: 0.6, familyGravity: 0.4, capacityHoursBand: 3 },
    tags: ['startups', 'crossfit', 'sushi'],
    chronotype: 0,
  },
  structural: { team: 'gamma', track: 'fintech', cohort: 1 },
  gates: {
    romantic: { interestedIn: ['F', 'NB'], gender: 'M', single: true, ageBand: 1, wantsKids: true },
    business: { riskPosture: 1, exitHorizon: 1, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
};

const carla: Person = {
  id: 'carla', name: 'Carla',
  latents: {
    regulation: { mean: 0.55 }, politeness: { mean: 0.62 },
    reliability: { mean: 0.58 }, agency: { mean: 0.50 },
  },
  declared: {
    distanceBand: 0,
    lifeShape: { moneyPosture: 0.6, rootedness: 0.7, familyGravity: 0.5, capacityHoursBand: 2 },
    tags: ['climbing', 'indie-music', 'sushi', 'dogs', 'scifi'],
    chronotype: 1,
  },
  structural: { cohort: 0 },
  gates: {
    romantic: { interestedIn: ['M'], gender: 'F', single: true, ageBand: 1, wantsKids: true },
    business: { riskPosture: 0, exitHorizon: 2, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
};

const nina: Person = {
  id: 'nina', name: 'Nina',
  latents: {}, // degraded mode: every latent imputes to prior 0.5 / se 0.6 (AUDIT S15)
  declared: {
    lifeShape: { moneyPosture: 0.5, rootedness: 0.5, familyGravity: 0.5, capacityHoursBand: 1 },
    tags: ['yoga', 'scifi', 'coffee'],
    chronotype: 1,
  },
  structural: { track: 'health', cohort: 0 },
  gates: {
    romantic: { interestedIn: ['F'], gender: 'F', single: true, ageBand: 1, wantsKids: false },
    business: { riskPosture: 0, exitHorizon: 1, redlinesOk: true },
  },
  consent: { romantic: true, business: true, friendship: true },
  hasPhoto: true,
};

// ---------------------------------------------------------------------------
// Samples & config
// ---------------------------------------------------------------------------

interface Sample { key: string; title: string; a: Person; b: Person; lens: Lens }

const SAMPLES: Sample[] = [
  { key: 'sofia-diego-rom', title: 'Sofia × Diego — romantic', a: sofia, b: diego, lens: 'romantic' },
  { key: 'sofia-mateo-biz', title: 'Sofia × Mateo — business', a: sofia, b: mateo, lens: 'business' },
  { key: 'sofia-carla-fri', title: 'Sofia × Carla — friendship', a: sofia, b: carla, lens: 'friendship' },
  { key: 'sofia-nina-biz-degraded', title: 'Sofia × Nina — business (degraded mode)', a: sofia, b: nina, lens: 'business' },
];

const SEEDS = [11, 22, 33] as const;
const RENDER_SEED = SEEDS[0];
const LIVE = process.env.TIMELINE_LIVE === '1';

function optsFor(seed: number): TimelineOpts {
  return { seed, offspringConsentA: true, offspringConsentB: true, live: LIVE };
}

// ---------------------------------------------------------------------------
// Approach loading — stub-tolerant
// ---------------------------------------------------------------------------

interface LoadedApproach { name: string; generate: GenerateTimeline }
interface MissingApproach { name: string; error: string }

async function loadApproaches(): Promise<{ loaded: LoadedApproach[]; missing: MissingApproach[] }> {
  const loaded: LoadedApproach[] = [];
  const missing: MissingApproach[] = [];
  for (const name of ['approach-a', 'approach-b', 'approach-c']) {
    try {
      const mod = await import(`./${name}/index.ts`) as { generateTimeline?: GenerateTimeline };
      if (typeof mod.generateTimeline !== 'function') {
        missing.push({ name, error: 'module loaded but exports no generateTimeline()' });
        continue;
      }
      loaded.push({ name, generate: mod.generateTimeline });
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      missing.push({ name, error: msg });
    }
  }
  return { loaded, missing };
}

// ---------------------------------------------------------------------------
// Stats & rendering
// ---------------------------------------------------------------------------

/** Structural fingerprint — text excluded (structure must be seeded-deterministic in A/B). */
function fingerprint(t: Timeline): string {
  const arcs = t.arcs.map((a) => ({
    id: a.id, role: a.role, term: a.sourceTerm,
    beats: a.beats.map((b) => [b.year, b.kind, b.domain]),
  }));
  const events = t.events.map((e) => [e.year, e.arcId, e.kind, e.domain]);
  const ending = t.lens === 'friendship' ? null : { h: t.horizonYears, d: t.dissolution };
  return JSON.stringify({ arcs, events, ending });
}

interface RunStats {
  ok: boolean;
  error?: string;
  timeline?: Timeline;
  issues?: ReturnType<typeof validateTimeline>;
}

async function runOnce(
  ap: LoadedApproach, s: Sample, score: PairScore, seed: number,
): Promise<RunStats> {
  try {
    const t = await ap.generate(s.a, s.b, score, s.lens, optsFor(seed));
    return { ok: true, timeline: t, issues: validateTimeline(t, s.a, s.b, score, optsFor(seed)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split('\n')[0] : String(err) };
  }
}

function renderTimeline(t: Timeline): string[] {
  const lines: string[] = [];
  const labelOf = new Map(t.arcs.map((a) => [a.id, a.label]));
  for (const e of t.events) {
    lines.push(`- **Year ${e.year}** · _${labelOf.get(e.arcId) ?? e.arcId}_ · \`${e.kind}/${e.domain}\` — ${e.text}`);
  }
  if (t.lens !== 'friendship') {
    lines.push(t.dissolution
      ? `- **Ending:** wound down in year ${t.dissolution.year} (horizon ${t.horizonYears}y)${t.epilogue ? ` — epilogue: ${t.epilogue}` : ''}`
      : `- **Ending:** still going at the ${t.horizonYears}-year horizon`);
  } else {
    lines.push('- **Ending:** none — friendship timelines are episodic vignettes with no duration claim (PILLARS §6.1)');
  }
  return lines;
}

function fmtScore(score: PairScore): string {
  const drivers = score.drivers.map((d) => d.term).join(', ');
  const flags = Object.keys(score.flags).join(', ') || 'none';
  return `band **${score.band}** · rank ${score.rank.toFixed(3)} · sim ${score.sim.toFixed(3)} · drivers: ${drivers} · friction: **${score.friction?.term ?? 'none'}** · flags: ${flags}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { loaded, missing } = await loadApproaches();
  const md: string[] = [];

  md.push('# COMPARISON — score→timeline three-way bake-off (AUDIT F2)');
  md.push('');
  md.push(`Same interface (\`timeline/shared.ts\`), same sample set, seeds ${SEEDS.join('/')}. `
    + `Rendered timelines use seed ${RENDER_SEED}. Narration requested: **${LIVE ? 'live' : 'mock'}**. `
    + 'Regenerate: `node --experimental-strip-types timeline/compare.ts` (add `TIMELINE_LIVE=1` for live narration).');
  md.push('');
  md.push('## Approaches present');
  md.push('');
  for (const ap of loaded) md.push(`- **${ap.name}** — loaded`);
  for (const m of missing) md.push(`- **${m.name}** — MISSING (${m.error})`);
  md.push('');

  for (const s of SAMPLES) {
    const score = scorePair(s.a, s.b, s.lens);
    md.push(`## ${s.title}`);
    md.push('');
    md.push(`Score: ${fmtScore(score)} · degraded pair: **${isDegradedPair(s.a, s.b) ? 'yes' : 'no'}**`);
    md.push('');
    if (!score.eligible) {
      md.push(`> Pair ineligible under this lens (${score.reason}) — sample skipped.`);
      md.push('');
      continue;
    }

    // Side-by-side timelines at the render seed --------------------------------
    for (const ap of loaded) {
      md.push(`### ${ap.name} (seed ${RENDER_SEED})`);
      md.push('');
      const run = await runOnce(ap, s, score, RENDER_SEED);
      if (!run.ok || !run.timeline) {
        md.push(`> generation FAILED: ${run.error}`);
        md.push('');
        continue;
      }
      md.push(...renderTimeline(run.timeline));
      const errs = (run.issues ?? []).filter((i) => i.severity === 'error');
      const warns = (run.issues ?? []).filter((i) => i.severity === 'warn');
      if (errs.length + warns.length > 0) {
        md.push('');
        md.push(`Validator: ${errs.length} error(s), ${warns.length} warning(s)`);
        for (const i of [...errs, ...warns]) md.push(`  - ${i.severity.toUpperCase()} \`${i.code}\`: ${i.message}`);
      }
      md.push('');
    }

    // Structure stats across the 3 seeds --------------------------------------
    if (loaded.length > 0) {
      md.push('### Structure stats (3 seeds)');
      md.push('');
      md.push('| approach | narration | events | arcs | friction arc | kid events | safety hits | validation errors | distinct structures /3 | seed-repeat deterministic |');
      md.push('|---|---|---|---|---|---|---|---|---|---|');
      for (const ap of loaded) {
        const runs: RunStats[] = [];
        for (const seed of SEEDS) runs.push(await runOnce(ap, s, score, seed));
        const okRuns = runs.filter((r) => r.ok && r.timeline);
        if (okRuns.length === 0) {
          md.push(`| ${ap.name} | — | — | — | — | — | — | all ${SEEDS.length} runs failed | — | — |`);
          continue;
        }
        const timelines = okRuns.map((r) => r.timeline as Timeline);
        const events = timelines.map((t) => t.events.length);
        const arcs = timelines.map((t) => t.arcs.length);
        const frictionOk = timelines.every((t) => t.arcs.some((a) => a.role === 'friction'));
        const kidEvents = timelines.map((t) => t.events.filter((e) => e.kind === 'kid').length);
        const safetyHits = okRuns.reduce((n, r) => n + (r.issues ?? []).filter((i) => i.code.startsWith('safety.')).length, 0);
        const valErrors = okRuns.reduce((n, r) => n + (r.issues ?? []).filter((i) => i.severity === 'error').length, 0);
        const distinct = new Set(timelines.map(fingerprint)).size;
        // Determinism: same seed twice → identical structure? (C documents storage-canonicity instead.)
        const repeat = await runOnce(ap, s, score, RENDER_SEED);
        const first = runs[0];
        const deterministic = first.ok && repeat.ok && first.timeline && repeat.timeline
          ? (fingerprint(first.timeline) === fingerprint(repeat.timeline) ? 'yes' : 'no (storage-canonicity?)')
          : '—';
        const narr = [...new Set(timelines.map((t) => t.meta.narration))].join('+');
        const failNote = runs.length - okRuns.length > 0 ? ` (${runs.length - okRuns.length} run(s) failed)` : '';
        md.push(`| ${ap.name} | ${narr} | ${events.join('/')} | ${arcs.join('/')} | ${frictionOk ? 'all 3 ✓' : '✗ MISSING'} | ${kidEvents.join('/')} | ${safetyHits} | ${valErrors}${failNote} | ${distinct} | ${deterministic} |`);
      }
      md.push('');
    }
  }

  md.push('## Verdict');
  md.push('');
  md.push('_(human judgment goes here — which approach ships? criteria: coherence on stage, pattern variety, degraded-mode grace, safety margin, latency/cost when live)_');
  md.push('');

  const outPath = new URL('./COMPARISON.md', import.meta.url);
  writeFileSync(outPath, md.join('\n'), 'utf8');
  console.log(`Wrote ${outPath.pathname}`);
  console.log(`Approaches: ${loaded.map((x) => x.name).join(', ') || '(none)'} · missing: ${missing.map((x) => x.name).join(', ') || '(none)'}`);
}

main().catch((err) => {
  console.error('compare.ts failed:', err);
  process.exit(1);
});
