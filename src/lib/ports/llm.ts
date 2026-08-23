import type { z } from "zod";

/**
 * The seam between the engine and the model.
 *
 * Every engine function takes an `LlmPort` rather than reaching for a client
 * directly. That is what makes the deterministic half of dipia testable: a
 * test passes a fake, production passes the real client, and neither knows the
 * difference. It also means the engine can be driven headless from a CLI, which
 * is how you iterate on prompts without clicking through the UI.
 *
 * Rule of thumb: if a module imports an SDK, it is not an engine module.
 */
export interface LlmPort {
  /**
   * Produce a value conforming to `schema`. Implementations are responsible for
   * validating before returning, so callers can trust the type.
   */
  generate<T>(request: LlmRequest<T>): Promise<T>;
}

export interface LlmRequest<T> {
  /**
   * Stable identifier for this call site, e.g. `"timeline.canonical-events"`.
   *
   * This is the fixture key. It is deliberately NOT a hash of the prompt: if it
   * were, every prompt tweak would invalidate every fixture and nobody would
   * re-record. Prompt drift is tracked separately -- see `promptHash` on the
   * stored fixture.
   */
  id: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Optional label for logs and eval reports. */
  note?: string;
}

/** A recorded model response, replayed by the fake in tests. */
export interface LlmFixture {
  id: string;
  /**
   * Hash of the prompt at record time. The fake warns when the live prompt no
   * longer matches, which is the only defence against a fixture quietly
   * describing a prompt you no longer send.
   */
  promptHash: string;
  /** Raw parsed JSON as returned by the model, before schema validation. */
  response: unknown;
  recordedAt: string;
  model?: string;
}

/**
 * Stable, dependency-free hash. Not cryptographic -- it only needs to detect
 * "this prompt changed", and it must be identical across record and replay.
 */
export function hashPrompt(prompt: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < prompt.length; i++) {
    const ch = prompt.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  const combined = (h2 >>> 0) * 4294967296 + (h1 >>> 0);
  return combined.toString(16).padStart(16, "0");
}
