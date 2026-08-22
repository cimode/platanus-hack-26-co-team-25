/**
 * approach-c/demo.ts — proof runner for approach C (mock narration, offline).
 *
 * Runs sofia × diego (persons replicated verbatim from timeline/compare.ts —
 * that file has no exports) through generateTimeline for all three lenses,
 * validates every output with the shared validator, checks mock determinism,
 * exercises the internal hard-fallback sampler, and safety-scans the two skill
 * documents themselves (they are prompt-authored text: the banned-category
 * scanners must find nothing in them).
 *
 * Run: node --experimental-strip-types timeline/approach-c/demo.ts
 */

import { readFileSync } from 'node:fs';
import { scorePair, type Person, type Lens } from '../../src/lib/domain/matching/engine.ts';
import {
  scanBanned, scanSurvivalClaims, validateTimeline,
  type Timeline, type TimelineOpts,
} from '../shared.ts';
import { generateTimeline, fallbackTimeline } from './index.ts';

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

const OPTS: TimelineOpts = { seed: 11, offspringConsentA: true, offspringConsentB: true, live: false };

function render(t: Timeline): string[] {
  const lines: string[] = [];
  const labelOf = new Map(t.arcs.map((a) => [a.id, a.label]));
  lines.push(`  meta: approach=${t.meta.approach} narration=${t.meta.narration} canonicity=${t.meta.canonicity} degraded=${t.meta.degraded}`);
  lines.push(`  arcs: ${t.arcs.map((a) => `${a.id}[${a.role}:${a.sourceTerm ?? '-'}]`).join(' · ')}`);
  for (const e of t.events) {
    lines.push(`  Year ${e.year} · ${e.kind}/${e.domain} · (${labelOf.get(e.arcId)}) — ${e.text}`);
  }
  if (t.lens !== 'friendship') {
    lines.push(t.dissolution
      ? `  Ending: wound down in year ${t.dissolution.year} (horizon ${t.horizonYears}y)${t.epilogue ? ` — epilogue: ${t.epilogue}` : ''}`
      : `  Ending: still going at the ${t.horizonYears}-year horizon`);
  } else {
    lines.push('  Ending: none — episodic vignettes, no duration claim (structurally absent fields)');
  }
  return lines;
}

async function main(): Promise<void> {
  const lenses: Lens[] = ['romantic', 'business', 'friendship'];

  for (const lens of lenses) {
    const score = scorePair(sofia, diego, lens);
    console.log(`\n=== sofia × diego — ${lens} ===`);
    console.log(`score: band=${score.band} sim=${score.sim.toFixed(3)} drivers=[${score.drivers.map((d) => d.term).join(', ')}] friction=${score.friction?.term} flags=[${Object.keys(score.flags).join(', ') || 'none'}]`);
    if (!score.eligible) { console.log(`  INELIGIBLE: ${score.reason}`); continue; }

    const t = await generateTimeline(sofia, diego, score, lens, OPTS);
    for (const line of render(t)) console.log(line);

    const issues = validateTimeline(t, sofia, diego, score, OPTS);
    const errors = issues.filter((i) => i.severity === 'error');
    const warns = issues.filter((i) => i.severity === 'warn');
    console.log(`  validator: ${errors.length} error(s), ${warns.length} warning(s)${warns.map((w) => ` [${w.code}]`).join('')}`);

    // Friendship structural guarantee: the keys must be ABSENT, not null.
    if (lens === 'friendship') {
      const raw = t as unknown as Record<string, unknown>;
      const smuggled = ['horizonYears', 'dissolution', 'epilogue'].filter((k) => k in raw);
      console.log(`  friendship structural check: ${smuggled.length === 0 ? 'PASS (no duration/dissolution keys)' : `FAIL (${smuggled.join(', ')})`}`);
    }

    // Mock-mode determinism (canonicity is by storage; mock happens to be seeded).
    const t2 = await generateTimeline(sofia, diego, score, lens, OPTS);
    console.log(`  mock repeat identical: ${JSON.stringify(t) === JSON.stringify(t2) ? 'yes' : 'no'}`);

    // Hard-fallback sampler: must always be valid on its own.
    const fb = fallbackTimeline(sofia, diego, score, lens, OPTS);
    const fbErrors = validateTimeline(fb, sofia, diego, score, OPTS).filter((i) => i.severity === 'error');
    console.log(`  internal fallback sampler: ${fb.events.length} events, ${fbErrors.length} validation error(s)`);
  }

  // Skill docs are prompt-authored text — scan them with both scanners.
  console.log('\n=== skill-document safety self-scan ===');
  for (const name of ['arc-science.md', 'narrative-safety.md']) {
    const text = readFileSync(new URL(`./skills/${name}`, import.meta.url), 'utf8');
    const banned = scanBanned(text);
    const survival = scanSurvivalClaims(text);
    console.log(`  ${name}: ${banned.length} banned hit(s), ${survival.length} survival-claim hit(s)${banned.map((h) => ` [${h.category}:${h.match}]`).join('')}${survival.map((s) => ` [${s}]`).join('')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
