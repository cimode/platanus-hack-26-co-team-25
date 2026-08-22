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
 * everyday domain each position is set in. `validateBlock()` in `instrument.ts`
 * is the enforcement; this is the plan handed to the author.
 *
 * Contract: pure TypeScript, zero runtime dependencies, no Math.random, no Date.
 */

import { BLOCK_COUNT, batchOf, type Pillar, PILLARS } from "./instrument.ts";
import { mulberry32, seedFrom, shuffled } from "./rng.ts";

/**
 * The rotation. Position i takes pillar i mod 4, giving 4/4/4/3 over 15 blocks
 * — regulation, politeness and reliability carry four reversed options each,
 * agency three. Identical for every participant: it is part of the metric, not
 * part of the flavour.
 */
const ROTATION: readonly Pillar[] = PILLARS;

/**
 * Everyday, non-work settings a scenario can be built in.
 *
 * Work is banned outright: "stayed calm" and "wasn't urgent" become the same
 * observation under deadline pressure, which collapses Regulation into
 * Reliability (`PILLARS.md` fatal #2). Nothing here touches substances,
 * politics, religion, sex, mental health or money shame (A7/A8) — a block a
 * participant would not want screenshotted is a block that costs completions.
 *
 * Deliberately much longer than 15 so two participants rarely share a full set.
 */
export const DOMAINS: readonly string[] = [
  "food",
  "pets",
  "travel",
  "friends",
  "family",
  "parties",
  "neighbors",
  "groceries",
  "cooking",
  "movies-series",
  "gifts",
  "roommates",
  "sports-casual",
  "public-transport",
  "weekend-plans",
  "beach-day",
  "birthdays",
  "board-games",
  "camping",
  "car-trips",
  "concerts",
  "dinner-reservations",
  "diy-repairs",
  "flat-hunting",
  "group-chats",
  "haircuts",
  "holiday-lunches",
  "karaoke",
  "laundry",
  "moving-house",
  "museums",
  "packing",
  "photos",
  "picnics",
  "plants",
  "queues",
  "rain",
  "recipes",
  "shared-bills",
  "street-food",
  "supermarket-lines",
  "swimming-pools",
  "taxis",
  "weddings",
  "zoo-visits",
];

export interface Assignment {
  /** 1..15. */
  position: number;
  /** 1..3. */
  batch: number;
  /** The pillar whose low pole must be the reversed-keyed option. */
  focusPillar: Pillar;
  /** Scenario flavour only — never reaches the scoring model. */
  domain: string;
}

/**
 * The 15 assignments for one participant, deterministic in `participantId`.
 *
 * Deterministic so a retried generation reproduces the same plan: without it,
 * a failed batch 2 could be regenerated onto domains batch 1 already used.
 */
export function assignmentsFor(participantId: string): Assignment[] {
  const random = mulberry32(seedFrom(`assignments:${participantId}`));
  const domains = shuffled(DOMAINS, random).slice(0, BLOCK_COUNT);

  return Array.from({ length: BLOCK_COUNT }, (_, i) => ({
    position: i + 1,
    batch: batchOf(i + 1),
    focusPillar: ROTATION[i % ROTATION.length],
    domain: domains[i],
  }));
}

/** The five assignments of one batch (1, 2 or 3). */
export function assignmentsForBatch(
  participantId: string,
  batch: number
): Assignment[] {
  return assignmentsFor(participantId).filter((a) => a.batch === batch);
}
