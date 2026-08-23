import { afterEach, describe, expect, it, vi } from "vitest";

import { failingLlm } from "../adapters/llm/fake";
import {
  type Assignment,
  assignmentsForBatch,
} from "../domain/quiz/assignments.ts";
import type { Block } from "../domain/quiz/instrument.ts";
import { validateBlock } from "../domain/quiz/instrument.ts";
import type { BlockResponse } from "../domain/quiz/response.ts";
import type {
  GeneratedBlockRepository,
  StoredBlock,
} from "../ports/generated-block-repository";
import type { GenerationClaims } from "../ports/generation-claims.ts";
import type { LlmPort, LlmRequest } from "../ports/llm";
import type { QuizPoolRepository } from "../ports/quiz-pool.ts";
import type { ResponseRepository } from "../ports/response-repository";
import {
  adoptPoolSet,
  continueQuizGeneration,
  type GenerationDeps,
  POOL_TARGET,
  topUpQuizPool,
} from "./ensure-quiz-batch.ts";

/**
 * The three entry points of the generation pipeline, all of which run in
 * `after()`. What matters: the chain writes what is missing and nothing else
 * -- batch 1 first, then 2 and 3 side by side --, a lost claim stops it before
 * the model is touched, an answered batch is never rewritten, the budget stops
 * it after batch 1, the pool is topped up to target with whole forms and only
 * with won slots, adoption stores a form as generated, and none of them ever
 * rejects.
 *
 * Every fake is inline and in-memory: importing a Drizzle adapter here would
 * violate the hexagon rule `biome.json` enforces.
 */

const PILLARS = ["regulation", "politeness", "reliability", "agency"] as const;
const KEYS = ["a", "b", "c", "d"] as const;
const ROOM = "22222222-2222-4222-8222-222222222222";

const SCENARIOS = [
  "Tu abuela publica un meme sobre ti en el grupo familiar.",
  "La cajera del supermercado canta cada precio en ópera.",
  "Un gato desconocido duerme en tu maleta recién hecha.",
  "El taxi que pediste llega manejado por tu ex profesor.",
  "La lluvia solo cae sobre tu cuadra y sobre nadie más.",
  "Tu planta favorita amaneció con una nota pidiendo vacaciones.",
  "El ascensor del edificio anuncia los pisos con chistes malos.",
  "En la boda, la torta tiene tu cara dibujada con crema.",
  "Tu celular corrige cada mensaje agregando un poema corto.",
  "El parlante del parque repite tu nombre entre canciones.",
  "Un pelícano se instala en la piscina como si fuera socio.",
  "La fila del cine avanza solo cuando alguien aplaude.",
  "Tu cargador aparece enrollado en la bicicleta de un vecino.",
  "El partido de fútbol se detiene porque el balón pide disculpas.",
  "Las maletas del aeropuerto salen con sombreros de cumpleaños.",
];

function authoredFor(plan: Assignment) {
  const others = PILLARS.filter((p) => p !== plan.focusPillar);
  const pillars = [plan.focusPillar, ...others];
  return {
    position: plan.position,
    scenario: SCENARIOS[plan.position - 1],
    options: KEYS.map((key, i) => ({
      key,
      text: `opción ${key}`,
      pillar: pillars[i],
      keyed: i === 0 ? ("reversed" as const) : ("positive" as const),
    })),
  };
}

function blockFor(plan: Assignment, scenario?: string): Block {
  const authored = authoredFor(plan);
  return {
    position: plan.position,
    batch: plan.batch,
    focusPillar: plan.focusPillar,
    domain: plan.domain,
    scenario: scenario ?? authored.scenario,
    options: authored.options,
  };
}

function storedBatch(
  participantId: string,
  batch: number,
  source: StoredBlock["source"] = "generated"
): StoredBlock[] {
  return assignmentsForBatch(participantId, batch).map((plan) => ({
    block: blockFor(plan, `${source} ${plan.position}`),
    source,
  }));
}

