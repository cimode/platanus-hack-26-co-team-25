/**
 * quiz-smoke.ts — author one real batch against AI Gateway and print it.
 *
 *   npx tsx --env-file=.env scripts/quiz-smoke.ts [participantId] [batch]
 *
 * Exists to answer the questions no unit test can: how long does a batch
 * actually take, does the model reliably return four correctly-keyed pillars,
 * and are the questions any good in Spanish. Run it after touching
 * `src/lib/domain/quiz/authoring.ts` — that file is the prompt.
 */

import { createGatewayLlm } from "../src/lib/adapters/llm/gateway";
import { assignmentsForBatch } from "../src/lib/domain/quiz/assignments";
import { generateQuizBatch } from "../src/lib/use-cases/generate-quiz-batch";

const participantId = process.argv[2] ?? "smoke-participant-1";
const batch = Number(process.argv[3] ?? 1);

async function main(): Promise<void> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error("AI_GATEWAY_API_KEY is not set. Pass --env-file=.env");
    process.exit(1);
  }

  const plan = assignmentsForBatch(participantId, batch);
  console.log(`participant ${participantId} · batch ${batch}`);
  console.log(
    `model      ${process.env.AI_MODEL ?? "anthropic/claude-sonnet-5"}`
  );
  console.log(
    `plan       ${plan.map((a) => `${a.position}:${a.focusPillar}/${a.domain}`).join("  ")}\n`
  );

  const started = Date.now();
  const result = await generateQuizBatch(
    { participantId, batch },
    { llm: createGatewayLlm() }
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  for (const block of result.blocks) {
    const fellBack = result.fellBackAt.includes(block.position);
    console.log(
      `── ${block.position}. [${block.focusPillar}] ${fellBack ? "(FALLBACK) " : ""}${block.scenario}`
    );
    for (const option of block.options) {
      const mark = option.keyed === "reversed" ? "◀" : " ";
      console.log(
        `   ${mark} ${option.key}) ${option.text}`.padEnd(56) +
          `· ${option.pillar}`
      );
    }
    console.log();
  }

  console.log(`elapsed     ${elapsed}s`);
  console.log(`repaired    ${result.repairedAt.join(", ") || "none"}`);
  console.log(`fell back   ${result.fellBackAt.join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
