import { POOL_TARGET } from "@/lib/use-cases/ensure-quiz-batch";

/**
 * How many whole forms `/intake` and `/qr` keep warm per room, read from the
 * environment in the one place the driving adapters share (docs/domain.md
 * D20). `HOOKAI_QUIZ_POOL_TARGET` overrides the use case's default; `0` turns
 * warming off, which is what the e2e web server sets so a test run does not
 * spend the gateway on forms nobody will answer (the specs seed their own).
 *
 * Read here and passed in, never inside the use case: the core does not read
 * `process.env` (`hexagonal-architecture`).
 */
export function poolTarget(): number {
  const raw = process.env.HOOKAI_QUIZ_POOL_TARGET;
  if (raw === undefined || raw.trim() === "") return POOL_TARGET;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : POOL_TARGET;
}
