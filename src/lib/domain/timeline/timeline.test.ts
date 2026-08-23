/**
 * timeline.test.ts -- the verifier suite for the deterministic timeline engine,
 * MOVED from `timeline/timeline.test.ts` (the AUDIT F2 bake-off harness) into
 * `src/**` so the root Vitest runs it. It was outside CI entirely before issue
 * #33: `tsconfig.json` excludes `timeline/` and `vitest.config.mts` only
 * includes `src/**` and `test/**`, so nothing here was ever checked by
 * `pnpm run verify`.
 *
 * WHAT MOVED AND WHAT DID NOT. The harness held 39 tests across three
 * approaches. Only approach B shipped, and only its deterministic half moves
 * (issue #33 Scope: `shared.ts` + `approach-b/*`, with `narrate`/`nominate`
 * inverted to a parameter). So:
 *
 *   MOVED   V1 V2 V2b V3 V4 V5 V6a V6b V6c V7a V7b V7e V9 V10 V11 V11b V12
 *           -- everything that exercises `shared.ts` and approach B, rewritten
 *           against `it()` and re-pointed at `src/lib/domain/timeline/`.
 *   STAYED  V7c V7d V8a-c (approach C and its skill documents), V12a-d and
 *           V13a-m (the LIVE narrator: batch/parallel shapes, concurrency,
 *           timeouts, the pet guard). `lib/narrator.ts` is NOT moved -- it is
 *           rewritten over `LlmPort` as `src/lib/adapters/timeline/narrator.ts`,
 *           and its tests belong to that adapter, not to the domain.
 *
 * Plus one test this file adds, N1, because the move introduced a seam the
 * harness did not have: the narrator is now a PARAMETER, and injecting the
 * deterministic one explicitly must produce byte-identical output to letting
 * it default. That is the proof the inversion changed no behaviour.
 *
 * `node:test` became Vitest's `it`; `node:assert/strict` stayed, because the
 * assertion messages in these bodies are the diagnostics and rewriting 400
 * assertions into `expect` would have thrown them away for nothing.
 *
 * No network and no key: `opts.live` is never set, so every run narrates
 * through the deterministic `mockNarrator`.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";

import type { Gender } from "../matching/engine.ts";
import { scorePair } from "../matching/engine.ts";
import { generateTimeline as genB } from "./index.ts";
import { mockNarrator } from "./mock-narrator.ts";
import type {
  BusinessTimeline,
  FriendshipTimeline,
  GenerateTimeline,
  Lens,
  PairScore,
  Person,
  RomanticTimeline,
  Timeline,
  TimelineOpts,
} from "./shared.ts";
import {
  checkCoherence,
  checkFrictionArc,
  checkKidGates,
  isDegradedPair,
  LENS_CONSTRAINTS,
  scanBanned,
  scanSurvivalClaims,
  validateTimeline,
} from "./shared.ts";
import { verifyTriggerClaim } from "./verify.ts";

// ---------------------------------------------------------------------------
// V3 (type level) — compile-time guarantees, verified whenever tsc runs.
// Erasable: nothing here survives type stripping.
// ---------------------------------------------------------------------------

type ForbiddenFriendshipKey = Extract<
  keyof FriendshipTimeline,
  "horizonYears" | "dissolution" | "epilogue"
>;
type MustBeNever<_T extends never> = "ok";
// Fails to compile if FriendshipTimeline ever grows a duration/dissolution field:
const friendshipTypeGuarantee: MustBeNever<ForbiddenFriendshipKey> = "ok";
// Fails to compile if the rom/biz variants ever LOSE their duration fields:
type _RomanticKeeps = [
  RomanticTimeline["horizonYears"],
  RomanticTimeline["dissolution"],
  RomanticTimeline["epilogue"],
];
type _BusinessKeeps = [
  BusinessTimeline["horizonYears"],
  BusinessTimeline["dissolution"],
  BusinessTimeline["epilogue"],
];
// Fails to compile if approach B drifts off the shared interface:
const _ifaceB: GenerateTimeline = genB;

// ---------------------------------------------------------------------------

interface MkOpts {
  reg?: number;
  pol?: number;
  rel?: number;
  agc?: number;
  se?: number;
  noLatents?: boolean;
  distanceBand?: number;
  money?: number;
  rooted?: number;
  family?: number;
  cap?: number;
  tags?: string[];
  chrono?: number;
  team?: string;
  track?: string;
  cohort?: number;
  gender?: Gender;
  wantsKids?: boolean;
  risk?: number;
  exit?: number;
}

function mk(id: string, o: MkOpts = {}): Person {
  const se = o.se ?? 0.45;
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    latents: o.noLatents
      ? {}
      : {
          regulation: { mean: o.reg ?? 0.6, se },
          politeness: { mean: o.pol ?? 0.6, se },
          reliability: { mean: o.rel ?? 0.55, se },
          agency: { mean: o.agc ?? 0.4, se },
        },
    declared: {
      distanceBand: o.distanceBand ?? 1,
      lifeShape: {
        moneyPosture: o.money ?? 0.5,
        rootedness: o.rooted ?? 0.5,
        familyGravity: o.family ?? 0.5,
        capacityHoursBand: o.cap ?? 2,
      },
      tags: o.tags ?? ["climbing", "coffee", "synths"],
      chronotype: o.chrono ?? 1,
    },
    structural: {
      team: o.team,
      track: o.track ?? "sim",
      cohort: o.cohort ?? 1,
      acquaintances: [],
    },
    gates: {
      romantic: {
        interestedIn: ["M", "F", "NB"],
        gender: o.gender ?? "F",
        single: true,
        ageBand: 1,
        wantsKids: o.wantsKids ?? true,
      },
      business: {
        riskPosture: o.risk ?? 1,
        exitHorizon: o.exit ?? 1,
        redlinesOk: true,
      },
    },
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  };
}

const ana = mk("ana", {
  team: "atlas",
  gender: "F",
  tags: ["climbing", "coffee", "synths"],
});
const bruno = mk("bruno", {
  team: "atlas",
  gender: "M",
  tags: ["climbing", "coffee", "film"],
  reg: 0.65,
  rel: 0.62,
});
const dana = mk("dana", {
  noLatents: true,
  gender: "NB",
  tags: ["coffee", "running"],
  team: undefined,
  cohort: 2,
});
const nikoNoKids = mk("niko", {
  gender: "M",
  wantsKids: false,
  tags: ["coffee", "chess"],
});
// Low-similarity but eligible pair — dissolutions frequent in the seed sweep.
const vera = mk("vera", {
  gender: "F",
  reg: 0.3,
  pol: 0.35,
  rel: 0.3,
  distanceBand: 2,
  money: 0.15,
  rooted: 0.2,
  family: 0.2,
  cap: 0,
  tags: ["opera"],
  chrono: 0,
  team: undefined,
  track: "a",
  cohort: 0,
});
const walt = mk("walt", {
  gender: "M",
  reg: 0.35,
  pol: 0.4,
  rel: 0.35,
  distanceBand: 2,
  money: 0.9,
  rooted: 0.85,
  family: 0.9,
  cap: 3,
  tags: ["golf"],
  chrono: 3,
  team: undefined,
  track: "b",
  cohort: 3,
});

const LENSES: Lens[] = ["romantic", "business", "friendship"];
/** One approach reaches `src/`: B is what shipped. A and C stay in the harness. */
const APPROACHES: Array<[string, GenerateTimeline]> = [["b", genB]];

