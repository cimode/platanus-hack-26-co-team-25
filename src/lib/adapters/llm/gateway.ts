/**
 * gateway.ts — the real `LlmPort`, over Vercel AI Gateway.
 *
 * The seam is `src/lib/ports/llm.ts`: engine and use-case code takes an
 * `LlmPort` as a parameter and never learns which model answered. This is the
 * only module in the repo allowed to import an AI SDK — `biome.json` fails the
 * build if anything under `domain/`, `use-cases/` or `ports/` does.
 *
 * Why the gateway rather than a provider SDK:
 *   · `generateObject({ schema })` is `LlmPort.generate`'s signature exactly —
 *     zod in, validated value out. A provider SDK needs hand-rolled tool-use to
 *     get structured output.
 *   · model id is a string, so swapping models is configuration
 *   · fallbacks, retries and per-call observability come with it
 *   · deployed on Vercel it can authenticate by OIDC; `AI_GATEWAY_API_KEY`
 *     covers local runs and CI
 */

import { gateway } from "@ai-sdk/gateway";
import { generateObject, NoObjectGeneratedError } from "ai";

import type { LlmPort, LlmRequest } from "../../ports/llm";

/** Sonnet is the quality/latency point this workload wants (docs/quiz-generation.md §7). */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

/**
 * Tried in order when the primary is unavailable. A model outage during the
 * demo must degrade to a different model, not to a participant staring at a
 * spinner.
 */
export const DEFAULT_FALLBACKS = [
  "openai/gpt-5.6-sol",
  "google/gemini-3.6-flash",
];

export interface GatewayLlmOptions {
  /** `provider/model`. Defaults to `AI_MODEL` in the environment, then Sonnet. */
  model?: string;
  fallbacks?: string[];
  /** Headroom for a five-block batch. */
  maxOutputTokens?: number;
  /** Low but non-zero: these are creative prompts, not extractions. */
  temperature?: number;
  /** Abort a call that has clearly hung, so a batch cannot pin an invocation. */
  timeoutMs?: number;
}

export class LlmGenerationError extends Error {
  constructor(id: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`LLM call "${id}" failed: ${detail}`);
    this.name = "LlmGenerationError";
    this.cause = cause;
  }
}

/**
 * An `LlmPort` backed by AI Gateway.
 *
 * Validates against the caller's schema before returning, exactly as the test
 * fakes in `fake.ts` do — so a schema change fails identically in production and
 * in tests, rather than only in one of them.
 */
export function createGatewayLlm(options: GatewayLlmOptions = {}): LlmPort {
  const model = options.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const fallbacks = options.fallbacks ?? DEFAULT_FALLBACKS;
  const maxOutputTokens = options.maxOutputTokens ?? 8192;
  const temperature = options.temperature ?? 0.9;
  const timeoutMs = options.timeoutMs ?? 90_000;

  return {
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const { object } = await generateObject({
          model: gateway(model),
          schema: request.schema,
          prompt: request.prompt,
          maxOutputTokens,
          temperature,
          abortSignal: signal,
          providerOptions: { gateway: { models: fallbacks } },
        });
        // `generateObject` already validated, but it infers its own result type;
        // parsing again is what makes the returned value provably a `T`.
        return request.schema.parse(object);
      } catch (error) {
        // The interesting failure: the model answered but not in the shape
        // asked for. Surfacing it distinctly is what lets a caller decide
        // between retrying and falling back.
        if (NoObjectGeneratedError.isInstance(error)) {
          throw new LlmGenerationError(
            request.id,
            new Error(`model did not return an object matching the schema`)
          );
        }
        throw new LlmGenerationError(request.id, error);
      }
    },
  };
}

/**
 * True when a real model call can be made in this process.
 *
 * Read before scheduling generation so a missing key degrades to the committed
 * fallback instrument at the door, rather than throwing halfway through a
 * participant's quiz. On Vercel, OIDC can stand in for the key at runtime, so
 * this is a hint rather than a guarantee — the call itself is the real check.
 */
export function gatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  );
}
