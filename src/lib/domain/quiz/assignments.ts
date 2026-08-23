/**
 * assignments.ts — the per-participant form plan.
 *
 * Normative sources:
 *   PILLARS.md  §7.2 every block loads all four latents · §8 rule 1 mixed keying
 *   AUDIT.md    S8 fixed *authored* item parameters · F1 reversed keying
 *
 * A generated form is only comparable to another generated form because the
 * *structure* is identical, not because the items are. The Thurstonian estimator
 * uses authored item parameters (AUDIT.md S8) rather than parameters calibrated
 * from responses, so the likelihood contribution of a block depends on which
 * pillar was chosen and how it was keyed — never on what the scenario said. Two
 * participants answering completely different scenarios are therefore scored on
 * one common metric, provided every block keeps:
 *
 *   · four options, one per pillar, each pillar exactly once
 *   · exactly one reversed-keyed option, on that position's focus pillar
 *   · the same focus-pillar rotation across the 15 positions (4/4/4/3)
 *
 * So this module fixes all of that and lets only the *flavour* vary: which
 * everyday setting each position is in, and which kind of twist it carries.
 * `validateBlock()` in `instrument.ts` is the enforcement; this is the plan
 * handed to the author.
 *
 * Contract: pure TypeScript, zero runtime dependencies, no Math.random, no Date.
 */

import { BLOCK_COUNT, batchOf, PILLARS, type Pillar } from "./instrument.ts";
import { mulberry32, seedFrom, shuffled } from "./rng.ts";

/**
 * The rotation. Position i takes pillar i mod 4, giving 4/4/4/3 over 15 blocks
 * — regulation, politeness and reliability carry four reversed options each,
 * agency three. Identical for every participant: it is part of the metric, not
 * part of the flavour.
 */
const ROTATION: readonly Pillar[] = PILLARS;

/**
 * Everyday, non-work settings a scenario can be built in, grouped by theme.
 *
 * Work is banned outright: "stayed calm" and "wasn't urgent" become the same
 * observation under deadline pressure, which collapses Regulation into
 * Reliability (`PILLARS.md` fatal #2). Nothing here touches substances,
 * politics, religion, sex, mental health or money shame (A7/A8) — a block a
 * participant would not want screenshotted is a block that costs completions.
 *
 * Grouped because the flat list it replaces let one person draw `groceries`,
 * `supermarket-lines` and `queues` in one form — three settings, one joke. A
 * participant draws at most one domain per group, and there are exactly as
 * many groups as positions, so a full form covers every theme once.
 */
export const DOMAIN_GROUPS: Readonly<Record<string, readonly string[]>> = {
  food: ["street-food", "cooking", "recipes", "dinner-reservations"],
  animals: ["pets", "zoo-visits", "stray-animals"],
  transport: ["public-transport", "taxis", "car-trips", "bike-rides"],
  "family-gatherings": ["holiday-lunches", "family-visits", "grandparents"],
  friends: ["group-chats", "friend-reunions", "roommates"],
  home: ["laundry", "plants", "diy-repairs", "moving-house", "flat-hunting"],
  outdoors: ["picnics", "camping", "beach-day", "swimming-pools", "park-walks"],
  culture: ["movies-series", "museums", "concerts", "karaoke", "board-games"],
  shopping: ["groceries", "supermarket-lines", "queues", "gifts", "haircuts"],
  celebrations: ["birthdays", "weddings", "parties", "surprise-parties"],
  sport: ["sports-casual", "gym-classes", "pickup-football", "running-routes"],
  weather: ["rain", "heatwave", "blackout-storm"],
  technology: ["autocorrect", "smart-speakers", "video-calls", "lost-charger"],
  neighbours: ["neighbors", "building-elevator", "shared-bills"],
  travel: ["travel", "packing", "airports", "hotel-stays", "photos"],
};

/** Every domain, flat — the order is irrelevant, the shuffle decides. */
export const DOMAINS: readonly string[] = Object.values(DOMAIN_GROUPS).flat();

const GROUP_OF: ReadonlyMap<string, string> = new Map(
  Object.entries(DOMAIN_GROUPS).flatMap(([group, domains]) =>
    domains.map((domain) => [domain, group] as const)
  )
);

/** The theme a domain belongs to; undefined for a legacy domain not listed. */
export function groupOf(domain: string): string | undefined {
  return GROUP_OF.get(domain);
}

/**
 * The kinds of twist a scenario can turn on. One is assigned per position so
 * the model is *told* what kind to write rather than asked to vary, and the
 * five of a batch are always five different kinds. Described abstractly on
 * purpose: a concrete example in the prompt becomes the scenario the model
 * writes, for everyone.
 */