function opts(seed: number, cA = true, cB = true): TimelineOpts {
  return { seed, offspringConsentA: cA, offspringConsentB: cB };
}

function scoreOf(a: Person, b: Person, lens: Lens): PairScore {
  const s = scorePair(a, b, lens);
  assert.ok(
    s.eligible,
    `fixture pair ${a.id}/${b.id} must be eligible under ${lens} (got: ${s.reason})`
  );
  return s;
}

function errorsOf(
  t: Timeline,
  a: Person,
  b: Person,
  s: PairScore,
  o: TimelineOpts
): string[] {
  return validateTimeline(t, a, b, s, o)
    .filter((i) => i.severity === "error")
    .map((i) => `${i.code}: ${i.message}`);
}

// ---------------------------------------------------------------------------
// Matrix — generated once, shared by several subtests
// ---------------------------------------------------------------------------

interface MatrixRow {
  approach: string;
  lens: Lens;
  pair: string;
  seed: number;
  a: Person;
  b: Person;
  score: PairScore;
  o: TimelineOpts;
  t: Timeline;
}

let matrixMemo: Promise<MatrixRow[]> | null = null;
function matrix(): Promise<MatrixRow[]> {
  if (matrixMemo) return matrixMemo;
  matrixMemo = (async () => {
    const rows: MatrixRow[] = [];
    const pairs: Array<[string, Person, Person]> = [
      ["ana-bruno", ana, bruno],
      ["ana-dana (degraded)", ana, dana],
    ];
    for (const [name, gen] of APPROACHES) {
      for (const lens of LENSES) {
        for (const [pair, a, b] of pairs) {
          const score = scoreOf(a, b, lens);
          for (const seed of [1, 7, 42]) {
            const o = opts(seed);
            rows.push({
              approach: name,
              lens,
              pair,
              seed,
              a,
              b,
              score,
              o,
              t: await gen(a, b, score, lens, o),
            });
          }
        }
      }
    }
    return rows;
  })();
  return matrixMemo;
}

