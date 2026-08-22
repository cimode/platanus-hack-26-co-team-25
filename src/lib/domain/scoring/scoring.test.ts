/**
 * scoring.test.ts — property tests for src/lib/domain/scoring/ (issue #7).
 *
 * Bayesian MAP scoring of a Thurstonian choice model with fixed, authored
 * item parameters (AUDIT.md S8) — `estimateLatents(responses, items)` turns
 * up to 15 block responses into one posterior per pillar, `map-luce-v1`.
 *
 * Under docs/domain.md D16 every participant answers their own generated
 * form, so `items` is never a constant: it is `itemParametersOf(blocks)` over
 * that participant's stored blocks, a pure projection of each option's
 * `pillar` and `keyed` — scenario text is never read. What every form shares
 * is the structure — 15 positions, the 4/4/4/3 focus-pillar rotation of
 * `assignmentsFor`, four pillars once each, one reversed option on the focus
 * pillar — and that is what these tests simulate over: respondent n answers
 * `structuralBlocksFor("participant-" + n)`, a different key↔pillar layout
 * and domain set per person, the same structure. Levels are recovered on one
 * common metric across 200 different forms because the likelihood reads
 * pillar and keying and never text (PILLARS.md §7.2).
 *
 * Zero runtime dependencies, plain assertions, erasable-types-only syntax,
 * in the style of src/lib/domain/matching/engine.test.ts. Every respondent
 * is simulated in-test from `mulberry32(seed)` with the seed written in the
 * AC, so a failure reproduces from the test name alone.
 *
 * Acceptance criteria covered (issue #7):
 *   AC-1  determinism + shape: same input, identical object; mean = Φ(theta)
 *   AC-2  levels recovered across 200 forms: r > 0.80 per pillar, r(sum) > 0.85
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
import type { BlockItems } from "./items.ts";
import { itemParametersOfBlocks } from "./items.ts";
import {
  drawTheta,
  mulberry32,
  simulateRespondent,
  structuralBlocksFor,
} from "./simulate.ts";

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

interface Respondent {
  theta: Record<Pillar, number>;
  blocks: ReturnType<typeof structuralBlocksFor>;
  items: BlockItems[];
  responses: BlockResponse[];
}

/**
 * The respondents every AC shares, drawn from mulberry32(42).
 *
 * Respondent n answers `structuralBlocksFor("participant-" + n)` — their own
 * key↔pillar layout and domain set, the same structure as everyone else's
 * (D16) — and is scored against THEIR OWN items. That is the point: levels
 * come back on one common metric across 200 different forms because the
 * likelihood reads pillar and keying and never text.
 *
 * One RNG stream, full 15-block most+least answers. AC-4 and AC-5 TRUNCATE or
 * STRIP these same answers rather than re-simulating: a second mulberry32(42)
 * run with different options consumes the stream at a different rate, so
 * `short[i]` would be a different person than `full[i]` and the comparison
 * would measure the draw, not the information.
 */
