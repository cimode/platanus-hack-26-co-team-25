/**
 * engine.test.ts — property tests for src/lib/domain/matching/engine.ts.
 *
 * Zero runtime dependencies, plain assertions, erasable-types-only syntax.
 * Run: npm test -- src/lib/domain/matching
 *
 * Properties covered (task contract):
 *   P1  weight vectors sum to 1.0 ±1e-9 per lens (after business Agency-off renorm)
 *   P1b published PILLARS §3 cells copied exactly (business checked under overlay)
 *   P2  symmetry: scorePair(a,b) ≈ scorePair(b,a) on rank/sim/eligible/band/flags
 *   P3  monotone: raising the weaker partner's regulation never lowers romantic sim
 *   P4  gates: wantsKids mismatch → ineligible; consent off / no photo → suppressed
 *       (excluded from rankRoom entirely, both as candidate and as subject)
 *   P5  no-difference-reward: friendship Distance max(), business capacity gap,
 *       romance life-shape kernel, chronotype under all lenses
 *   P6  determinism: identical calls give identical output
 *   P7  degraded mode: missing latents → prior 0.5/se 0.6 imputation, still ranked,
 *       weights NOT renormalized (full published weight on imputed-latent terms)
 *   P8  business Agency default OFF: off-vector sums to 1, overlay restores .05/.10,
 *       scores differ with vs without overlay
 *   P9  extras: pursueWithdraw fires at the spec threshold; bothHighAgency numeric;
 *       erf/normCdf sanity; frozen band cutoffs
 */

import { describe, it } from "vitest";
import {
  bandOf,
  erf,
  excludedFromRoom,
  type Gender,
  getWeights,
  type Lens,
  normCdf,
  type Person,
  rankRoom,
  scorePair,
  type TermName,
} from "./engine.ts";

