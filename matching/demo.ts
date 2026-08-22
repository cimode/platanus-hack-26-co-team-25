/**
 * demo.ts — Synthetic 8-person room exercising every engine path.
 *
 * Run: node --experimental-strip-types matching/demo.ts
 *
 * Showcases: the romantic wantsKids gate (sofia x mateo), an anxious x long-distance
 * pursueWithdraw pair (lucas x sofia — sofia's distanceBand is 3), a both-high-agency
 * cofounder pair (sofia x diego), degraded mode with missing latents (nina), and a
 * suppressed person with consent.romantic = false (pedro).
 */

import {
  scorePair,
  rankRoom,
  excludedFromRoom,
  type Person,
  type Lens,
  type RankedEntry,
} from './engine.ts';

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

const people: Person[] = [
  {
    // SUBJECT. distanceBand 3 (stays away longest) is what arms pursueWithdraw
    // against any anxious candidate. High agency arms the cofounder flag vs diego.
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
  },
  {
    // Trips the romantic wantsKids gate with sofia (she wants kids, he does not).
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
  },
  {
    // Anxious (regulation 0.22, se 0.45 → P(bottom band) ≈ .66). Paired with sofia
    // (distanceBand 3) this fires pursueWithdraw. No business gates answered →
    // suppressed from the business reveal (AUDIT S15).
    id: 'lucas', name: 'Lucas',
    latents: {
      regulation: { mean: 0.22, se: 0.45 }, politeness: { mean: 0.58 },
      reliability: { mean: 0.55 }, agency: { mean: 0.40 },
    },
    declared: {
      distanceBand: 2,
      lifeShape: { moneyPosture: 0.5, rootedness: 0.4, familyGravity: 0.6, capacityHoursBand: 1 },
      tags: ['scifi', 'anime', 'ramen'],
      chronotype: 2,
    },
    structural: { team: 'beta', track: 'health', cohort: 1, acquaintances: ['sofia'] },
    gates: {
      romantic: { interestedIn: ['F'], gender: 'M', single: true, ageBand: 2, wantsKids: true },
    },
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  },
  {
    // High agency (0.85) — with sofia (0.82) P(both top band) ≈ .61: the both-high
    // cofounder pair. Fully gate-compatible in business.
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
  },
  {
    // Degraded mode: NO latents answered → every latent imputes to prior 0.5/se 0.6
    // (AUDIT S15); weights never renormalize. Also missing distanceBand → neutral.
    id: 'nina', name: 'Nina',
    latents: {},
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
  },
  {
    // consent.romantic = false → suppressed from the romantic reveal entirely,
    // never ranked (PILLARS §8 rule 3). Present in business and friendship.
    id: 'pedro', name: 'Pedro',
    latents: {
      regulation: { mean: 0.70 }, politeness: { mean: 0.74 },
      reliability: { mean: 0.68 }, agency: { mean: 0.35 },
    },
    declared: {
      distanceBand: 0,
      lifeShape: { moneyPosture: 0.45, rootedness: 0.8, familyGravity: 0.7, capacityHoursBand: 2 },
      tags: ['football', 'grilling', 'dogs'],
      chronotype: 1,
    },
    structural: { team: 'beta', track: 'fintech', cohort: 2 },
    gates: {
      romantic: { interestedIn: ['F'], gender: 'M', single: true, ageBand: 2, wantsKids: true },
      business: { riskPosture: 0, exitHorizon: 0, redlinesOk: true },
    },
    consent: { romantic: false, business: true, friendship: true },
    hasPhoto: true,
  },
  {
    // Heavy tag overlap with sofia → friendship Common Ground showcase.
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
  },
  {
    // Not single → romantic gate 0 vs sofia. redlinesOk false → business gate 0.
    id: 'andres', name: 'Andres',
    latents: {
      regulation: { mean: 0.50 }, politeness: { mean: 0.50 },
      reliability: { mean: 0.45 }, agency: { mean: 0.60 },
    },
    declared: {
      distanceBand: 1,
      lifeShape: { moneyPosture: 0.4, rootedness: 0.3, familyGravity: 0.2, capacityHoursBand: 0 },
      tags: ['gaming', 'anime'],
      chronotype: 3,
    },
    structural: { team: 'gamma', track: 'health', cohort: 2 },
    gates: {
      romantic: { interestedIn: ['F'], gender: 'M', single: false, ageBand: 0, wantsKids: true },
      business: { riskPosture: 1, exitHorizon: 1, redlinesOk: false },
    },
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  },
];

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

