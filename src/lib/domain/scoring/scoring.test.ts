/**
 * scoring.test.ts — property tests for src/lib/domain/scoring/ (issue #7).
 *
 * Bayesian MAP scoring of a Thurstonian choice model with fixed, authored
 * item parameters (AUDIT.md S8) — `estimateLatents(responses)` turns the 15
 * block responses into one posterior per pillar, `map-luce-v1`.
 *
 * Zero runtime dependencies, plain assertions, erasable-types-only syntax,
 * in the style of src/lib/domain/matching/engine.test.ts. Every respondent
 * is simulated in-test from `mulberry32(seed)` with the seed written in the
 * AC, so a failure reproduces from the test name alone.
 *
 * Acceptance criteria covered (issue #7):
 *   AC-1  determinism + shape: same input, identical object; mean = Φ(theta)
 *   AC-2  levels recovered: r(true, est) > 0.80 per pillar, sum r > 0.85
 *   AC-3  all-positive keying loses levels (AUDIT F1): sum of thetas ≈ 0
 *   AC-4  fewer responses → wider posterior: seTheta(5) > seTheta(15)
 *   AC-5  most-only responses still score; least widens nothing
 *   AC-8  safety: no NaN / infinite estimate, mean in [0, 1], se > 0, |θ| ≤ 4
 *
 * AC-1..AC-5 are skipped until the estimator exists. AC-8 runs today.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bandOf, normCdf } from "../matching/engine.ts";
import type { Pillar } from "../quiz/instrument.ts";
import { INSTRUMENT, PILLARS } from "../quiz/instrument.ts";
import type { BlockResponse, OptionKey } from "../quiz/response.ts";
import { estimateLatents, SCORER_VERSION } from "./estimate.ts";
import { ITEM_PARAMETERS, itemParametersOf } from "./items.ts";
import { drawTheta, mulberry32, simulateRespondent } from "./simulate.ts";

/** Pearson r. */
function correlation(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** No clock in the fixtures either — the epoch is as good as any instant. */
const ANSWERED_AT = new Date(0);

/**
 * The respondents every AC shares, drawn from mulberry32(42).
 *
 * One stream, full 15-block most+least answers. AC-4 and AC-5 then TRUNCATE or
 * STRIP these same answers rather than re-simulating: a second `mulberry32(42)`
 * run with different options consumes the stream at a different rate, so
 * `short[i]` would be a different person than `full[i]` and the comparison
 * would measure the draw, not the information.
 */
function cohort(size: number) {
  const rng = mulberry32(42);
  const people: {
    theta: Record<Pillar, number>;
    responses: BlockResponse[];
  }[] = [];
  for (let i = 0; i < size; i++) {
    const theta = drawTheta(rng);
    people.push({
      theta,
      responses: simulateRespondent(theta, ITEM_PARAMETERS, rng, {
        answeredAt: ANSWERED_AT,
      }),
    });
  }
  return people;
}

/** The same answers with the "least" pick discarded (the single-pick fallback). */
function withoutLeast(responses: readonly BlockResponse[]): BlockResponse[] {
  return responses.map((r) => ({ ...r, leastKey: null }));
}

/** An all-positive copy of the shipped form — the AUDIT F1 counterfactual. */
const ALL_POSITIVE = itemParametersOf({
  ...INSTRUMENT,
  blocks: INSTRUMENT.blocks.map((block) => ({
    ...block,
    options: block.options.map((option) => ({
      ...option,
      keyed: "positive" as const,
    })),
  })),
});

describe("estimateLatents", () => {
  it("AC-1 · scores the same 15 responses to the identical object: map-luce-v1, four estimates, mean = Φ(theta)", () => {
    const [person] = cohort(1);
    expect(person.responses).toHaveLength(15);

    const first = estimateLatents(person.responses);
    const second = estimateLatents(person.responses);

    expect(first.scorerVersion).toBe(SCORER_VERSION);
    expect(SCORER_VERSION).toBe("map-luce-v1");
    expect(Object.keys(first.estimates).sort()).toEqual([...PILLARS].sort());

    // Determinism is the point: no clock, no randomness, one convex optimum.
    expect(second).toEqual(first);

    // The mapping the engine consumes, on the engine's own normCdf.
    for (const pillar of PILLARS) {
      const e = first.estimates[pillar];
      expect(e.mean).toBeCloseTo(normCdf(e.theta, 0, 1), 12);
      expect(e.seTheta).toBeGreaterThan(0);
    }
  });

  it("AC-2 · recovers levels over 200 respondents from mulberry32(42): r > 0.80 per pillar, r(sum) > 0.85", () => {
    const people = cohort(200);
    const truth: Record<string, number[]> = {};
    const estimated: Record<string, number[]> = {};
    for (const pillar of PILLARS) {
      truth[pillar] = [];
      estimated[pillar] = [];
    }
    const trueSums: number[] = [];
    const estimatedSums: number[] = [];

    for (const person of people) {
      const out = estimateLatents(person.responses);
      let trueSum = 0;
      let estimatedSum = 0;
      for (const pillar of PILLARS) {
        truth[pillar].push(person.theta[pillar]);
        estimated[pillar].push(out.estimates[pillar].theta);
        trueSum += person.theta[pillar];
        estimatedSum += out.estimates[pillar].theta;
      }
      trueSums.push(trueSum);
      estimatedSums.push(estimatedSum);
    }

    for (const pillar of PILLARS) {
      const r = correlation(truth[pillar], estimated[pillar]);
      expect(r, `r(${pillar}) = ${r.toFixed(3)}`).toBeGreaterThan(0.8);
    }
    const rSum = correlation(trueSums, estimatedSums);
    expect(rSum, `r(sum) = ${rSum.toFixed(3)}`).toBeGreaterThan(0.85);
  });

  it("AC-3 · all-positive keying pins every respondent's theta sum to zero while contrasts survive (AUDIT F1)", () => {
    const people = cohort(50);
    const trueSums: number[] = [];
    const estimatedSums: number[] = [];
    const truth: number[] = [];
    const contrasts: number[] = [];

    for (const person of people) {
      const out = estimateLatents(person.responses, ALL_POSITIVE);
      let trueSum = 0;
      let estimatedSum = 0;
      for (const pillar of PILLARS) {
        trueSum += person.theta[pillar];
        estimatedSum += out.estimates[pillar].theta;
      }
      trueSums.push(trueSum);
      estimatedSums.push(estimatedSum);

      // A contrast: regulation minus the respondent's own mean across pillars.
      const mean = estimatedSum / PILLARS.length;
      const trueMean = trueSum / PILLARS.length;
      contrasts.push(out.estimates.regulation.theta - mean);
      truth.push(person.theta.regulation - trueMean);

      // Softmax is invariant to a constant added to every utility, so with no
      // reversed option the sum direction is invisible to the data and the
      // prior alone decides it. Not "small" — zero.
      expect(
        Math.abs(estimatedSum),
        "|sum theta| under all-positive keying"
      ).toBeLessThan(1e-6);
    }

    // Level information is gone...
    const rSum = correlation(trueSums, estimatedSums);
    expect(
      Math.abs(rSum),
      `r(sum) = ${rSum.toFixed(3)} must be ~0`
    ).toBeLessThan(0.2);
    // ...while within-person contrasts still measure something, which is why
    // an all-positive form looks like it works until you compare people.
    const rContrast = correlation(truth, contrasts);
    expect(rContrast, `r(contrast) = ${rContrast.toFixed(3)}`).toBeGreaterThan(
      0.6
    );
  });

  it("AC-4 · scoring positions 1..5 instead of all 15 widens seTheta on every pillar for every respondent", () => {
    const people = cohort(50);
    for (let i = 0; i < people.length; i++) {
      const wide = estimateLatents(people[i].responses.slice(0, 5));
      const narrow = estimateLatents(people[i].responses);
      for (const pillar of PILLARS) {
        expect(
          wide.estimates[pillar].seTheta,
          `respondent ${i} ${pillar}: 5 blocks must be wider than 15`
        ).toBeGreaterThan(narrow.estimates[pillar].seTheta);
      }
    }
  });

  it("AC-5 · most-only responses still yield four finite estimates, wider than most+least for 90 of 100", () => {
    const people = cohort(100);
    let wider = 0;
    for (let i = 0; i < people.length; i++) {
      const stripped = withoutLeast(people[i].responses);
      const withLeast = estimateLatents(people[i].responses);
      const without = estimateLatents(stripped);
      expect(stripped.every((r) => r.leastKey === null)).toBe(true);

      let allWider = true;
      for (const pillar of PILLARS) {
        const e = without.estimates[pillar];
        expect(Number.isFinite(e.theta)).toBe(true);
        expect(Number.isFinite(e.seTheta)).toBe(true);
        if (e.seTheta <= withLeast.estimates[pillar].seTheta) allWider = false;
      }
      if (allWider) wider++;
    }
    expect(
      wider,
      `${wider}/100 most-only respondents scored wider`
    ).toBeGreaterThanOrEqual(90);
  });

  it("rejects a malformed response set naming the position, before scoring any of it", () => {
    const [person] = cohort(1);
    const past = [
      ...person.responses,
      { ...person.responses[0], position: 16 },
    ];
    expect(() => estimateLatents(past)).toThrow(/16/);
    const duplicated = [...person.responses, { ...person.responses[2] }];
    expect(() => estimateLatents(duplicated)).toThrow(/duplicate.*3/);
  });

  // -------------------------------------------------------------------------
  // Regressions from the adversarial review of this module. Each one is a real
  // input that previously produced a plausible-looking wrong answer.
  // -------------------------------------------------------------------------

  it("rejects an option key outside a..d instead of silently scoring the prior", () => {
    const [person] = cohort(1);
    // Impossible under the TS types and under quiz_responses' check
    // constraints — but an adapter that skips validation used to get a
    // confident theta = 0 out of this, with seTheta NARROWER than the prior,
    // i.e. the nonsense response appeared to add information.
    const badMost = [{ ...person.responses[0], mostKey: "e" as OptionKey }];
    expect(() => estimateLatents(badMost)).toThrow(/mostKey.*"e".*a\.\.d/);

    const badLeast = [{ ...person.responses[0], leastKey: "z" as OptionKey }];
    expect(() => estimateLatents(badLeast)).toThrow(/leastKey.*"z".*a\.\.d/);

    const missing = [
      { ...person.responses[0], mostKey: undefined as unknown as OptionKey },
    ];
    expect(() => estimateLatents(missing)).toThrow(/mostKey/);

    // A null leastKey is the legitimate single-pick fallback, not an error.
    expect(() =>
      estimateLatents([{ ...person.responses[0], leastKey: null }])
    ).not.toThrow();
  });

  it("rejects an item set carrying the same position twice", () => {
    const [person] = cohort(1);
    const duplicated = [
      ...ITEM_PARAMETERS,
      { ...ITEM_PARAMETERS[1], position: 1 },
    ];
    // Last-wins would score block 1 against block 2's options, silently.
    expect(() => estimateLatents(person.responses, duplicated)).toThrow(
      /position 1 twice/
    );
  });

  it("scores the same answers identically whatever order they arrive in", () => {
    const [person] = cohort(1);
    const reversed = [...person.responses].reverse();
    // Float addition is not associative, so the objective must be summed in a
    // fixed order or two orderings differ in the last ulp.
    expect(estimateLatents(reversed)).toEqual(
      estimateLatents(person.responses)
    );
  });

  it("reports theta, seTheta, mean and se at the same point when the clamp binds", () => {
    // Unreachable with the shipped form (an adversarial respondent tops out
    // near |theta| = 2.5), so drive it with injected items: put a large
    // NEGATIVE intercept on the very option the respondent then always picks.
    // Only an enormous theta can explain choosing it anyway, so the optimum
    // runs far past THETA_LIMIT. (Penalising the OTHER options instead makes
    // the choice uninformative and leaves theta at the prior — which is how an
    // earlier version of this test managed to assert nothing at all.)
    // Only the blocks where regulation is POSITIVELY keyed — in the others it
    // is the reversed option, and picking it would push theta the other way.
    const skewed = ITEM_PARAMETERS.filter((block) =>
      block.options.some((o) => o.pillar === "regulation" && o.sign === 1)
    ).map((block) => ({
      ...block,
      options: block.options.map((o) => ({
        ...o,
        intercept: o.pillar === "regulation" && o.sign === 1 ? -50 : 0,
      })),
    }));
    expect(skewed.length).toBeGreaterThan(0);

    const responses: BlockResponse[] = skewed.map((block) => {
      const target = block.options.find(
        (o) => o.pillar === "regulation" && o.sign === 1
      );
      if (target === undefined)
        throw new Error("filtered blocks must have one");
      return {
        participantId: "clamped",
        position: block.position,
        mostKey: target.key,
        leastKey: null,
        shownOrder: "abcd",
        answeredAt: ANSWERED_AT,
      };
    });

    const out = estimateLatents(responses, skewed);
    const e = out.estimates.regulation;
    // The test is worthless unless the clamp actually binds.
    expect(Math.abs(e.theta)).toBe(4);
    // seTheta must be the curvature where theta actually is. At the clamp the
    // likelihood is saturated, so the curvature is the prior's and seTheta ~ 1;
    // taking it at the unclamped optimum gave the same number for a different
    // reason and left the pair mutually inconsistent.
    expect(Number.isFinite(e.seTheta)).toBe(true);
    expect(e.se).toBeCloseTo(
      Math.max(
        0.04,
        (Math.exp((-e.theta * e.theta) / 2) / Math.sqrt(2 * Math.PI)) *
          e.seTheta
      ),
      12
    );
    expect(e.mean).toBeCloseTo(normCdf(e.theta, 0, 1), 12);
  });

  it("scores an empty response set to the prior: theta 0, mean .5", () => {
    const out = estimateLatents([]);
    for (const pillar of PILLARS) {
      expect(out.estimates[pillar].theta).toBeCloseTo(0, 12);
      // normCdf uses an erf approximation, so 0.5 lands within ~5e-10.
      expect(out.estimates[pillar].mean).toBeCloseTo(0.5, 8);
      expect(out.estimates[pillar].seTheta).toBeCloseTo(1, 6);
    }
  });
});

describe("safety invariants", () => {
  // ---------------------------------------------------------------------------
  // Vacuous-today harness
  // ---------------------------------------------------------------------------
  //
  // The directory this file lives in. Before the estimator lands it holds
  // nothing but this test, so `scoringSources()` is empty and the source
  // scan below is vacuous — it stays true as each module arrives.

  const SCORING_DIR = new URL("./", import.meta.url);

  /** Non-test sources under src/lib/domain/scoring/, or [] before any exist. */
  function scoringSources(): { name: string; text: string }[] {
    if (!existsSync(SCORING_DIR)) return [];
    return readdirSync(SCORING_DIR)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => ({
        name,
        text: readFileSync(new URL(name, SCORING_DIR), "utf8"),
      }));
  }

  /** Comments cannot call a clock; drop them before matching. */
  function withoutComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  /** The shape of one ScoredLatent as estimate.ts will return it. */
  interface ScoredLatentLike {
    theta: number;
    seTheta: number;
    mean: number;
    se: number;
  }

  /** Standard-normal density φ(θ) — the delta-method factor for se. */
  function phi(theta: number): number {
    return Math.exp((-theta * theta) / 2) / Math.sqrt(2 * Math.PI);
  }

  /** AC-8's "then", applied to one estimate. Kept verbatim when the real
   *  estimator lands — only the source of the estimates changes. */
  function expectWellFormed(e: ScoredLatentLike, label: string): void {
    expect(Number.isFinite(e.theta), `${label}: theta=${e.theta}`).toBe(true);
    expect(Math.abs(e.theta), `${label}: |theta|`).toBeLessThanOrEqual(4);
    expect(Number.isFinite(e.mean), `${label}: mean=${e.mean}`).toBe(true);
    expect(e.mean, `${label}: mean`).toBeGreaterThanOrEqual(0);
    expect(e.mean, `${label}: mean`).toBeLessThanOrEqual(1);
    expect(Number.isFinite(e.se), `${label}: se=${e.se}`).toBe(true);
    expect(e.se, `${label}: se`).toBeGreaterThan(0);
  }

  // Runs today, on purpose. The likelihood layer does not exist yet, so the
  // set of estimates the scorer can return is empty and `scoredToday` is
  // vacuous. What is NOT vacuous:
  //   1. the consumer-side reason for the invariant — bandOf(NaN) is "high",
  //      so a NaN mean would rank a person on nothing (docs/domain.md §0);
  //   2. the mapping the estimator must use, mean = Φ(θ) via the engine's
  //      normCdf and se = max(SE_FLOOR, φ(θ)·seTheta) — the floor is a tail
  //      guard documented in estimate.ts, and since it only ever RAISES se the
  //      unfloored form checked on the grid below is the strict case — stays
  //      finite, inside [0, 1] and > 0 across the whole |θ| ≤ 4 range AC-8
  //      allows and every plausible seTheta (incl. the 0.45 fallback), so a
  //      bounded theta can never produce an out-of-range mean or a
  //      non-positive se;
  //   3. nothing under src/lib/domain/scoring/ reaches for Math.random or a
  //      clock, so identical responses can never score differently twice —
  //      the route by which a stray NaN would be irreproducible.
  //
  // When src/lib/domain/scoring/estimate.ts lands, `scoredToday` becomes the
  // ScoredLatents of estimateLatents over the adversarial respondent (most =
  // the block's reversed option, least = the lowest-key positive option, all
  // 15 blocks), the 200 mulberry32(42) respondents of AC-2 and their
  // 5-response truncations; `expectWellFormed` runs on each unchanged.
  it("AC-8 · no estimate is NaN or infinite: mean in [0, 1], se > 0, |theta| <= 4", () => {
    // 1. Why a non-finite estimate must be impossible, not merely unlikely.
    expect(bandOf(Number.NaN)).toBe("high");

    // 2. The Φ / delta-method mapping is well-formed over the allowed range.
    const seThetas = [0.05, 0.45, 2];
    let points = 0;
    for (let i = -80; i <= 80; i++) {
      const theta = i / 20; // -4.00 .. 4.00 in steps of 0.05
      for (const seTheta of seThetas) {
        expectWellFormed(
          {
            theta,
            seTheta,
            mean: normCdf(theta, 0, 1),
            se: phi(theta) * seTheta,
          },
          `Φ grid theta=${theta} seTheta=${seTheta}`
        );
        points++;
      }
    }
    expect(points).toBe(161 * seThetas.length);

    // 3. The scoring module is deterministic by construction.
    for (const { name, text } of scoringSources()) {
      const code = withoutComments(text);
      expect(code, `${name} calls Math.random`).not.toMatch(
        /\bMath\.random\s*\(/
      );
      expect(code, `${name} reads a clock`).not.toMatch(
        /\bDate\.now\s*\(|\bnew\s+Date\b/
      );
    }

    // 4. No longer vacuous: estimate.ts exists, so every estimate the scorer
    //    can produce on the adversarial and simulated inputs runs through
    //    `expectWellFormed` unchanged.
    const scoredToday: { label: string; estimate: ScoredLatentLike }[] = [];

    // The adversarial respondent: every "most" is the block's reversed option
    // and every "least" is its lowest-key positive one — the answer pattern
    // that drives theta hardest away from the prior in all four coordinates.
    const adversarial: BlockResponse[] = INSTRUMENT.blocks.map((block) => {
      const reversed = block.options.find((o) => o.keyed === "reversed");
      const positives = block.options
        .filter((o) => o.keyed === "positive")
        .map((o) => o.key)
        .sort();
      if (reversed === undefined)
        throw new Error(`block ${block.position}: no reversed option`);
      return {
        participantId: "adversarial",
        position: block.position,
        mostKey: reversed.key,
        leastKey: positives[0] as OptionKey,
        shownOrder: "abcd",
        answeredAt: ANSWERED_AT,
      };
    });
    for (const pillar of PILLARS) {
      scoredToday.push({
        label: `adversarial ${pillar}`,
        estimate: estimateLatents(adversarial).estimates[pillar],
      });
    }

    // The 200 respondents of AC-2, and their 5-response truncations.
    for (const [i, person] of cohort(200).entries()) {
      const full = estimateLatents(person.responses);
      const truncated = estimateLatents(person.responses.slice(0, 5));
      for (const pillar of PILLARS) {
        scoredToday.push({
          label: `r${i} ${pillar} full`,
          estimate: full.estimates[pillar],
        });
        scoredToday.push({
          label: `r${i} ${pillar} first5`,
          estimate: truncated.estimates[pillar],
        });
      }
    }

    expect(scoredToday.length).toBe(4 + 200 * 4 * 2);
    for (const { label, estimate } of scoredToday) {
      expectWellFormed(estimate, label);
    }
  });
});