// ---------------------------------------------------------------------------
// V1 — interface conformance
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// V1 — interface conformance
// ---------------------------------------------------------------------------

it("V1: the moved generator still satisfies the shared interface", () => {
  for (const [name, gen] of APPROACHES)
    assert.equal(typeof gen, "function", `approach ${name}`);
  assert.equal(friendshipTypeGuarantee, "ok");
});

// ---------------------------------------------------------------------------
// V2 — determinism (same seed → identical timeline)
// ---------------------------------------------------------------------------

it("V2: the generator is seeded-deterministic (same seed → identical timeline)", async () => {
  for (const [name, gen] of [["b", genB]] as Array<
    [string, GenerateTimeline]
  >) {
    for (const lens of LENSES) {
      for (const [pairName, a, b] of [
        ["ana-bruno", ana, bruno],
        ["ana-dana", ana, dana],
      ] as Array<[string, Person, Person]>) {
        const score = scoreOf(a, b, lens);
        const t1 = await gen(a, b, score, lens, opts(1234));
        const t2 = await gen(a, b, score, lens, opts(1234));
        assert.deepEqual(
          t2,
          t1,
          `approach ${name} / ${lens} / ${pairName}: same seed must reproduce the identical timeline`
        );
      }
    }
  }
});

it("V2b: different seeds actually change the structure (romantic)", async () => {
  for (const [name, gen] of [["b", genB]] as Array<
    [string, GenerateTimeline]
  >) {
    const score = scoreOf(ana, bruno, "romantic");
    const shapes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = await gen(ana, bruno, score, "romantic", opts(seed));
      shapes.add(
        JSON.stringify(
          t.arcs.map((arc) =>
            arc.beats.map((bt) => [bt.year, bt.kind, bt.domain])
          )
        )
      );
    }
    assert.ok(
      shapes.size >= 2,
      `approach ${name}: 6 seeds produced only ${shapes.size} distinct structures`
    );
  }
});

// ---------------------------------------------------------------------------
// V3 — friendship structurally lacks duration/dissolution (runtime)
// ---------------------------------------------------------------------------