const SUBJECT = 'sofia';
const f = (x: number): string => x.toFixed(3);

function printRoom(lens: Lens, opts?: { agencyOverlay?: boolean }): void {
  const overlay = opts?.agencyOverlay ? ' [agencyOverlay ON]' : '';
  console.log(`\n=== ${lens.toUpperCase()}${overlay} — room ranked for ${SUBJECT} (w_rank order) ===`);
  const ranked = rankRoom(people, SUBJECT, lens, opts);
  if (ranked.length === 0) console.log('  (no eligible pairs)');
  for (const e of ranked) {
    const flags = Object.entries(e.flags).map(([k, v]) => `${k}=${f(v as number)}`).join(' ');
    const drivers = e.drivers.map((d) => `${d.term}:${f(d.contribution)}`).join(' ');
    console.log(
      `  ${e.id.padEnd(7)} rank=${f(e.rank)} sim=${f(e.sim)} band=${e.band.padEnd(4)}` +
      ` | drivers ${drivers} | friction ${e.friction?.term}(score=${f(e.friction?.score ?? 0)})` +
      (flags ? ` | flags ${flags}` : ''),
    );
  }
  const bySim = [...ranked].sort((x, y) => y.sim - x.sim || (x.id < y.id ? -1 : 1));
  console.log(`  w_sim order: ${bySim.map((e) => `${e.id}(${f(e.sim)})`).join(' > ') || '(none)'}`);
  // Gate-0 fails are real pairs and legitimately shown as ineligible. SUPPRESSED entries
  // (consent off / no photo / no gates answered) are NEVER printed: the reveal must not
  // disclose anyone's opt-out (PILLARS §2 Consent & Disclosure Control; AUDIT S15
  // "excluded from the reveal entirely"). They are simply absent.
  const excluded = excludedFromRoom(people, SUBJECT, lens, opts)
    .filter((x) => !x.reason.startsWith('suppressed'));
  for (const x of excluded) console.log(`  excluded ${x.id.padEnd(7)} — ${x.reason}`);
}

console.log(`ROOM: ${people.length} people | subject: ${SUBJECT} | deterministic run`);

printRoom('romantic');
printRoom('business');                       // Agency default OFF, weights renormalized
printRoom('business', { agencyOverlay: true }); // the stage ablation: .05/.10 restored
printRoom('friendship');

// Spot checks -----------------------------------------------------------------
console.log('\n=== SPOT CHECKS ===');
const kidsGate = scorePair(people[0], people[1], 'romantic'); // sofia x mateo
console.log(`sofia x mateo   (romantic): eligible=${kidsGate.eligible} reason="${kidsGate.reason}"`);
const pw = scorePair(people[0], people[2], 'romantic'); // sofia x lucas
console.log(`sofia x lucas   (romantic): pursueWithdraw=${f(pw.flags.pursueWithdraw ?? 0)} sim=${f(pw.sim)} (includes fixed w_sim penalty)`);
const cofounders = scorePair(people[0], people[3], 'business', { agencyOverlay: true }); // sofia x diego
console.log(`sofia x diego   (business+overlay): bothHighAgency=${f(cofounders.flags.bothHighAgency ?? 0)} rank=${f(cofounders.rank)}`);
const degraded = scorePair(people[0], people[4], 'friendship'); // sofia x nina
console.log(`sofia x nina    (friendship, nina has zero latents → prior 0.5/se 0.6): rank=${f(degraded.rank)} band=${degraded.band}`);
// Suppression check WITHOUT disclosure (PILLARS §2 Consent & Disclosure Control): a
// suppressed pair returns an empty shell and its person is simply absent from the
// reveal — the printed output never names who opted out of what, or why.
const suppressed = scorePair(people[0], people[5], 'romantic');
console.log(`suppressed pair (romantic): carries no data — eligible=${suppressed.eligible} rank=${f(suppressed.rank)} drivers=${suppressed.drivers.length} flags=${Object.keys(suppressed.flags).length}`);
