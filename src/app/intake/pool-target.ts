import { POOL_SLOTS, POOL_TARGET } from "@/lib/use-cases/ensure-quiz-batch";

/**
 * The room's warm-form settings, read from the environment in the one place
 * the driving adapters share (docs/domain.md D20). `/intake` and `/qr` both
 * pass them into `topUpQuizPool`; the core reads no `process.env`
 * (`hexagonal-architecture`).
 *
 * `HOOKAI_QUIZ_POOL_TARGET` — how many whole forms stay warm per room. `0`
 * turns warming off, which is what the e2e web server sets so a test run does
 * not spend the gateway on forms nobody will answer (the specs seed their own).
 *
 * `HOOKAI_QUIZ_POOL_SLOTS` — how many are authored at once, which IS the
 * room's throughput: one form is ~130 s of waiting on the gateway, so twelve
 * slots is ~5.5 forms a minute. Raise it for a bigger room; it costs in-flight
 * HTTP calls, not CPU.
 */
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function poolTarget(): number {
  return positiveInt("HOOKAI_QUIZ_POOL_TARGET", POOL_TARGET);
}

export function poolSlots(): number {
  return positiveInt("HOOKAI_QUIZ_POOL_SLOTS", POOL_SLOTS);
}