it("V3: friendship timelines carry no horizonYears/dissolution/epilogue keys and no ending events", async () => {
  const rows = (await matrix()).filter((r) => r.lens === "friendship");
  // 2 pairs x 3 seeds. Was 18 in the harness, which swept three approaches;
  // only B moved, so the floor moves with it rather than being deleted.
  assert.ok(
    rows.length >= 6,
    `matrix produced only ${rows.length} friendship rows`
  );
  for (const r of rows) {
    const anyT = r.t as unknown as Record<string, unknown>;
    for (const key of ["horizonYears", "dissolution", "epilogue"]) {
      assert.ok(
        !(key in anyT),
        `approach ${r.approach} seed ${r.seed} (${r.pair}): friendship timeline must not carry "${key}"`
      );
    }
    assert.equal(r.t.lens, "friendship");
    for (const e of r.t.events) {
      assert.ok(
        e.kind !== "dissolution" && e.kind !== "epilogue" && e.kind !== "kid",
        `approach ${r.approach} seed ${r.seed}: friendship event kind "${e.kind}" is forbidden`
      );
    }
    assert.equal(
      checkCoherence(r.t).filter((i) => i.severity === "error").length,
      0
    );
  }
});

// ---------------------------------------------------------------------------
// V4 — the friction pillar generates at least one arc with events, everywhere

// ---------------------------------------------------------------------------
// V4 — the friction pillar generates at least one arc with events
// ---------------------------------------------------------------------------

it("V4: friction arc present with events in every timeline (lenses × pairs × seeds)", async () => {
  const rows = await matrix();
  for (const r of rows) {
    const frictionArcs = r.t.arcs.filter((arc) => arc.role === "friction");
    assert.ok(
      frictionArcs.length >= 1,
      `approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: no friction arc`
    );
    const issues = checkFrictionArc(r.t, r.score).filter(
      (i) => i.severity === "error"
    );
    assert.deepEqual(
      issues,
      [],
      `approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: ${JSON.stringify(issues)}`
    );
    // The arc must cite the actually-scored friction term (drives the honesty feature).
    assert.ok(
      r.score.friction === null ||
        frictionArcs.some((arc) => arc.sourceTerm === r.score.friction?.term),
      `approach ${r.approach} / ${r.lens} seed ${r.seed}: friction arc does not cite the scored term ${r.score.friction?.term}`
    );
  }
});

// ---------------------------------------------------------------------------
// V5 — full validator sweep (schema, coherence, kid gates, safety, S10)

// ---------------------------------------------------------------------------
// V5 — full validator sweep
// ---------------------------------------------------------------------------

it("V5: full validation — zero errors across the whole matrix", async () => {
  const rows = await matrix();
  const failures: string[] = [];
  for (const r of rows) {
    const errs = errorsOf(r.t, r.a, r.b, r.score, r.o);
    if (errs.length > 0)
      failures.push(
        `approach ${r.approach} / ${r.lens} / ${r.pair} seed ${r.seed}: ${errs.join(" | ")}`
      );
  }
  assert.deepEqual(failures, []);
  console.log(`  V5 validated ${rows.length} timelines with zero errors`);
});

// ---------------------------------------------------------------------------
// V6 — kid gates
// ---------------------------------------------------------------------------

it("V6a: offspring consent off on either side → no kid events (rom + biz)", async () => {
  for (const [name, gen] of APPROACHES) {
    for (const lens of ["romantic", "business"] as Lens[]) {
      const score = scoreOf(ana, bruno, lens);
      for (const [cA, cB] of [
        [false, true],
        [true, false],
        [false, false],
      ] as Array<[boolean, boolean]>) {
        for (const seed of [1, 7, 42, 99]) {
          const t = await gen(ana, bruno, score, lens, opts(seed, cA, cB));
          assert.ok(
            !t.events.some((e) => e.kind === "kid"),
            `approach ${name} / ${lens} seed ${seed} consent(${cA},${cB}): kid event leaked past the consent gate`
          );
        }
      }
    }
  }
});