export const TWIST_KINDS: readonly string[] = [
  "an object that has no business being there",
  "an animal or creature behaving in a way it cannot",
  "a coincidence nobody could have planned",
  "a small thing that escalates past anyone's control",
  "someone or something mistaken for someone or something else",
  "a rule everyone present is following that nobody remembers agreeing to",
  "two things swapped or mixed up with each other",
  "a message or announcement landing at exactly the wrong moment",
];

const PER_BATCH = BLOCK_COUNT / 3;

export interface Assignment {
  /** 1..15. */
  position: number;
  /** 1..3. */
  batch: number;
  /** The pillar whose low pole must be the reversed-keyed option. */
  focusPillar: Pillar;
  /** Scenario flavour only — never reaches the scoring model. */
  domain: string;
  /** Which kind of twist the scenario turns on — flavour, like `domain`. */
  twistKind: string;
}

/**
 * The seeded draw behind a participant's plan: the domain shuffle and, from
 * the same stream, five distinct twist kinds per batch. One function so every
 * caller consumes the stream in the same order — a plan that read the rng
 * differently depending on which batch was asked for would not be a plan.
 */
function draw(participantId: string) {
  const random = mulberry32(seedFrom(`assignments:${participantId}`));
  const domainOrder = shuffled(DOMAINS, random);
  const twistsByBatch = [1, 2, 3].map(() =>
    shuffled(TWIST_KINDS, random).slice(0, PER_BATCH)
  );
  return { domainOrder, twistsByBatch };
}

/** The first `count` domains of `order` with no two in the same group. */
function pickDisjoint(order: readonly string[], count: number): string[] {
  const picks: string[] = [];
  const groups = new Set<string>();
  for (const domain of order) {
    if (picks.length === count) break;
    const group = groupOf(domain);
    if (group && groups.has(group)) continue;
    picks.push(domain);
    if (group) groups.add(group);
  }
  return picks;
}

/**
 * The 15 assignments for one participant, deterministic in `participantId`.
 *
 * Deterministic so a retried generation reproduces the same plan: without it,
 * a failed batch 2 could be regenerated onto domains batch 1 already used.
 */
export function assignmentsFor(participantId: string): Assignment[] {
  const { domainOrder, twistsByBatch } = draw(participantId);
  const domains = pickDisjoint(domainOrder, BLOCK_COUNT);

  return Array.from({ length: BLOCK_COUNT }, (_, i) => {
    const position = i + 1;
    const batch = batchOf(position);
    return {
      position,
      batch,
      focusPillar: ROTATION[i % ROTATION.length],
      domain: domains[i],
      twistKind: twistsByBatch[batch - 1][i % PER_BATCH],
    };
  });
}

/**
 * The five assignments of one batch (1, 2 or 3).
 *
 * `storedDomains` are the domains already written for this participant in
 * other batches. They are usually the plan's own and change nothing — but a
 * batch 1 adopted from the room's pool was planned for a different seed, so
 * the plan for batch 2 may land on a setting, or a theme, the person has
 * already read. A colliding position takes the next domain from the same
 * seeded shuffle whose theme is still free; the plan stays deterministic
 * given the same stored rows, which is what a retry needs.
 */
export function assignmentsForBatch(
  participantId: string,
  batch: number,
  storedDomains: readonly string[] = []
): Assignment[] {
  const own = assignmentsFor(participantId).filter((a) => a.batch === batch);
  if (storedDomains.length === 0) return own;

  const { domainOrder } = draw(participantId);
  const usedDomains = new Set(storedDomains);
  const usedGroups = new Set<string>();
  for (const domain of storedDomains) {
    const group = groupOf(domain);
    if (group) usedGroups.add(group);
  }

  const free = (domain: string) => {
    const group = groupOf(domain);
    return !usedDomains.has(domain) && !(group && usedGroups.has(group));
  };
  const take = (domain: string) => {
    usedDomains.add(domain);
    const group = groupOf(domain);
    if (group) usedGroups.add(group);
    return domain;
  };

  return own.map((assignment) => {
    if (free(assignment.domain)) {
      return { ...assignment, domain: take(assignment.domain) };
    }
    const substitute =
      domainOrder.find(free) ??
      // Every theme taken: any unseen setting beats a repeated one.
      domainOrder.find((domain) => !usedDomains.has(domain)) ??
      assignment.domain;
    return { ...assignment, domain: take(substitute) };
  });
}
