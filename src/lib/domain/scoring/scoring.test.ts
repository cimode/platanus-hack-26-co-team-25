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

describe("estimateLatents", () => {
  // TODO: un-skip when estimateLatents exists.
  // Blocked on: src/lib/domain/scoring/estimate.ts (estimateLatents),
  // items.ts (itemParametersOf over the respondent's own blocks) and
  // simulate.ts (mulberry32, simulateRespondent, structuralBlocksFor).
  it.skip("AC-1 · scores 15 responses on the form structuralBlocksFor(participant-1) twice to the identical object: map-luce-v1, four estimates, mean = Φ(theta)", () => {});

  // TODO: un-skip when estimateLatents exists.
  // Blocked on: src/lib/domain/scoring/estimate.ts (estimateLatents),
  // items.ts (itemParametersOf, one ItemParameters per respondent) and
  // simulate.ts (mulberry32, simulateRespondent, structuralBlocksFor).
  it.skip("AC-2 · recovers levels over 200 respondents, each on their own structuralBlocksFor form, from mulberry32(42): r > 0.80 per pillar, r(sum) > 0.85", () => {});

  // TODO: un-skip when estimateLatents and itemParametersOf exist.
  // Blocked on: src/lib/domain/scoring/estimate.ts (estimateLatents),
  // items.ts (itemParametersOf over an all-positive copy of each
  // respondent's own blocks) and simulate.ts (mulberry32,
  // simulateRespondent, structuralBlocksFor).
  it.skip("AC-3 · all-positive keying of each respondent's own blocks pins the theta sum to zero while contrasts survive (AUDIT F1)", () => {});

  // TODO: un-skip when estimateLatents exists.
  // Blocked on: src/lib/domain/scoring/estimate.ts (estimateLatents),
  // items.ts (itemParametersOf) and simulate.ts (mulberry32,
  // simulateRespondent, structuralBlocksFor).
  it.skip("AC-4 · scoring positions 1..5 instead of all 15 against the same items widens seTheta on every pillar for every respondent", () => {});

  // TODO: un-skip when estimateLatents exists.
  // Blocked on: src/lib/domain/scoring/estimate.ts (estimateLatents),
  // items.ts (itemParametersOf) and simulate.ts (mulberry32,
  // simulateRespondent with and without least, structuralBlocksFor).
  it.skip("AC-5 · most-only responses against the respondent's own items still yield four finite estimates, wider than most+least for 90 of 100", () => {});
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
  //      normCdf and se = φ(θ)·seTheta, stays finite, inside [0, 1] and > 0
  //      across the whole |θ| ≤ 4 range AC-8 allows and every plausible
  //      seTheta (incl. the 0.45 fallback), so a bounded theta can never
  //      produce an out-of-range mean or a non-positive se;
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

    // Vacuous until estimate.ts exists — see the comment above the test.
    const scoredToday: { label: string; estimate: ScoredLatentLike }[] = [];
    for (const { label, estimate } of scoredToday) {
      expectWellFormed(estimate, label);
    }
  });
});