it("V6b: wantsKids false on one side → no kid events in the business lens", async () => {
  const score = scoreOf(ana, nikoNoKids, "business");
  for (const [name, gen] of APPROACHES) {
    for (const seed of [1, 7, 42]) {
      const t = await gen(ana, nikoNoKids, score, "business", opts(seed));
      assert.ok(
        !t.events.some((e) => e.kind === "kid"),
        `approach ${name} seed ${seed}: kid event despite one-sided wantsKids (AUDIT S11 desire-only gate)`
      );
    }
  }
});

it("V6c: dissolution sweep — dissolved at year Y → no kid at/after Y, nothing after Y but one epilogue", async () => {
  const score = scoreOf(vera, walt, "romantic");
  for (const [name, gen] of [["b", genB]] as Array<
    [string, GenerateTimeline]
  >) {
    let dissolved = 0;
    let kidBearing = 0;
    let earlyDissolved = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const o = opts(seed);
      const t = (await gen(
        vera,
        walt,
        score,
        "romantic",
        o
      )) as RomanticTimeline;
      if (t.dissolution === null) continue;
      dissolved++;
      const dYear = t.dissolution.year;
      if (dYear <= 5) earlyDissolved++;
      const kids = t.events.filter((e) => e.kind === "kid");
      if (kids.length > 0) kidBearing++;
      for (const k of kids) {
        assert.ok(
          k.year < dYear,
          `approach ${name} seed ${seed}: kid event at year ${k.year} but dissolved at year ${dYear}`
        );
      }
      const after = t.events.filter((e) => e.year > dYear);
      assert.ok(
        after.every((e) => e.kind === "epilogue"),
        `approach ${name} seed ${seed}: non-epilogue events after dissolution`
      );
      assert.ok(
        after.length <= 1,
        `approach ${name} seed ${seed}: more than one epilogue`
      );
      assert.equal(
        checkKidGates(t, vera, walt, o).filter((i) => i.severity === "error")
          .length,
        0
      );
    }
    assert.ok(
      dissolved >= 5,
      `approach ${name}: only ${dissolved}/150 seeds dissolved — sweep not meaningful`
    );
    assert.ok(
      earlyDissolved >= 1,
      `approach ${name}: no early (year <= 5) dissolution found in 150 seeds`
    );
    console.log(
      `  V6c approach ${name}: ${dissolved}/150 dissolved (${earlyDissolved} at year <= 5), ${kidBearing} with pre-dissolution kid events — all gated correctly`
    );
  }
});

// ---------------------------------------------------------------------------
// V7 — banned-words scan over every template/skill/prompt string in timeline/
// ---------------------------------------------------------------------------

// The four conflict-construct names, assembled dynamically so this test file

// ---------------------------------------------------------------------------
// V9 — degraded pairs still get full timelines
// ---------------------------------------------------------------------------