describe("matching engine", () => {
  // ---------------------------------------------------------------------------
  // Harness
  // ---------------------------------------------------------------------------
  //
  // These were 13 property tests under a hand-rolled runner invoked as
  // `node engine.test.ts`. Living under src/**, Vitest's include glob claims the
  // file -- so the runner is now a three-line adapter onto `it` and every test
  // BODY below is unchanged. `assert` already throws, which Vitest reads as a
  // failure, and the detail string each test returns is simply discarded.
  //
  // The point of the move: `npm test` and CI now actually gate these. They did
  // not before.

  function test(name: string, fn: () => string): void {
    it(name, () => {
      fn();
    });
  }

  function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
  }

  function near(x: number, y: number, tol: number): boolean {
    return Math.abs(x - y) <= tol;
  }

  const LENSES: Lens[] = ["romantic", "business", "friendship"];
  const TERMS: TermName[] = [
    "lifeShape",
    "commonGround",
    "structural",
    "regulation",
    "distance",
    "politeness",
    "eligibility",
    "reliability",
    "agency",
  ];

  // ---------------------------------------------------------------------------
  // Person factory
  // ---------------------------------------------------------------------------

  interface MkOpts {
    reg?: number;
    pol?: number;
    rel?: number;
    agc?: number;
    se?: number;
    noLatents?: boolean;
    distanceBand?: number | "missing";
    money?: number;
    rooted?: number;
    family?: number;
    cap?: number;
    tags?: string[];
    chrono?: number;
    team?: string;
    track?: string;
    cohort?: number;
    acq?: string[];
    gender?: Gender;
    interestedIn?: Gender[];
    single?: boolean;
    ageBand?: number;
    wantsKids?: boolean;
    noRomGate?: boolean;
    noBizGate?: boolean;
    risk?: number;
    exit?: number;
    redlines?: boolean;
    consentRom?: boolean;
    consentBiz?: boolean;
    consentFri?: boolean;
    photo?: boolean;
  }

  function mk(id: string, o: MkOpts = {}): Person {
    const se = o.se ?? 0.45;
    return {
      id,
      name: id,
      latents: o.noLatents
        ? {}
        : {
            regulation: { mean: o.reg ?? 0.55, se },
            politeness: { mean: o.pol ?? 0.6, se },
            reliability: { mean: o.rel ?? 0.5, se },
            agency: { mean: o.agc ?? 0.45, se },
          },
      declared: {
        distanceBand:
          o.distanceBand === "missing" ? undefined : (o.distanceBand ?? 1),
        lifeShape: {
          moneyPosture: o.money ?? 0.5,
          rootedness: o.rooted ?? 0.5,
          familyGravity: o.family ?? 0.5,
          capacityHoursBand: o.cap ?? 2,
        },
        tags: o.tags ?? ["music", "food", "hiking"],
        chronotype: o.chrono ?? 1,
      },
      structural: {
        team: o.team,
        track: o.track ?? "sim",
        cohort: o.cohort ?? 2,
        acquaintances: o.acq ?? [],
      },
      gates: {
        romantic: o.noRomGate
          ? undefined
          : {
              interestedIn: o.interestedIn ?? ["M", "F", "NB"],
              gender: o.gender ?? "F",
              single: o.single ?? true,
              ageBand: o.ageBand ?? 1,
              wantsKids: o.wantsKids ?? true,
            },
        business: o.noBizGate
          ? undefined
          : {
              riskPosture: o.risk ?? 1,
              exitHorizon: o.exit ?? 1,
              redlinesOk: o.redlines ?? true,
            },
      },
      consent: {
        romantic: o.consentRom ?? true,
        business: o.consentBiz ?? true,
        friendship: o.consentFri ?? true,
      },
      hasPhoto: o.photo ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // P1 — weight vectors sum to 1.0 ±1e-9 per lens
  // ---------------------------------------------------------------------------

  test("P1 weight sums = 1 ±1e-9 (incl. business Agency-off renorm and overlay)", () => {
    const parts: string[] = [];
    for (const lens of LENSES) {
      const w = getWeights(lens); // business default = agency-off renormalized
      for (const which of ["rank", "sim"] as const) {
        const sum = TERMS.reduce((s, t) => s + w[which][t], 0);
        assert(near(sum, 1, 1e-9), `${lens}.${which} sums to ${sum}`);
        parts.push(`${lens}.${which}=${sum.toFixed(12)}`);
      }
    }
    const ov = getWeights("business", { agencyOverlay: true });
    for (const which of ["rank", "sim"] as const) {
      const sum = TERMS.reduce((s, t) => s + ov[which][t], 0);
      assert(near(sum, 1, 1e-9), `business overlay ${which} sums to ${sum}`);
      parts.push(`biz-overlay.${which}=${sum.toFixed(12)}`);
    }
    return parts.join("  ");
  });

  // ---------------------------------------------------------------------------
  // P1b — published PILLARS §3 cells copied exactly
  // ---------------------------------------------------------------------------

  test("P1b published PILLARS §3 cells exact (business under agencyOverlay)", () => {
    const PUB: Record<
      Lens,
      { rank: Record<TermName, number>; sim: Record<TermName, number> }
    > = {
      romantic: {
        rank: {
          lifeShape: 0.22,
          commonGround: 0.21,
          structural: 0.17,
          regulation: 0.13,
          distance: 0.08,
          politeness: 0.07,
          eligibility: 0.05,
          reliability: 0.04,
          agency: 0.03,
        },
        sim: {
          lifeShape: 0.1,
          commonGround: 0.04,
          structural: 0.02,
          regulation: 0.24,
          distance: 0.14,
          politeness: 0.13,
          eligibility: 0.2,
          reliability: 0.08,
          agency: 0.05,
        },
      },
      business: {
        rank: {
          structural: 0.24,
          lifeShape: 0.22,
          reliability: 0.16,
          commonGround: 0.1,
          eligibility: 0.1,
          politeness: 0.07,
          regulation: 0.06,
          agency: 0.05,
          distance: 0.0,
        },
        sim: {
          structural: 0.02,
          lifeShape: 0.22,
          reliability: 0.28,
          commonGround: 0.05,
          eligibility: 0.06,
          politeness: 0.15,
          regulation: 0.12,
          agency: 0.1,
          distance: 0.0,
        },
      },
      friendship: {
        rank: {
          structural: 0.3,
          commonGround: 0.28,
          lifeShape: 0.25,
          distance: 0.06,
          politeness: 0.05,
          reliability: 0.03,
          regulation: 0.02,
          agency: 0.01,
          eligibility: 0.0,
        },
        sim: {
          structural: 0.11,
          commonGround: 0.21,
          lifeShape: 0.21,
          distance: 0.26,
          politeness: 0.07,
          reliability: 0.08,
          regulation: 0.04,
          agency: 0.02,
          eligibility: 0.0,
        },
      },
    };
    let cells = 0;
    for (const lens of LENSES) {
      const w = getWeights(lens, { agencyOverlay: true }); // overlay restores published business column
      for (const which of ["rank", "sim"] as const) {
        for (const t of TERMS) {
          assert(
            w[which][t] === PUB[lens][which][t],
            `${lens}.${which}.${t} = ${w[which][t]}, expected ${PUB[lens][which][t]}`
          );
          cells++;
        }
      }
    }
    return `${cells} cells match PILLARS §3 exactly (54 published values x rank/sim)`;
  });

  // ---------------------------------------------------------------------------
  // P2 — symmetry
  // ---------------------------------------------------------------------------

  test("P2 symmetry: scorePair(a,b) ≈ scorePair(b,a) — rank/sim/eligible/band/flags", () => {
    const people: Person[] = [
      mk("s1", { team: "t1", gender: "F" }),
      mk("s2", {
        team: "t1",
        gender: "M",
        agc: 0.9,
        reg: 0.2,
        distanceBand: 3,
        tags: ["music", "gaming"],
        cohort: 3,
      }),
      mk("s3", {
        noLatents: true,
        distanceBand: "missing",
        gender: "NB",
        tags: [],
        cohort: 5,
        track: "ai",
      }),
      mk("s4", {
        gender: "M",
        pol: 0.9,
        rel: 0.9,
        cap: 0,
        chrono: 3,
        wantsKids: false,
        tags: ["food", "art"],
        acq: ["s1"],
      }),
      mk("s5", {
        gender: "F",
        agc: 0.85,
        cap: 3,
        risk: 2,
        exit: 0,
        tags: ["hiking", "food", "music", "art"],
      }),
      mk("s6", { gender: "M", consentRom: false }),
    ];
    let maxDiff = 0;
    let pairs = 0;
    for (const opts of [undefined, { agencyOverlay: true }]) {
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          for (const lens of LENSES) {
            const ab = scorePair(people[i], people[j], lens, opts);
            const ba = scorePair(people[j], people[i], lens, opts);
            assert(
              ab.eligible === ba.eligible,
              `${lens} ${people[i].id}/${people[j].id} eligible asym`
            );
            assert(ab.band === ba.band, `${lens} band asym`);
            const dR = Math.abs(ab.rank - ba.rank);
            const dS = Math.abs(ab.sim - ba.sim);
            const dPW = Math.abs(
              (ab.flags.pursueWithdraw ?? -1) - (ba.flags.pursueWithdraw ?? -1)
            );
            const dHA = Math.abs(
              (ab.flags.bothHighAgency ?? -1) - (ba.flags.bothHighAgency ?? -1)
            );
            maxDiff = Math.max(maxDiff, dR, dS, dPW, dHA);
            assert(
              dR <= 1e-12 && dS <= 1e-12 && dPW <= 1e-12 && dHA <= 1e-12,
              `${lens} ${people[i].id}/${people[j].id}: dRank=${dR} dSim=${dS} dPW=${dPW} dHA=${dHA}`
            );
            pairs++;
          }
        }
      }
    }
    return `${pairs} lens-pair comparisons (15 pairs x 3 lenses x 2 opts), max |a,b − b,a| = ${maxDiff.toExponential(2)}`;
  });

  // ---------------------------------------------------------------------------
  // P3 — monotone: raising the weaker partner's regulation never lowers romantic sim
  // ---------------------------------------------------------------------------

  test("P3 monotone: raising weaker partner regulation never lowers romantic sim", () => {
    const configs = [
      { aDist: 1, bDist: 1 }, // plain soft-min path
      { aDist: 3, bDist: 3 }, // pursueWithdraw active in both directions
      { aDist: 3, bDist: 1 }, // pursueWithdraw driven by b's regulation only
    ];
    let minDelta = Infinity;
    let points = 0;
    let firedAtLeastOnce = false;
    for (const cfg of configs) {
      const a = mk("a", { reg: 0.7, distanceBand: cfg.aDist });
      let prev = -Infinity;
      for (let step = 1; step <= 19; step++) {
        const m = step * 0.05; // 0.05 .. 0.95
        const b = mk("b", { reg: m, distanceBand: cfg.bDist, gender: "M" });
        const s = scorePair(a, b, "romantic");
        assert(s.eligible, "pair must be eligible");
        if (s.flags.pursueWithdraw !== undefined) firedAtLeastOnce = true;
        if (prev !== -Infinity) {
          minDelta = Math.min(minDelta, s.sim - prev);
          assert(
            s.sim >= prev - 1e-12,
            `sim dropped at reg=${m.toFixed(2)} cfg=${JSON.stringify(cfg)}: ${prev} -> ${s.sim}`
          );
        }
        prev = s.sim;
        points++;
      }
    }
    assert(
      firedAtLeastOnce,
      "sweep never exercised the pursueWithdraw penalty path"
    );
    return `${points} points across ${configs.length} distance configs, min step delta = ${minDelta.toExponential(3)} (>= 0; penalty path exercised)`;
  });

  // ---------------------------------------------------------------------------
  // P4 — gates
  // ---------------------------------------------------------------------------

  test("P4 gates: wantsKids mismatch fails; consent-off / no-photo excluded entirely", () => {
    // wantsKids hard gate (desire only — AUDIT S11)
    const ky = mk("ky", { gender: "F", wantsKids: true });
    const kn = mk("kn", { gender: "M", wantsKids: false });
    const kids = scorePair(ky, kn, "romantic");
    assert(!kids.eligible, "wantsKids mismatch must be ineligible");
    assert(
      (kids.reason ?? "").includes("wantsKids"),
      `reason was: ${kids.reason}`
    );
    assert(
      kids.rank === 0 && kids.drivers.length === 0,
      "ineligible pair must carry no rank/drivers"
    );

    // orientation + single gates
    const straightF = mk("of", { gender: "F", interestedIn: ["M"] });
    const straightF2 = mk("of2", { gender: "F", interestedIn: ["M"] });
    assert(
      !scorePair(straightF, straightF2, "romantic").eligible,
      "orientation gate failed to fire"
    );
    const taken = mk("tk", { gender: "M", single: false });
    assert(
      !scorePair(ky, taken, "romantic").eligible,
      "single gate failed to fire"
    );

    // business gates
    assert(
      !scorePair(mk("r0", { risk: 0 }), mk("r2", { risk: 2 }), "business")
        .eligible,
      "riskPosture gap 2 must fail"
    );
    assert(
      !scorePair(mk("e0", { exit: 0 }), mk("e2", { exit: 2 }), "business")
        .eligible,
      "exitHorizon gap 2 must fail"
    );
    assert(
      !scorePair(mk("rl", { redlines: false }), mk("rr", {}), "business")
        .eligible,
      "redlines gate failed to fire"
    );

    // suppress: consent off / no photo → excluded from rankRoom output entirely
    const room = [
      mk("sub", { gender: "F" }),
      mk("noc", { gender: "M", consentRom: false }),
      mk("nop", { gender: "M", photo: false }),
      mk("ok", { gender: "M" }),
    ];
    const rom = rankRoom(room, "sub", "romantic").map((r) => r.id);
    assert(rom.includes("ok"), "consenting person missing from ranking");
    assert(
      !rom.includes("noc"),
      "no-consent person leaked into romantic ranking"
    );
    assert(
      !rom.includes("nop"),
      "no-photo person leaked into romantic ranking"
    );
    const asSubject = rankRoom(room, "noc", "romantic");
    assert(
      asSubject.length === 0,
      "no-consent subject must rank nobody (floor suppress)"
    );
    const fri = rankRoom(room, "sub", "friendship").map((r) => r.id);
    assert(
      fri.includes("noc"),
      "noc consented to friendship — must appear there"
    );
    assert(
      !fri.includes("nop"),
      "no-photo person leaked into friendship ranking"
    );
    const excl = excludedFromRoom(room, "sub", "romantic");
    const exclNoc = excl.find((e) => e.id === "noc");
    assert(
      exclNoc?.reason.includes("consent") ?? false,
      "exclusion reason must name consent"
    );

    return (
      `wantsKids reason="${kids.reason}"; romantic ranking=[${rom.join(",")}] (noc,nop out); ` +
      `friendship=[${fri.join(",")}] (noc back in, nop still out); noc-as-subject ranks ${asSubject.length}`
    );
  });

  // ---------------------------------------------------------------------------
  // P5 — no-difference-reward
  // ---------------------------------------------------------------------------

  test("P5a business capacity gap: moving b away from a never increases rank/sim", () => {
    const a = mk("a", { cap: 2 });
    const seq = [2, 1, 0]; // gap 0 -> 1 -> 2 (away from a)
    const ranks: number[] = [];
    const sims: number[] = [];
    for (const cap of seq) {
      const s = scorePair(a, mk("b", { cap, gender: "M" }), "business");
      ranks.push(s.rank);
      sims.push(s.sim);
    }
    for (let i = 1; i < ranks.length; i++) {
      assert(
        ranks[i] < ranks[i - 1] - 1e-12,
        `rank did not strictly fall at gap ${i}: ${ranks[i - 1]} -> ${ranks[i]}`
      );
      assert(
        sims[i] < sims[i - 1] - 1e-12,
        `sim did not strictly fall at gap ${i}: ${sims[i - 1]} -> ${sims[i]}`
      );
    }
    const up = scorePair(a, mk("b", { cap: 3, gender: "M" }), "business"); // gap 1 the other way
    assert(up.rank < ranks[0] - 1e-12, "gap 1 upward must also cost rank");
    return `rank by |cap gap| 0,1,2: ${ranks.map((r) => r.toFixed(4)).join(", ")}; gap1-up=${up.rank.toFixed(4)} — strictly decreasing (steep graded penalty)`;
  });

  test("P5b friendship Distance max(): worsening b never changes score when a texts first", () => {
    // a band 1 (da = 2/3); b moves away-worse 1 -> 2 -> 3: max() must stay exactly constant.
    const a1 = mk("a", { distanceBand: 1 });
    const r1 = [1, 2, 3].map((db) =>
      scorePair(a1, mk("b", { distanceBand: db, gender: "M" }), "friendship")
    );
    for (let i = 1; i < r1.length; i++) {
      assert(
        near(r1[i].rank, r1[0].rank, 1e-15),
        `friendship rank moved: ${r1[0].rank} -> ${r1[i].rank}`
      );
      assert(
        near(r1[i].sim, r1[0].sim, 1e-15),
        `friendship sim moved: ${r1[0].sim} -> ${r1[i].sim}`
      );
    }
    // a band 0 (texter, da = 1): b anywhere — "one texter is enough", still constant.
    const a0 = mk("a", { distanceBand: 0 });
    const r0 = [0, 1, 2, 3].map((db) =>
      scorePair(a0, mk("b", { distanceBand: db, gender: "M" }), "friendship")
    );
    for (let i = 1; i < r0.length; i++) {
      assert(
        near(r0[i].rank, r0[0].rank, 1e-15),
        `texter-a rank moved: ${r0[0].rank} -> ${r0[i].rank}`
      );
    }
    return `a=band1: rank stays ${r1[0].rank.toFixed(6)} as b goes 1->3; a=band0 (texter): rank stays ${r0[0].rank.toFixed(6)} for b 0->3 — no increase from divergence, one texter is enough`;
  });

  test("P5c kernels: money (rom) and chronotype (all lenses) — moving away never increases", () => {
    const parts: string[] = [];
    // Romance money-posture gaussian kernel: strictly decreasing as b moves away.
    const am = mk("a", { money: 0.5 });
    let prevR = Infinity;
    let prevS = Infinity;
    const moneyRanks: number[] = [];
    for (const bm of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
      const s = scorePair(am, mk("b", { money: bm, gender: "M" }), "romantic");
      assert(
        s.rank <= prevR + 1e-15 && s.sim <= prevS + 1e-15,
        `romantic score rose as money diverged at ${bm}`
      );
      if (prevR !== Infinity)
        assert(
          s.rank < prevR - 1e-12,
          `gaussian kernel not strictly decreasing at ${bm}`
        );
      prevR = s.rank;
      prevS = s.sim;
      moneyRanks.push(s.rank);
    }
    parts.push(
      `rom rank vs money gap 0->0.5: ${moneyRanks[0].toFixed(4)} -> ${moneyRanks[5].toFixed(4)}`
    );
    // Chronotype divergence under every lens: never increases rank or sim.
    for (const lens of LENSES) {
      const ac = mk("a", { chrono: 1 });
      let pR = Infinity;
      let pS = Infinity;
      const vals: number[] = [];
      for (const bc of [1, 2, 3]) {
        const s = scorePair(ac, mk("b", { chrono: bc, gender: "M" }), lens);
        assert(
          s.rank <= pR + 1e-15 && s.sim <= pS + 1e-15,
          `${lens} score rose as chronotype diverged at ${bc}`
        );
        pR = s.rank;
        pS = s.sim;
        vals.push(s.rank);
      }
      parts.push(
        `${lens} rank vs chrono gap 0,1,2: ${vals.map((v) => v.toFixed(4)).join(",")}`
      );
    }
    return parts.join("  |  ");
  });

  // ---------------------------------------------------------------------------
  // P6 — determinism
  // ---------------------------------------------------------------------------

  test("P6 determinism: identical calls give byte-identical output", () => {
    const room = [
      mk("s1", { team: "t1", gender: "F" }),
      mk("s2", {
        team: "t1",
        gender: "M",
        agc: 0.9,
        reg: 0.2,
        distanceBand: 3,
        tags: ["music", "gaming"],
        cohort: 3,
      }),
      mk("s3", {
        noLatents: true,
        distanceBand: "missing",
        gender: "NB",
        tags: [],
        cohort: 5,
      }),
      mk("s4", {
        gender: "M",
        pol: 0.9,
        cap: 0,
        chrono: 3,
        wantsKids: false,
        acq: ["s1"],
      }),
      mk("s5", { gender: "F", agc: 0.85, cap: 3, risk: 2 }),
      mk("s6", { gender: "M", consentRom: false }),
    ];
    let checks = 0;
    for (const lens of LENSES) {
      for (const opts of [undefined, { agencyOverlay: true }]) {
        const r1 = JSON.stringify(rankRoom(room, "s1", lens, opts));
        const r2 = JSON.stringify(rankRoom(room, "s1", lens, opts));
        assert(r1 === r2, `rankRoom nondeterministic for ${lens}`);
        const p1 = JSON.stringify(scorePair(room[0], room[1], lens, opts));
        const p2 = JSON.stringify(scorePair(room[0], room[1], lens, opts));
        assert(p1 === p2, `scorePair nondeterministic for ${lens}`);
        checks += 2;
      }
    }
    return `${checks} repeated-call comparisons, all JSON-identical (3 lenses x {default, overlay})`;
  });

  // ---------------------------------------------------------------------------
  // P7 — degraded mode: missing latents
  // ---------------------------------------------------------------------------

  test("P7 degraded: missing latents impute prior 0.5/se 0.6; ranked; NO weight renorm", () => {
    const gap = mk("gap", { noLatents: true, gender: "NB" });
    const explicit = mk("gap", {
      reg: 0.5,
      pol: 0.5,
      rel: 0.5,
      agc: 0.5,
      se: 0.6,
      gender: "NB",
    });
    const partner = mk("p", { gender: "M" });
    // Imputation equivalence: empty latents SCORE exactly as explicit prior 0.5/se 0.6
    // (se 0.6 matters: it changes the Agency penalty, so this is a real check). The
    // bothHighAgency flag is intentionally provenance-aware: imputed priors never surface
    // it (zero data must not assert a dominance collision — A10/S15 legibility), while a
    // MEASURED posterior that happens to sit at the prior does. Compare everything else.
    const stripFlag = (s: ReturnType<typeof scorePair>): string =>
      JSON.stringify({
        ...s,
        flags: { ...s.flags, bothHighAgency: undefined },
      });
    for (const lens of LENSES) {
      const a = scorePair(gap, partner, lens);
      const b = scorePair(explicit, partner, lens);
      assert(
        stripFlag(a) === stripFlag(b),
        `${lens}: missing-latent person scores differ from explicit prior person`
      );
      if (lens !== "friendship") {
        assert(
          a.flags.bothHighAgency === undefined,
          `${lens}: imputed prior surfaced bothHighAgency`
        );
        assert(
          b.flags.bothHighAgency !== undefined,
          `${lens}: measured posterior must display the probability`
        );
      }
    }
    // Still ranked, never dropped:
    const room = [mk("sub", { gender: "F" }), gap, mk("x", { gender: "M" })];
    for (const lens of LENSES) {
      const ids = rankRoom(room, "sub", lens).map((r) => r.id);
      assert(
        ids.includes("gap"),
        `${lens}: degraded person fell out of the ranking`
      );
    }
    // NO renormalization (AUDIT S15): the weight applied to an imputed-latent level term is
    // the full published weight. Partner politeness 0.9 vs 0.1 → softMin diff = 0.4 in every
    // lens (γ=0.5: 0.6−0.2; γ=0: 0.7−0.3), so Δrank must equal w_rank[politeness] × 0.4.
    const hi = mk("hi", { pol: 0.9, gender: "M" });
    const lo = mk("lo", { pol: 0.1, gender: "M" });
    const expected: Record<Lens, number> = {
      romantic: 0.07 * 0.4, // published cell
      business: (0.07 / 0.95) * 0.4, // agency-off renorm is the ONLY legal renorm
      friendship: 0.05 * 0.4, // published cell
    };
    const parts: string[] = [];
    for (const lens of LENSES) {
      const d = scorePair(gap, hi, lens).rank - scorePair(gap, lo, lens).rank;
      assert(
        near(d, expected[lens], 1e-9),
        `${lens}: Δrank=${d}, expected ${expected[lens]} (weights renormalized?)`
      );
      parts.push(`${lens} Δrank=${d.toFixed(6)}≈${expected[lens].toFixed(6)}`);
    }
    return `imputation exact on scoring surface (flag provenance-aware); degraded person ranked everywhere; full-weight check: ${parts.join(", ")}`;
  });

  // ---------------------------------------------------------------------------
  // P8 — business Agency default OFF + overlay ablation
  // ---------------------------------------------------------------------------

  test("P8 business Agency default off: off-vector sums to 1; overlay restores .05/.10 and changes scores", () => {
    const off = getWeights("business");
    const on = getWeights("business", { agencyOverlay: true });
    assert(
      off.rank.agency === 0 && off.sim.agency === 0,
      "default business agency weight must be 0"
    );
    assert(
      on.rank.agency === 0.05 && on.sim.agency === 0.1,
      "overlay must restore .05/.10"
    );
    const sumOffRank = TERMS.reduce((s, t) => s + off.rank[t], 0);
    const sumOffSim = TERMS.reduce((s, t) => s + off.sim[t], 0);
    assert(
      near(sumOffRank, 1, 1e-9) && near(sumOffSim, 1, 1e-9),
      `off sums: ${sumOffRank}, ${sumOffSim}`
    );
    // A both-high-agency cofounder pair scores differently with vs without the overlay.
    const h1 = mk("h1", { agc: 0.9, gender: "F" });
    const h2 = mk("h2", { agc: 0.9, gender: "M" });
    const sOff = scorePair(h1, h2, "business");
    const sOn = scorePair(h1, h2, "business", { agencyOverlay: true });
    assert(
      Math.abs(sOff.rank - sOn.rank) > 1e-9,
      "overlay had no effect on rank"
    );
    assert(Math.abs(sOff.sim - sOn.sim) > 1e-9, "overlay had no effect on sim");
    // With the penalty column ON, a both-high pair must score lower than with it off-renormalized?
    // Not guaranteed in general (renorm shifts all weights), so assert only the flag + difference.
    const pTop = 1 - normCdf(0.6, 0.9, 0.45);
    const expectedBoth = pTop * pTop;
    assert(
      sOff.flags.bothHighAgency !== undefined &&
        near(sOff.flags.bothHighAgency, expectedBoth, 1e-9),
      `bothHighAgency=${sOff.flags.bothHighAgency}, expected ${expectedBoth}`
    );
    assert(
      sOn.flags.bothHighAgency !== undefined,
      "flag must fire under overlay too"
    );
    return (
      `off sums rank=${sumOffRank.toFixed(12)} sim=${sumOffSim.toFixed(12)}; ` +
      `rank off=${sOff.rank.toFixed(6)} vs overlay=${sOn.rank.toFixed(6)} (Δ=${(sOff.rank - sOn.rank).toExponential(2)}); ` +
      `bothHighAgency=${(sOff.flags.bothHighAgency as number).toFixed(4)} (=P(top)^2=${expectedBoth.toFixed(4)})`
    );
  });

  // ---------------------------------------------------------------------------
  // P9 — extras: pursueWithdraw threshold, erf sanity, frozen band cutoffs
  // ---------------------------------------------------------------------------

  test("P9 pursueWithdraw: P(bottom-band reg) x [partner distanceBand==3] > 0.60 fires (symmetric)", () => {
    const anx = mk("anx", { reg: 0.2, gender: "F" }); // P(reg < .40) ≈ .672 > .60
    const far = mk("far", { distanceBand: 3, gender: "M" });
    const calm = mk("calm", { reg: 0.45, gender: "F" }); // P ≈ .456 < .60 — must NOT fire
    const nearBy = mk("nearBy", { distanceBand: 1, gender: "M" });
    const expectedP = normCdf(0.4, 0.2, 0.45);
    const s1 = scorePair(anx, far, "romantic");
    assert(
      s1.flags.pursueWithdraw !== undefined &&
        near(s1.flags.pursueWithdraw, expectedP, 1e-9),
      `flag=${s1.flags.pursueWithdraw}, expected ${expectedP}`
    );
    const s2 = scorePair(far, anx, "romantic"); // symmetric direction
    assert(
      s2.flags.pursueWithdraw !== undefined &&
        near(s2.flags.pursueWithdraw as number, expectedP, 1e-12),
      "flag not symmetric"
    );
    assert(
      scorePair(calm, far, "romantic").flags.pursueWithdraw === undefined,
      "fired below threshold"
    );
    assert(
      scorePair(anx, nearBy, "romantic").flags.pursueWithdraw === undefined,
      "fired without distanceBand==3"
    );
    // The fixed sim penalty is applied: same pair with the flag suppressed only via distance
    // band change alters the distance term too, so assert the flag+value only (penalty size is
    // a frozen constant inside the engine).
    return (
      `flag=${(s1.flags.pursueWithdraw as number).toFixed(4)} (=normCdf(.40;.20,.45)=${expectedP.toFixed(4)}) > 0.60; ` +
      `no-fire controls: reg=.45 (P=${normCdf(0.4, 0.45, 0.45).toFixed(3)}) and distanceBand=1`
    );
  });

  test("P9b numeric sanity: erf, normCdf, frozen band cutoffs", () => {
    // A&S 7.1.26 guarantees |error| < 1.5e-7 — erf(0) is ~1e-9, not exactly 0, by design.
    assert(near(erf(0), 0, 1.5e-7), `erf(0)=${erf(0)}`);
    assert(near(erf(1), 0.8427007929, 1.5e-7), `erf(1)=${erf(1)}`);
    assert(near(erf(-1), -0.8427007929, 1.5e-7), `erf(-1)=${erf(-1)}`);
    assert(
      near(normCdf(0.5, 0.5, 0.45), 0.5, 1.5e-7),
      "normCdf at mean != 0.5"
    );
    assert(
      bandOf(0.399999) === "low" &&
        bandOf(0.4) === "mid" &&
        bandOf(0.599999) === "mid" &&
        bandOf(0.6) === "high",
      "band cutoffs not frozen at LOW<0.40<=MID<0.60<=HIGH"
    );
    return `erf(0)=${erf(0).toExponential(2)} (<1.5e-7 bound); erf(1)=${erf(1).toFixed(7)}; normCdf(mean)=${normCdf(0.5, 0.5, 0.45).toFixed(9)}; bands: .399999→low, .4→mid, .599999→mid, .6→high`;
  });
});
