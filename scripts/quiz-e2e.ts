/**
 * quiz-e2e.ts — the whole path: real model, real database, read-through.
 *
 *   npx tsx --env-file=.env scripts/quiz-e2e.ts <participantId> <roomId>
 *
 * Proves the three things unit tests cannot: blocks persist, a second run of
 * the chain is a no-op that never touches the model, and batch 2's prompt
 * carries batch 1's scenarios so the two cannot share a joke.
 *
 * The participant must exist (generated_blocks references it); pass the id of
 * a row registered on the dev branch and the id of its room.
 */

import { serverDeps } from "../src/lib/composition";
import { continueQuizGeneration } from "../src/lib/use-cases/ensure-quiz-batch";

const participantId = process.argv[2];
const roomId = process.argv[3];

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const value = await fn();
  console.log(
    `${label.padEnd(28)} ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
  return value;
}

async function main(): Promise<void> {
  if (!participantId || !roomId) {
    console.error("usage: quiz-e2e.ts <participantId> <roomId>");
    process.exit(1);
  }
  const deps = serverDeps();
  console.log(`participant ${participantId} · room ${roomId}\n`);

  const before = await deps.generatedBlocks.byParticipant(participantId);
  console.log(`rows before:         ${before.length}`);

  // The chain returns nothing: what it wrote is read back from the repository,
  // the same way the quiz page reads it.
  await timed("chain · cold (authors)", () =>
    continueQuizGeneration({ participantId, roomId }, deps)
  );
  const first = await deps.generatedBlocks.byBatch(participantId, 1);
  const batch2 = await deps.generatedBlocks.byBatch(participantId, 2);

  // A second run finds every batch present, wins no claim and writes nothing.
  await timed("chain · warm (no-op)", () =>
    continueQuizGeneration({ participantId, roomId }, deps)
  );
  const again = await deps.generatedBlocks.byBatch(participantId, 1);

  // Postgres normalises jsonb key order, so a raw JSON.stringify comparison
  // reports a difference that does not exist. Compare canonical content.
  const canon = (rows: typeof first) =>
    rows.map(({ block: b }) =>
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
      canon(first).join("#") === canon(again).join("#") ? "YES" : "NO"
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
  for (const { block } of first) {
    console.log(`  ${block.position}. ${block.scenario}`);
  }
  console.log("batch 2:");
  for (const { block } of batch2) {
    console.log(`  ${block.position}. ${block.scenario}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