it("V9: degraded pair → >= minEvents in every lens; meta.degraded set", async () => {
  assert.ok(isDegradedPair(ana, dana), "fixture must be degraded");
  assert.ok(
    !isDegradedPair(ana, bruno),
    "control fixture must not be degraded"
  );
  for (const [name, gen] of APPROACHES) {
    for (const lens of LENSES) {
      const score = scoreOf(ana, dana, lens);
      for (const seed of [3, 9, 21]) {
        const o = opts(seed);
        const t = await gen(ana, dana, score, lens, o);
        assert.ok(
          t.events.length >= LENS_CONSTRAINTS[lens].minEvents,
          `approach ${name} / ${lens} seed ${seed}: degraded pair got only ${t.events.length} events`
        );
        assert.equal(
          t.meta.degraded,
          true,
          `approach ${name} / ${lens}: meta.degraded not set`
        );
        assert.deepEqual(errorsOf(t, ana, dana, score, o), []);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// V10 — meta contract (offline runs)
// ---------------------------------------------------------------------------

it("V10: meta — narration is mock offline, canonicity seeded, approach label b", async () => {
  const rows = await matrix();
  for (const r of rows) {
    assert.equal(
      r.t.meta.narration,
      "mock",
      `approach ${r.approach}: offline run must be mock narration`
    );
    assert.equal(r.t.meta.seed, r.seed);
    assert.equal(r.t.meta.approach, r.approach);
    assert.equal(r.t.meta.canonicity, "seeded");
  }
});

// ---------------------------------------------------------------------------
// V11 — approach B: the LLM proposes, only code admits
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// V11 — the model proposes, only code admits
// ---------------------------------------------------------------------------

it("V11: verifyTriggerClaim admits only claims true of the actual PairScore", () => {
  const score = scoreOf(ana, bruno, "romantic");
  const space = {
    patterns: [
      "spark",
      "slow-build",
      "grind-repair",
      "leap",
      "ritual",
      "stress-test",
    ],
    domains: LENS_CONSTRAINTS.romantic.domains.filter((d) => d !== "kids"),
    outcomes: ["strengthens", "lingers", "redirects"],
  };
  const freshDomain = space.domains.find((d) => d !== "kids") as string;
  const base = {
    pattern: "spark",
    domain: freshDomain,
    outcome: "strengthens",
  };

  // True driver claim → admitted.
  const topDriver = score.drivers[0].term;
  const ok = verifyTriggerClaim(
    { ...base, triggerClaim: `driver:${topDriver}` },
    score,
    "romantic",
    space,
    []
  );
  assert.equal(ok.admitted, true, ok.reason);
  assert.equal(ok.sourceTerm, topDriver);

  // A term that is NOT a top driver → rejected.
  const notDriver = (
    ["agency", "eligibility", "distance", "politeness", "reliability"] as const
  ).find((term) => !score.drivers.some((d) => d.term === term)) as string;
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: `driver:${notDriver}` },
      score,
      "romantic",
      space,
      []
    ).admitted,
    false
  );

  // Wrong friction term → rejected; the actual one → admitted.
  const actual = score.friction?.term as string;
  const wrong = actual === "structural" ? "commonGround" : "structural";
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: `friction:${wrong}` },
      score,
      "romantic",
      space,
      []
    ).admitted,
    false
  );
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: `friction:${actual}` },
      score,
      "romantic",
      space,
      []
    ).admitted,
    true
  );

  // Unfired flag → rejected. Malformed claim → rejected. Duplicate domain → rejected.
  assert.equal(score.flags.pursueWithdraw, undefined);
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: "flag:pursueWithdraw" },
      score,
      "romantic",
      space,
      []
    ).admitted,
    false
  );
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: "because vibes" },
      score,
      "romantic",
      space,
      []
    ).admitted,
    false
  );
  assert.equal(
    verifyTriggerClaim(
      { ...base, triggerClaim: `driver:${topDriver}` },
      score,
      "romantic",
      space,
      [{ pattern: "ritual", domain: freshDomain }]
    ).admitted,
    false
  );
});

// ---------------------------------------------------------------------------
// V12 — adversarial edge pairs: no-tags/no-distanceBand, both-high-agency,
// pursue-withdraw, max capacity gap — every approach, every lens, many seeds
// ---------------------------------------------------------------------------

function mkEdge(
  id: string,
  o: MkOpts & { noTags?: boolean; noDistance?: boolean }
): Person {
  const p = mk(id, o);
  if (o.noTags) p.declared.tags = [];
  if (o.noDistance) p.declared.distanceBand = undefined;
  return p;
}

// ---------------------------------------------------------------------------
// V12 — adversarial edge pairs
// ---------------------------------------------------------------------------