/** In-memory repository, upserting on (participantId, position) like the real one. */
function fakeBlocks(seed: StoredBlock[] = [], participantId = "p-1") {
  const rows = new Map<string, StoredBlock>();
  for (const s of seed) rows.set(`${participantId}:${s.block.position}`, s);
  const calls = { saveBatch: [] as { id: string; positions: number[] }[] };
  const repo: GeneratedBlockRepository = {
    async byBatch(id, batch) {
      return [...rows.entries()]
        .filter(([k, v]) => k.startsWith(`${id}:`) && v.block.batch === batch)
        .map(([, v]) => v)
        .sort((a, b) => a.block.position - b.block.position);
    },
    async byParticipant(id) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${id}:`))
        .map(([, v]) => v)
        .sort((a, b) => a.block.position - b.block.position);
    },
    async saveBatch(id, blocks) {
      calls.saveBatch.push({
        id,
        positions: blocks.map((s) => s.block.position),
      });
      for (const s of blocks) rows.set(`${id}:${s.block.position}`, s);
    },
  };
  return { repo, calls, rows };
}

/** Claims that are won unless `lose(scope)` says otherwise; records both sides. */
function fakeClaims(lose: (scope: string) => boolean = () => false) {
  const claimed: string[] = [];
  const released: { scope: string; outcome: string }[] = [];
  const claims: GenerationClaims = {
    async claim(scope) {
      claimed.push(scope);
      return !lose(scope);
    },
    async release(scope, outcome) {
      released.push({ scope, outcome });
    },
  };
  return { claims, claimed, released };
}

function fakePool(options: { unclaimed?: Block[][]; recent?: string[] } = {}) {
  const unclaimed = [...(options.unclaimed ?? [])];
  const added: Block[][] = [];
  const adopted: { roomId: string; participantId: string }[] = [];
  const pool: QuizPoolRepository = {
    async add(_roomId, blocks) {
      added.push(blocks);
      unclaimed.push(blocks);
    },
    async adopt(roomId, participantId) {
      adopted.push({ roomId, participantId });
      return unclaimed.shift() ?? null;
    },
    async unclaimedCount() {
      return unclaimed.length;
    },
    async recentScenarios(_roomId, limit) {
      return (options.recent ?? []).slice(0, limit);
    },
  };
  return { pool, added, adopted, unclaimed };
}

function fakeResponses(participantId: string, positions: number[]) {
  const responses: ResponseRepository = {
    async save() {
      throw new Error("save is not part of these use cases");
    },
    async byParticipant(id) {
      if (id !== participantId) return [];
      return positions.map(
        (position): BlockResponse => ({
          participantId,
          position,
          mostKey: "a",
          leastKey: "b",
          shownOrder: "abcd",
          answeredAt: new Date("2026-08-22T21:00:00.000Z"),
        })
      );
    },
  };
  return responses;
}

/**
 * A model that authors whatever batch it is asked for (the batch number is in
 * the request id), with an optional clock advance per author call so the
 * budget can be exercised without waiting.
 */
function fakeLlm(options: { participantId?: string; advanceMs?: number } = {}) {
  const sent: { id: string; prompt: string }[] = [];
  const llm: LlmPort = {
    generate<T>(request: LlmRequest<T>): Promise<T> {
      sent.push({ id: request.id, prompt: request.prompt });
      if (request.id === "quiz.judge") {
        return Promise.resolve(request.schema.parse({ verdicts: [] }));
      }
      const batch = Number(/batch-(\d)/.exec(request.id)?.[1]);
      // The pool authors for a synthetic id the test cannot know; the prompt
      // carries the plan, so the response is built from whatever it lists.
      const positions = [...request.prompt.matchAll(/- position (\d+):/g)].map(
        (m) => Number(m[1])
      );
      const plans = assignmentsForBatch(
        options.participantId ?? "p-1",
        batch
      ).filter((a) => positions.includes(a.position));
      if (options.advanceMs) {
        vi.setSystemTime(Date.now() + options.advanceMs);
      }
      return Promise.resolve(
        request.schema.parse({ blocks: plans.map(authoredFor) })
      );
    },
  };
  return {
    llm,
    sent,
    authorCalls: () => sent.filter((s) => s.id !== "quiz.judge"),
  };
}

function world(
  participantId: string,
  options: {
    seed?: StoredBlock[];
    answered?: number[];
    lose?: (scope: string) => boolean;
    pool?: ReturnType<typeof fakePool>;
    llm?: LlmPort;
    advanceMs?: number;
  } = {}
) {
  const blocks = fakeBlocks(options.seed ?? [], participantId);
  const claims = fakeClaims(options.lose);
  const pool = options.pool ?? fakePool();
  const model = fakeLlm({ participantId, advanceMs: options.advanceMs });
  const deps: GenerationDeps = {
    llm: options.llm ?? model.llm,
    generatedBlocks: blocks.repo,
    claims: claims.claims,
    pool: pool.pool,
    responses: fakeResponses(participantId, options.answered ?? []),
  };
  return { deps, blocks, claims, pool, model };
}

afterEach(() => {
  vi.useRealTimers();
});

/** The `domain=` values an author prompt lists, in position order. */
function promptDomains(prompt: string): string[] {
  return [...prompt.matchAll(/domain=([^,]+),/g)].map((m) => m[1]);
}

/** Positions per save, sorted by first position: stage 2 writes in parallel. */
function savedPositions(w: ReturnType<typeof world>): number[][] {
  return w.blocks.calls.saveBatch
    .map((s) => s.positions)
    .sort((a, b) => a[0] - b[0]);
}

describe("continueQuizGeneration", () => {
  it("writes batch 1, then batches 2 and 3 side by side, each told what to avoid", async () => {
    const pool = fakePool({
      recent: ["Escena de otro participante en la sala."],
    });
    const w = world("p-chain", { pool });

    await expect(
      continueQuizGeneration({ participantId: "p-chain", roomId: ROOM }, w.deps)
    ).resolves.toBeUndefined();

    expect(w.claims.claimed).toEqual([
      "participant:p-chain:batch:1",
      "participant:p-chain:batch:2",
      "participant:p-chain:batch:3",
    ]);
    expect(w.claims.released.map((r) => r.outcome)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(savedPositions(w)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ]);
    expect(w.blocks.rows.size).toBe(15);
    for (const stored of w.blocks.rows.values()) {
      expect(stored.source).toBe("generated");
      expect(() => validateBlock(stored.block)).not.toThrow();
    }

    // Batch 1 sees the room. Batches 2 and 3 both see batch 1 and the room;
    // they are written at the same time, so neither sees the other.
    const authors = w.model.authorCalls();
    expect(authors.map((a) => a.id)).toEqual([
      "quiz.author.batch-1",
      "quiz.author.batch-2",
      "quiz.author.batch-3",
    ]);
    expect(authors[0].prompt).toContain("Escena de otro participante");
    expect(authors[1].prompt).toContain(SCENARIOS[0]);
    expect(authors[1].prompt).toContain(SCENARIOS[4]);
    expect(authors[2].prompt).toContain(SCENARIOS[0]);
    expect(authors[2].prompt).toContain("Escena de otro participante");
    expect(authors[2].prompt).not.toContain(SCENARIOS[9]);
  });

  it("skips a batch already authored, and rewrites one stored only as fallbacks", async () => {
    const w = world("p-skip", {
      seed: [
        ...storedBatch("p-skip", 1, "generated"),
        ...storedBatch("p-skip", 2, "fallback"),
      ],
    });

    await continueQuizGeneration(
      { participantId: "p-skip", roomId: ROOM },
      w.deps
    );

    expect(w.claims.claimed).toEqual([
      "participant:p-skip:batch:2",
      "participant:p-skip:batch:3",
    ]);
    expect(savedPositions(w)).toEqual([
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ]);
    for (const stored of w.blocks.rows.values()) {
      expect(stored.source).toBe("generated");
    }
    expect(w.blocks.rows.get("p-skip:1")?.block.scenario).toBe("generated 1");
    // The fallback rows were read, not written for: their scenarios are on
    // every avoid list, because the person may have seen them.
    for (const author of w.model.authorCalls()) {
      expect(author.prompt).toContain("fallback 6");
    }
  });

  it("returns at once when the claim is lost, without touching the model", async () => {
    const w = world("p-lost", { lose: () => true });

    await continueQuizGeneration(
      { participantId: "p-lost", roomId: ROOM },
      w.deps
    );

    expect(w.claims.claimed).toEqual(["participant:p-lost:batch:1"]);
    expect(w.model.sent).toHaveLength(0);
    expect(w.blocks.calls.saveBatch).toHaveLength(0);
    expect(w.claims.released).toHaveLength(0);
  });

  it("writes the batch whose claim it won when the other is held", async () => {
    const w = world("p-half", {
      seed: storedBatch("p-half", 1, "generated"),
      lose: (scope) => scope.endsWith(":batch:2"),
    });

    await continueQuizGeneration(
      { participantId: "p-half", roomId: ROOM },
      w.deps
    );

    expect(w.claims.claimed).toEqual([
      "participant:p-half:batch:2",
      "participant:p-half:batch:3",
    ]);
    expect(savedPositions(w)).toEqual([[11, 12, 13, 14, 15]]);
    expect(w.claims.released).toEqual([
      { scope: "participant:p-half:batch:3", outcome: "ready" },
    ]);
  });

  it("never regenerates a batch with an answered position, even when its rows are fallbacks", async () => {
    const w = world("p-answered", {
      seed: storedBatch("p-answered", 1, "fallback"),
      answered: [1, 2],
    });

    await continueQuizGeneration(
      { participantId: "p-answered", roomId: ROOM },
      w.deps
    );

    expect(w.claims.claimed).toEqual([
      "participant:p-answered:batch:2",
      "participant:p-answered:batch:3",
    ]);
    for (const position of [1, 2, 3, 4, 5]) {
      expect(w.blocks.rows.get(`p-answered:${position}`)?.source).toBe(
        "fallback"
      );
    }
    expect(w.blocks.rows.size).toBe(15);
  });

  it("does not write a batch that was answered while it was being authored", async () => {
    const w = world("p-race", {
      seed: storedBatch("p-race", 1, "generated"),
    });
    // The first read says nothing is answered; the read before the write
    // finds block 6 already on the table.
    let reads = 0;
    const responses: ResponseRepository = {
      ...w.deps.responses,
      async byParticipant(id) {
        reads += 1;
        return reads === 1 ? [] : fakeResponses(id, [6]).byParticipant(id);
      },
    };

    await continueQuizGeneration(
      { participantId: "p-race", roomId: ROOM },
      { ...w.deps, responses }
    );

    expect(savedPositions(w)).toEqual([[11, 12, 13, 14, 15]]);
    expect(w.blocks.rows.size).toBe(10);
    expect(w.claims.released.map((r) => r.outcome)).toEqual(["ready", "ready"]);
  });

  it("stops after batch 1 once the budget is spent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-22T21:00:00.000Z"));
    const w = world("p-budget", { advanceMs: 100_000 });

    await continueQuizGeneration(
      { participantId: "p-budget", roomId: ROOM, budgetMs: 50_000 },
      w.deps
    );

    // 100 s after batch 1 is over a 50 s budget: batches 2 and 3 wait for the
    // next request rather than starting inside an invocation about to end.
    expect(w.claims.claimed).toEqual(["participant:p-budget:batch:1"]);
    expect(w.blocks.rows.size).toBe(5);
    expect(w.claims.released.map((r) => r.outcome)).toEqual(["ready"]);
  });

  it("releases the claim as failed and stops when authoring fails, without rejecting", async () => {
    const w = world("p-down", { llm: failingLlm(new Error("gateway 503")) });

    await expect(
      continueQuizGeneration({ participantId: "p-down", roomId: ROOM }, w.deps)
    ).resolves.toBeUndefined();

    expect(w.claims.claimed).toEqual(["participant:p-down:batch:1"]);
    expect(w.claims.released).toEqual([
      { scope: "participant:p-down:batch:1", outcome: "failed" },
    ]);
    expect(w.blocks.calls.saveBatch).toHaveLength(0);
    // No fallback rows were written in the model's place.
    expect(w.blocks.rows.size).toBe(0);
  });

  it("never rejects when the repository itself fails", async () => {
    const w = world("p-db");
    const exploding: GeneratedBlockRepository = {
      ...w.deps.generatedBlocks,
      async byParticipant() {
        throw new Error("database unreachable");
      },
    };

    await expect(
      continueQuizGeneration(
        { participantId: "p-db", roomId: ROOM },
        { ...w.deps, generatedBlocks: exploding }
      )
    ).resolves.toBeUndefined();
    expect(w.model.sent).toHaveLength(0);
  });

  it("plans batch 2 around the domains of an adopted batch 1", async () => {
    // Batch 1 came from the pool: its domains are batch 2's own plan, so every
    // position of batch 2 would collide without the substitution.
    const adoptedDomains = assignmentsForBatch("p-adopt", 2).map(
      (a) => a.domain
    );
    const seed: StoredBlock[] = assignmentsForBatch("p-adopt", 1).map(
      (plan, i) => ({
        block: blockFor({ ...plan, domain: adoptedDomains[i] }),
        source: "generated",
      })
    );
    const w = world("p-adopt", { seed });

    await continueQuizGeneration(
      { participantId: "p-adopt", roomId: ROOM },
      w.deps
    );

    const batchTwo = w.model.authorCalls()[0];
    expect(batchTwo.id).toBe("quiz.author.batch-2");
    for (const domain of adoptedDomains) {
      expect(batchTwo.prompt).not.toContain(`domain=${domain},`);
    }
  });

  it("plans batch 3 around batch 2's plan as well, since the two are written at once", async () => {
    // Batch 1 took batch 3's own settings, so batch 3 has to substitute -- and
    // must not substitute onto anything batch 2 is about to write.
    const takenDomains = assignmentsForBatch("p-par", 3).map((a) => a.domain);
    const seed: StoredBlock[] = assignmentsForBatch("p-par", 1).map(
      (plan, i) => ({
        block: blockFor({ ...plan, domain: takenDomains[i] }),
        source: "generated",
      })
    );
    const w = world("p-par", { seed });

    await continueQuizGeneration(
      { participantId: "p-par", roomId: ROOM },
      w.deps
    );

    const [two, three] = w.model.authorCalls();
    expect(two.id).toBe("quiz.author.batch-2");
    expect(three.id).toBe("quiz.author.batch-3");
    const offLimits = new Set([...takenDomains, ...promptDomains(two.prompt)]);
    for (const domain of promptDomains(three.prompt)) {
      expect(offLimits.has(domain)).toBe(false);
    }
  });
});

describe("topUpQuizPool", () => {
  it("authors one whole form when the room is one below target and a slot is won", async () => {
    const pool = fakePool({
      unclaimed: [[]],
      recent: ["La cajera del banco responde solo en rimas."],
    });
    const w = world("unused", { pool });

    await expect(
      topUpQuizPool({ roomId: ROOM, target: 2 }, w.deps)
    ).resolves.toBeUndefined();

    expect(w.claims.claimed).toEqual([`pool:${ROOM}:0`]);
    expect(w.claims.released).toEqual([
      { scope: `pool:${ROOM}:0`, outcome: "ready" },
    ]);
    expect(pool.added).toHaveLength(1);
    const form = pool.added[0];
    expect(form.map((b) => b.position)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1)
    );
    expect(form.map((b) => b.batch)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3,
    ]);
    for (const block of form) {
      expect(() => validateBlock(block)).not.toThrow();
    }
    // Batch 1 is told the room's scenes; 2 and 3 are told batch 1's as well.
    const authors = w.model.authorCalls();
    expect(authors.map((a) => a.id)).toEqual([
      "quiz.author.batch-1",
      "quiz.author.batch-2",
      "quiz.author.batch-3",
    ]);
    expect(authors[0].prompt).toContain("responde solo en rimas");
    expect(authors[1].prompt).toContain(SCENARIOS[0]);
    expect(authors[2].prompt).toContain(SCENARIOS[0]);
    // Nothing was written to any participant.
    expect(w.blocks.calls.saveBatch).toHaveLength(0);
  });

  it("fills the whole deficit at once, one slot per form", async () => {
    const pool = fakePool({ unclaimed: [[]] });
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM, target: 4 }, w.deps);

    // One warm, target four: three forms, three slots, three releases.
    expect(w.claims.claimed).toEqual([
      `pool:${ROOM}:0`,
      `pool:${ROOM}:1`,
      `pool:${ROOM}:2`,
    ]);
    expect(w.claims.released.map((r) => r.outcome)).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
    expect(pool.added).toHaveLength(3);
    expect(pool.unclaimed).toHaveLength(4);
  });

  it("scales with the room: a deficit of twelve is twelve forms at once", async () => {
    // The room's throughput IS this number -- one form is ~130 s of waiting on
    // the gateway, so four slots is 1.85 forms a minute and a hundred people
    // outrun it ten times over (the event's failure mode).
    const pool = fakePool();
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM, target: 12, slots: 12 }, w.deps);

    expect(w.claims.claimed).toHaveLength(12);
    expect(pool.added).toHaveLength(12);
    expect(pool.unclaimed).toHaveLength(12);
    for (const form of pool.added) {
      expect(form.map((b) => b.position)).toHaveLength(15);
    }
  });

  it("never opens more slots than the deficit", async () => {
    const pool = fakePool({ unclaimed: [[], []] });
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM, target: 3, slots: 12 }, w.deps);

    expect(w.claims.claimed).toEqual([`pool:${ROOM}:0`]);
    expect(pool.added).toHaveLength(1);
  });

  it("does nothing when the room already holds the target", async () => {
    const pool = fakePool({
      unclaimed: Array.from({ length: POOL_TARGET }, () => []),
    });
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM }, w.deps);
    // POOL_TARGET warm and POOL_TARGET asked for: no deficit, no claim probe.

    expect(w.claims.claimed).toHaveLength(0);
    expect(w.model.sent).toHaveLength(0);
    expect(pool.added).toHaveLength(0);
  });

  it("does nothing when the target is zero", async () => {
    const pool = fakePool();
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM, target: 0 }, w.deps);

    expect(w.claims.claimed).toHaveLength(0);
    expect(w.model.sent).toHaveLength(0);
  });

  it("tries every slot and does nothing when all are held", async () => {
    const pool = fakePool();
    const w = world("unused", { pool, lose: () => true });

    await topUpQuizPool({ roomId: ROOM, target: 4, slots: 4 }, w.deps);

    expect(w.claims.claimed).toEqual([
      `pool:${ROOM}:0`,
      `pool:${ROOM}:1`,
      `pool:${ROOM}:2`,
      `pool:${ROOM}:3`,
    ]);
    expect(w.model.sent).toHaveLength(0);
    expect(pool.added).toHaveLength(0);
  });

  it("does nothing when the room has no slots", async () => {
    const pool = fakePool();
    const w = world("unused", { pool });

    await topUpQuizPool({ roomId: ROOM, target: 4, slots: 0 }, w.deps);

    expect(w.claims.claimed).toHaveLength(0);
    expect(w.model.sent).toHaveLength(0);
  });

  it("takes the first free slot when earlier ones are held", async () => {
    const pool = fakePool();
    const w = world("unused", {
      pool,
      lose: (scope) => scope.endsWith(":0") || scope.endsWith(":1"),
    });

    await topUpQuizPool({ roomId: ROOM, target: 1 }, w.deps);

    expect(w.claims.claimed).toEqual([
      `pool:${ROOM}:0`,
      `pool:${ROOM}:1`,
      `pool:${ROOM}:2`,
    ]);
    expect(w.claims.released).toEqual([
      { scope: `pool:${ROOM}:2`, outcome: "ready" },
    ]);
    expect(pool.added).toHaveLength(1);
  });

  it("re-samples a later batch once when its first attempt fails outright", async () => {
    const pool = fakePool();
    const inner = world("unused", { pool });
    // generateQuizBatch retries a throwing model three times on its own, so
    // three rejections exhaust the first batch-3 attempt; the pool's own
    // retry is what then saves the form instead of discarding 150 s of work.
    let rejected = 0;
    const stubborn: LlmPort = {
      generate(request) {
        if (request.id === "quiz.author.batch-3" && rejected < 3) {
          rejected += 1;
          return Promise.reject(new Error("gateway 502"));
        }
        return inner.model.llm.generate(request);
      },
    };

    await topUpQuizPool(
      { roomId: ROOM, target: 1, slots: 1 },
      { ...inner.deps, llm: stubborn }
    );

    expect(rejected).toBe(3);
    expect(pool.added).toHaveLength(1);
    expect(pool.added[0].map((b) => b.position)).toHaveLength(15);
    expect(inner.claims.released).toEqual([
      { scope: `pool:${ROOM}:0`, outcome: "ready" },
    ]);
  });

  it("releases the slot as failed and resolves when the model is down", async () => {
    const pool = fakePool();
    const w = world("unused", {
      pool,
      llm: failingLlm(new Error("gateway 503")),
    });

    await expect(
      topUpQuizPool({ roomId: ROOM, target: 1 }, w.deps)
    ).resolves.toBeUndefined();

    expect(w.claims.released).toEqual([
      { scope: `pool:${ROOM}:0`, outcome: "failed" },
    ]);
    expect(pool.added).toHaveLength(0);
  });
});

describe("adoptPoolSet", () => {
  it("stores the adopted form as the participant's generated rows and returns true", async () => {
    const form = [1, 2, 3].flatMap((batch) =>
      assignmentsForBatch("pool:seed", batch).map((plan) => blockFor(plan))
    );
    const pool = fakePool({ unclaimed: [form] });
    const w = world("p-new", { pool });

    await expect(
      adoptPoolSet({ participantId: "p-new", roomId: ROOM }, w.deps)
    ).resolves.toBe(true);

    expect(pool.adopted).toEqual([{ roomId: ROOM, participantId: "p-new" }]);
    expect(w.blocks.calls.saveBatch).toEqual([
      { id: "p-new", positions: Array.from({ length: 15 }, (_, i) => i + 1) },
    ]);
    for (let position = 1; position <= 15; position++) {
      const stored = w.blocks.rows.get(`p-new:${position}`);
      expect(stored?.source).toBe("generated");
      expect(stored?.block).toEqual(form[position - 1]);
    }
    expect(w.model.sent).toHaveLength(0);
    expect(w.claims.claimed).toHaveLength(0);
  });

  it("copes with a set from before whole forms: batch 1 alone is stored", async () => {
    const set = assignmentsForBatch("pool:seed", 1).map((plan) =>
      blockFor(plan)
    );
    const pool = fakePool({ unclaimed: [set] });
    const w = world("p-old", { pool });

    await expect(
      adoptPoolSet({ participantId: "p-old", roomId: ROOM }, w.deps)
    ).resolves.toBe(true);

    expect(w.blocks.calls.saveBatch).toEqual([
      { id: "p-old", positions: [1, 2, 3, 4, 5] },
    ]);
  });

  it("returns false when the pool is empty, storing nothing", async () => {
    const w = world("p-empty");

    await expect(
      adoptPoolSet({ participantId: "p-empty", roomId: ROOM }, w.deps)
    ).resolves.toBe(false);

    expect(w.blocks.calls.saveBatch).toHaveLength(0);
  });

  it("returns false rather than rejecting when the pool fails", async () => {
    const w = world("p-boom");
    const exploding: QuizPoolRepository = {
      ...w.deps.pool,
      async adopt() {
        throw new Error("database unreachable");
      },
    };

    await expect(
      adoptPoolSet(
        { participantId: "p-boom", roomId: ROOM },
        { ...w.deps, pool: exploding }
      )
    ).resolves.toBe(false);
  });
});
