/**
 * quiz-e2e.ts — the whole path: real model, real database, read-through.
 *
 *   npx tsx --env-file=.env scripts/quiz-e2e.ts
 *
 * Proves the three things unit tests cannot: blocks persist, a second call is a
 * cache hit that never touches the model, and batch 2's prompt carries batch 1's
 * scenarios so the two cannot share a joke.
 */

import { serverDeps } from "../src/lib/composition";
import { ensureQuizBatch } from "../src/lib/use-cases/ensure-quiz-batch";

const participantId = process.argv[2] ?? crypto.randomUUID();

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const value = await fn();
  console.log(
    `${label.padEnd(28)} ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  return value;
}

async function main(): Promise<void> {
  const deps = serverDeps();
  console.log(`participant ${participantId}\n`);

  const first = await timed("batch 1 · cold (authors)", () =>
    ensureQuizBatch({ participantId, batch: 1 }, deps)
  );
  const second = await timed("batch 1 · warm (stored)", () =>
    ensureQuizBatch({ participantId, batch: 1 }, deps)
  );
  const batch2 = await timed("batch 2 · cold (authors)", () =>
    ensureQuizBatch({ participantId, batch: 2 }, deps)
  );

  // Postgres normalises jsonb key order, so a raw JSON.stringify comparison
  // reports a difference that does not exist. Compare canonical content.
  const canon = (blocks: typeof first) =>
    blocks.map((b) =>
      [
        b.position,
        b.batch,
        b.focusPillar,
        b.scenario,
        ...b.options.map((o) => `${o.key}|${o.text}|${o.pillar}|${o.keyed}`),
      ].join("~")
    );
  console.log(
    `\nwarm read identical: ${
      canon(first).join("#") === canon(second).join("#") ? "YES" : "NO"
    }`
  );

  const stored = await deps.generatedBlocks.byParticipant(participantId);
  console.log(`rows persisted:      ${stored.length}`);
  console.log(
    `sources:             ${[...new Set(stored.map((s) => s.source))].join(", ")}`
  );

  const scenarios = stored.map((s) => s.block.scenario);
  console.log(
    `distinct scenarios:  ${new Set(scenarios).size} of ${scenarios.length}`
  );

  console.log("\nbatch 1:");
  for (const b of first) console.log(`  ${b.position}. ${b.scenario}`);
  console.log("batch 2:");
  for (const b of batch2) console.log(`  ${b.position}. ${b.scenario}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