it("V12: edge pairs — degraded inputs, flag-firing pairs, capacity gaps: always valid, never throw", async () => {
  const edgePairs: Array<[string, Person, Person]> = [
    [
      "no-tags+no-distance",
      mkEdge("nta", { noTags: true, noDistance: true, gender: "F" }),
      mkEdge("ntb", {
        noTags: true,
        noDistance: true,
        gender: "M",
        cap: 1,
        chrono: 2,
      }),
    ],
    [
      "both-high-agency",
      mk("haa", { agc: 0.95, se: 0.45, gender: "F", tags: ["music"] }),
      mk("hab", { agc: 0.95, se: 0.45, gender: "M", tags: ["music"] }),
    ],
    [
      "pursue-withdraw",
      mk("pwa", { reg: 0.1, se: 0.3, gender: "F", tags: ["music"] }),
      mk("pwb", { distanceBand: 3, gender: "M", tags: ["music"] }),
    ],
    [
      "capacity-gap-3",
      mk("cga", { cap: 0, gender: "F", tags: ["music"] }),
      mk("cgb", { cap: 3, gender: "M", tags: ["chess"] }),
    ],
  ];
  // Precondition: the flag pairs actually fire their flags.
  const sHA = scoreOf(edgePairs[1][1], edgePairs[1][2], "romantic");
  const sPW = scoreOf(edgePairs[2][1], edgePairs[2][2], "romantic");
  assert.ok(
    (sHA.flags.bothHighAgency ?? 0) > 0.5,
    "both-high-agency fixture must fire the flag"
  );
  assert.ok(
    sPW.flags.pursueWithdraw !== undefined,
    "pursue-withdraw fixture must fire the flag"
  );

  let runs = 0;
  for (const [pname, a, b] of edgePairs) {
    for (const lens of LENSES) {
      const score = scoreOf(a, b, lens);
      for (const [gname, gen] of APPROACHES) {
        for (let seed = 1; seed <= 10; seed++) {
          const o = opts(seed);
          const t = await gen(a, b, score, lens, o);
          runs++;
          assert.deepEqual(
            errorsOf(t, a, b, score, o),
            [],
            `approach ${gname} / ${lens} / ${pname} seed ${seed}`
          );
        }
      }
    }
  }
  console.log(`  V12 edge sweep: ${runs} runs, all valid`);
});

it("V11b: any admitted bonus arc in the matrix cites a real score component", async () => {
  const rows = (await matrix()).filter((r) => r.approach === "b");
  let bonusSeen = 0;
  for (const r of rows) {
    for (const arc of r.t.arcs.filter((x) => x.role === "bonus")) {
      bonusSeen++;
      const legit = new Set<string | null>([
        r.score.friction?.term ?? null,
        ...r.score.drivers.map((d) => d.term),
        ...(r.score.flags.bothHighAgency !== undefined ? ["agency"] : []),
        ...(r.score.flags.pursueWithdraw !== undefined ? ["distance"] : []),
      ]);
      assert.ok(
        legit.has(arc.sourceTerm),
        `approach b / ${r.lens} seed ${r.seed}: bonus arc cites "${arc.sourceTerm}" which is not a scored driver/friction/flag`
      );
    }
  }
  console.log(`  V11b bonus arcs admitted across matrix: ${bonusSeen}`);
});

// ---------------------------------------------------------------------------
// V7 — banned-word and survival-claim scans
// ---------------------------------------------------------------------------

// The four conflict-construct names, assembled dynamically so this test file
// never contains them as literals.
const GOTTMAN_RE = new RegExp(
  "\\b(" +
    [
      "criti" + "cism",
      "con" + "tempt",
      "defen" + "siveness",
      "stone" + "wall\\w*",
    ].join("|") +
    ")\\b",
  "gi"
);

/** This directory — the moved engine, not the bake-off harness. */
const TIMELINE_DIR = new URL(".", import.meta.url).pathname;

/** Every .ts/.md file in the moved engine (recursive, node_modules excluded). */
function timelineFiles(): string[] {
  return readdirSync(TIMELINE_DIR, { recursive: true })
    .map(String)
    .filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".md")) && !f.includes("node_modules")
    )
    .sort();
}

