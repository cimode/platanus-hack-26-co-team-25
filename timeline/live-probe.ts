/** Minimal live probe: one pair, three approaches, one seed. TEMP FILE. */
import { scorePair, type Person } from '../src/lib/domain/matching/engine.ts';
import type { TimelineOpts } from './shared.ts';

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

const score = scorePair(sofia, diego, 'romantic');
const opts: TimelineOpts = { seed: 11, offspringConsentA: true, offspringConsentB: true, live: true };
const approaches = ['a', 'b', 'c'];
for (const k of approaches) {
  const mod = await import(`./approach-${k}/index.ts`);
  const t0 = Date.now();
  try {
    const t = await mod.generateTimeline(sofia, diego, score, 'romantic', opts);
    const ms = Date.now() - t0;
    console.log(`\n===== APPROACH ${k.toUpperCase()} — ${ms}ms — narration=${t.meta?.narration} =====`);
    for (const e of t.events) console.log(`  Y${e.year}  [${e.kind ?? e.type ?? ''}/${e.domain ?? ''}]  ${e.text ?? e.title ?? ''}`);
    if ('dissolution' in t && t.dissolution) console.log(`  — dissolution: year ${t.dissolution.year}`);
  } catch (e) {
    console.log(`\n===== APPROACH ${k.toUpperCase()} FAILED after ${Date.now() - t0}ms: ${String((e as Error).message).slice(0, 200)}`);
  }
}