function cohort(size: number): Respondent[] {
  const rng = mulberry32(42);
  const people: Respondent[] = [];
  for (let i = 0; i < size; i++) {
    const blocks = structuralBlocksFor(`participant-${i + 1}`);
    const items = itemParametersOfBlocks(blocks);
    const theta = drawTheta(rng);
    people.push({
      theta,
      blocks,
      items,
      responses: simulateRespondent(theta, items, rng, {
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

/** One respondent's own form, every option positively keyed — the F1 counterfactual. */
function allPositive(blocks: Respondent["blocks"]): BlockItems[] {
  return itemParametersOfBlocks(
    blocks.map((block) => ({
      ...block,
      options: block.options.map((o) => ({ ...o, keyed: "positive" as const })),
    }))
  );
}

describe("estimateLatents", () => {
  it("AC-1 · scores 15 responses on the form structuralBlocksFor(participant-1) twice to the identical object: map-luce-v1, four estimates, mean = Φ(theta)", () => {
    const [person] = cohort(1);
    expect(person.responses).toHaveLength(15);

    const first = estimateLatents(person.responses, person.items);
    const second = estimateLatents(person.responses, person.items);

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

  it("AC-2 · recovers levels over 200 respondents, each on their own structuralBlocksFor form, from mulberry32(42): r > 0.80 per pillar, r(sum) > 0.85", () => {
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
      const out = estimateLatents(person.responses, person.items);
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

  it("AC-3 · all-positive keying of each respondent's own blocks pins the theta sum to zero while contrasts survive (AUDIT F1)", () => {
    const people = cohort(50);
    const trueSums: number[] = [];
    const estimatedSums: number[] = [];
    const truth: number[] = [];
    const contrasts: number[] = [];

    for (const person of people) {
      const out = estimateLatents(person.responses, allPositive(person.blocks));
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

  it("AC-4 · scoring positions 1..5 instead of all 15 against the same items widens seTheta on every pillar for every respondent", () => {
    const people = cohort(50);
    for (let i = 0; i < people.length; i++) {
      const wide = estimateLatents(
        people[i].responses.slice(0, 5),
        people[i].items
      );
      const narrow = estimateLatents(people[i].responses, people[i].items);
      for (const pillar of PILLARS) {
        expect(
          wide.estimates[pillar].seTheta,
          `respondent ${i} ${pillar}: 5 blocks must be wider than 15`
        ).toBeGreaterThan(narrow.estimates[pillar].seTheta);
      }
    }
  });

  it("AC-5 · most-only responses against the respondent's own items still yield four finite estimates, wider than most+least for 90 of 100", () => {
    const people = cohort(100);
    let wider = 0;
    for (let i = 0; i < people.length; i++) {
      const stripped = withoutLeast(people[i].responses);
      const withLeast = estimateLatents(people[i].responses, people[i].items);
      const without = estimateLatents(stripped, people[i].items);
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
    expect(() => estimateLatents(past, person.items)).toThrow(/16/);
    const duplicated = [...person.responses, { ...person.responses[2] }];
    expect(() => estimateLatents(duplicated, person.items)).toThrow(
      /duplicate.*3/
    );
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
    expect(() => estimateLatents(badMost, person.items)).toThrow(
      /mostKey.*"e".*a\.\.d/
    );

    const badLeast = [{ ...person.responses[0], leastKey: "z" as OptionKey }];
    expect(() => estimateLatents(badLeast, person.items)).toThrow(
      /leastKey.*"z".*a\.\.d/
    );

    const missing = [
      { ...person.responses[0], mostKey: undefined as unknown as OptionKey },
    ];
    expect(() => estimateLatents(missing, person.items)).toThrow(/mostKey/);

    // A null leastKey is the legitimate single-pick fallback, not an error.
    expect(() =>
      estimateLatents(
        [{ ...person.responses[0], leastKey: null }],
        person.items
      )
    ).not.toThrow();
  });

  it("rejects an item set carrying the same position twice", () => {
    const [person] = cohort(1);
    const duplicated = [...person.items, { ...person.items[1], position: 1 }];
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
    expect(estimateLatents(reversed, person.items)).toEqual(
      estimateLatents(person.responses, person.items)
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
    const [person] = cohort(1);
    const skewed = person.items
      .filter((block) =>
        block.options.some((o) => o.pillar === "regulation" && o.sign === 1)
      )
      .map((block) => ({
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

  it("D16: the same answers score differently against a form with the pillars permuted across keys", () => {
    // Under D16 every participant gets their own generated blocks. The
    // STRUCTURE is fixed — four pillars once each, one reversed on the focus
    // pillar — but `validateBlock` does not pin which KEY carries which pillar,
    // and the authoring model picks that per block. This test is why `items` is
    // a required argument: scoring someone against a form they did not answer
    // is not a crash, it is a confident wrong answer.
    const [person] = cohort(1);

    // Rotate the pillars one key to the left, keeping the structure legal.
    const permuted = person.items.map((block) => ({
      ...block,
      options: block.options.map((option, i) => ({
        ...option,
        pillar: block.options[(i + 1) % block.options.length].pillar,
        sign: block.options[(i + 1) % block.options.length].sign,
      })),
    }));

    const right = estimateLatents(person.responses, person.items);
    const wrong = estimateLatents(person.responses, permuted);

    // Both look perfectly healthy. Only one of them is about this person.
    for (const pillar of PILLARS) {
      expect(Number.isFinite(wrong.estimates[pillar].theta)).toBe(true);
      expect(wrong.estimates[pillar].se).toBeGreaterThan(0);
    }
    const moved = PILLARS.filter(
      (p) => Math.abs(right.estimates[p].theta - wrong.estimates[p].theta) > 0.1
    );
    expect(
      moved.length,
      "a permuted form must not score the same"
    ).toBeGreaterThan(0);
  });

  it("scores an empty response set to the prior: theta 0, mean .5", () => {
    const out = estimateLatents([], cohort(1)[0].items);
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
  // ScoredLatents of estimateLatents over the adversarial respondent on
  // structuralBlocksFor("adversary") (most = the block's single reversed
  // option, least = the lowest-key positive option, all 15 blocks), the 200
  // mulberry32(42) respondents of AC-2 on their own forms and their
  // 5-response truncations — every one scored against itemParametersOf(their
  // own blocks), never a shared constant; `expectWellFormed` runs on each
  // unchanged.
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
    // Built on the committed fallback form, which is a valid 15-block form and
    // the one place the constant is genuinely convenient (D16 §10.1).
    const adversarialItems = itemParametersOfBlocks(INSTRUMENT.blocks);
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
        estimate: estimateLatents(adversarial, adversarialItems).estimates[
          pillar
        ],
      });
    }

    // The 200 respondents of AC-2, and their 5-response truncations.
    for (const [i, person] of cohort(200).entries()) {
      const full = estimateLatents(person.responses, person.items);
      const truncated = estimateLatents(
        person.responses.slice(0, 5),
        person.items
      );
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