it("V7a: the four conflict-construct words appear NOWHERE in the moved engine outside the scanner", () => {
  // Documented exclusions:
  //   shared.ts        — defines the scanner (regexes + curated word list)
  //   timeline.test.ts — this file (constructs fixtures dynamically)
  const excluded = new Set(["shared.ts", "timeline.test.ts"]);
  const files = timelineFiles().filter((f) => !excluded.has(f));
  assert.ok(files.length >= 5, `walk found only ${files.length} files`);
  const offenders: string[] = [];
  for (const f of files) {
    const txt = readFileSync(join(TIMELINE_DIR, f), "utf8");
    GOTTMAN_RE.lastIndex = 0;
    const m = GOTTMAN_RE.exec(txt);
    if (m) offenders.push(`${f}: "${m[0]}"`);
  }
  assert.deepEqual(offenders, []);
  // Scanner sanity: it does catch a constructed hit.
  assert.ok(
    scanBanned("a moment of " + "con" + "tempt").length > 0,
    "scanBanned failed to catch a known construct word"
  );
});

it("V7b: strict scanBanned — every authored template and label in the moved engine is clean", () => {
  const strictClean = [
    "index.ts", // authored arc library (hints, labels)
    "grammar.ts", // pattern/domain/outcome vocabulary + labels
    "realize.ts", // realized hint templates
    "verify.ts",
    "mock-narrator.ts", // the deterministic prose every offline run ships
  ];
  const offenders: string[] = [];
  for (const f of strictClean) {
    const txt = readFileSync(join(TIMELINE_DIR, f), "utf8");
    for (const hit of scanBanned(txt))
      offenders.push(`${f}: ${hit.category}:"${hit.match}"`);
  }
  assert.deepEqual(offenders, []);
});

it("V7e: no numeric survival fractions or banned words in any generated user-facing text", async () => {
  const rows = await matrix();
  for (const r of rows) {
    const texts = r.t.events.map((e) => e.text);
    for (const arc of r.t.arcs) texts.push(arc.label);
    if (r.t.lens !== "friendship" && r.t.epilogue) texts.push(r.t.epilogue);
    for (const txt of texts) {
      assert.deepEqual(
        scanBanned(txt),
        [],
        `approach ${r.approach} / ${r.lens} seed ${r.seed}: banned content in "${txt}"`
      );
      assert.deepEqual(
        scanSurvivalClaims(txt),
        [],
        `approach ${r.approach} / ${r.lens} seed ${r.seed}: survival claim in "${txt}"`
      );
    }
  }
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// N1 — the narrator is a PARAMETER now, and that changed nothing
// ---------------------------------------------------------------------------

it("N1: injecting the deterministic narrator explicitly matches the default, and an injected narrator writes every sentence", async () => {
  const calls: number[] = [];
  const counting = {
    narrate: (
      beats: Parameters<typeof mockNarrator.narrate>[0],
      ...rest: [Parameters<typeof mockNarrator.narrate>[1], Lens, TimelineOpts]
    ) => {
      calls.push(beats.length);
      return mockNarrator.narrate(beats, ...rest);
    },
    nominate: mockNarrator.nominate,
  };
  for (const lens of LENSES) {
    const score = scoreOf(ana, bruno, lens);
    const byDefault = await genB(ana, bruno, score, lens, opts(4242));
    const injected = await genB(ana, bruno, score, lens, opts(4242), counting);
    assert.deepEqual(
      injected,
      byDefault,
      `${lens}: passing the deterministic narrator explicitly must produce the identical timeline`
    );
    // Every event's prose came from the narrator it was handed — no beat is
    // narrated behind its back, which is what makes AC-4's per-beat fallback
    // reachable at all.
    assert.equal(
      calls.at(-1),
      byDefault.events.length,
      `${lens}: narrator saw a different beat count`
    );
    assert.ok(
      byDefault.events.every((e) => e.text.length > 0),
      `${lens}: an empty sentence shipped`
    );
  }
});
