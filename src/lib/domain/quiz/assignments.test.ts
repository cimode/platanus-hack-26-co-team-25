import { describe, expect, it } from "vitest";

import {
  assignmentsFor,
  assignmentsForBatch,
  DOMAIN_GROUPS,
  DOMAINS,
  groupOf,
  TWIST_KINDS,
} from "./assignments.ts";
import { BLOCK_COUNT } from "./instrument.ts";

/**
 * The plan fixes the structure (the focus-pillar rotation) and varies only the
 * flavour (domain, twist kind). Two things are asserted beyond determinism:
 * a participant never draws two settings from one theme, and a batch planned
 * around an adopted pool set steps around what that set already used.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;

describe("assignmentsFor", () => {
  it("fixes the structure and varies only the flavour", () => {
    const plan = assignmentsFor("p-1");
    expect(plan).toHaveLength(BLOCK_COUNT);
    expect(plan.map((a) => a.position)).toEqual(
      Array.from({ length: BLOCK_COUNT }, (_, i) => i + 1)
    );

    // The rotation is part of the metric: 4/4/4/3, identical for everyone.
    const rotation = PILLARS.map(
      (p) => plan.filter((a) => a.focusPillar === p).length
    );
    expect(rotation).toEqual([4, 4, 4, 3]);
    expect(assignmentsFor("p-2").map((a) => a.focusPillar)).toEqual(
      plan.map((a) => a.focusPillar)
    );

    // Deterministic, so a retried generation reproduces the same plan.
    expect(assignmentsFor("p-1")).toEqual(plan);

    // No participant sees the same setting twice ...
    expect(new Set(plan.map((a) => a.domain)).size).toBe(BLOCK_COUNT);
    for (const a of plan) expect(DOMAINS).toContain(a.domain);

    // ... and two participants get different settings.
    expect(assignmentsFor("p-2").map((a) => a.domain)).not.toEqual(
      plan.map((a) => a.domain)
    );

    // Batches partition the form.
    expect(assignmentsForBatch("p-1", 1).map((a) => a.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(assignmentsForBatch("p-1", 3).map((a) => a.position)).toEqual([
      11, 12, 13, 14, 15,
    ]);
  });

  it("draws at most one domain per theme group, covering every group", () => {
    const groups = Object.keys(DOMAIN_GROUPS);
    expect(groups).toHaveLength(BLOCK_COUNT);
    // The groups partition the domains: no domain in two groups.
    expect(new Set(DOMAINS).size).toBe(DOMAINS.length);

    for (const id of ["p-1", "p-2", "pool:abc", "11111111-1111-4111-8111-1"]) {
      const drawn = assignmentsFor(id).map((a) => groupOf(a.domain));
      expect(new Set(drawn).size).toBe(BLOCK_COUNT);
    }
  });

  it("tells each position its twist kind, five different kinds per batch", () => {
    for (const id of ["p-1", "p-2", "p-3"]) {
      for (const batch of [1, 2, 3]) {
        const kinds = assignmentsForBatch(id, batch).map((a) => a.twistKind);
        expect(new Set(kinds).size).toBe(5);
        for (const kind of kinds) expect(TWIST_KINDS).toContain(kind);
      }
    }
  });
});

describe("assignmentsForBatch with stored domains", () => {
  it("returns the plan's own domains when nothing stored collides", () => {
    const own = assignmentsForBatch("p-1", 2);
    const stored = assignmentsForBatch("p-1", 1).map((a) => a.domain);
    expect(assignmentsForBatch("p-1", 2, stored)).toEqual(own);
  });

  it("substitutes a domain whose setting or theme an adopted set already used", () => {
    const own = assignmentsForBatch("p-1", 2);
    const collidingDomain = own[0].domain;
    const collidingGroup = groupOf(own[2].domain) as string;
    const sibling = DOMAIN_GROUPS[collidingGroup].find(
      (d) => d !== own[2].domain
    ) as string;
    const stored = [collidingDomain, sibling];

    const planned = assignmentsForBatch("p-1", 2, stored);

    // Structure untouched.
    expect(planned.map((a) => a.position)).toEqual(own.map((a) => a.position));
    expect(planned.map((a) => a.focusPillar)).toEqual(
      own.map((a) => a.focusPillar)
    );
    expect(planned.map((a) => a.twistKind)).toEqual(
      own.map((a) => a.twistKind)
    );

    // Neither the stored settings nor their themes appear ...
    for (const a of planned) {
      expect(stored).not.toContain(a.domain);
      expect(groupOf(a.domain)).not.toBe(collidingGroup);
    }
    // ... the positions that did not collide keep their domain ...
    expect(planned[1].domain).toBe(own[1].domain);
    // ... and the batch is still theme-disjoint and deterministic.
    expect(new Set(planned.map((a) => groupOf(a.domain))).size).toBe(5);
    expect(assignmentsForBatch("p-1", 2, stored)).toEqual(planned);
  });

  it("keeps batches 2 and 3 disjoint from a pool set planned for another seed", () => {
    const adopted = assignmentsForBatch("pool:other-seed", 1).map(
      (a) => a.domain
    );
    const second = assignmentsForBatch("p-9", 2, adopted);
    const third = assignmentsForBatch("p-9", 3, [
      ...adopted,
      ...second.map((a) => a.domain),
    ]);
    const all = [
      ...adopted,
      ...second.map((a) => a.domain),
      ...third.map((a) => a.domain),
    ];
    expect(new Set(all).size).toBe(BLOCK_COUNT);
    expect(new Set(all.map(groupOf)).size).toBe(BLOCK_COUNT);
  });
});
