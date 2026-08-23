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
import { generateObject, NoObjectGeneratedError, RetryError } from "ai";

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

/** The AI SDK's portable reasoning levels; the gateway maps each to its provider. */
export type GatewayReasoning =
  | "provider-default"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

const REASONING_LEVELS: readonly string[] = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * The least thinking the model is allowed, not none.
 *
 * With the provider default, Sonnet 5 thinks adaptively: on 2026-08-23 it spent
 * 7,342 of an 8,192-token output cap thinking about a five-block batch, ran out
 * mid-JSON (`finishReason: length`) after ~76 s, and every position fell back to
 * the committed instrument — then the `after()` prefetch of the next batch did
 * it again and pushed the request past `maxDuration`. Measured the same day
 * against the author prompt: `none` answers in ~14 s but doubles the focus
 * pillar in most blocks; `minimal` and `low` author in ~15–30 s and pass
 * structure on 4–5 of 5 first time. The judge→repair loop carries the rest
 * (docs/quiz-generation.md §7). Raise it with `AI_REASONING=low` if quality
 * slips; the token cap below is not the lever.
 */
export const DEFAULT_REASONING: GatewayReasoning = "minimal";

function reasoningFromEnv(): GatewayReasoning | undefined {
  const value = process.env.AI_REASONING;
  return value !== undefined && REASONING_LEVELS.includes(value)
    ? (value as GatewayReasoning)
    : undefined;
}

export interface GatewayLlmOptions {
  /** `provider/model`. Defaults to `AI_MODEL` in the environment, then Sonnet. */
  model?: string;
  fallbacks?: string[];
  /**
   * How much the model may think before answering. Defaults to `AI_REASONING`
   * in the environment, then `DEFAULT_REASONING`.
   */
  reasoning?: GatewayReasoning;
  /**
   * Headroom for a five-block batch. The cap is shared between thinking and
   * the answer, so read it together with `reasoning`.
   */
  maxOutputTokens?: number;
  /** Low but non-zero: these are creative prompts, not extractions. */
  temperature?: number;
  /** Abort a call that has clearly hung, so a batch cannot pin an invocation. */
  timeoutMs?: number;
  /** The SDK's own retries on 429/5xx before the call is reported failed. */
  maxRetries?: number;
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
  const reasoning =
    options.reasoning ?? reasoningFromEnv() ?? DEFAULT_REASONING;
  // Sonnet 5 allows 128k. A five-block batch is ~1k tokens of JSON; 16k leaves
  // room for a non-"none" reasoning level without inviting a 90 s call.
  const maxOutputTokens = options.maxOutputTokens ?? 16_384;
  const temperature = options.temperature ?? 0.9;
  // A batch authors in 15–30 s at minimal reasoning; 60 s is a hung call, and
  // the chain behind it has two more batches to fit in its budget.
  const timeoutMs = options.timeoutMs ?? 60_000;
  // Explicit rather than the SDK default, because the deadline above cuts a
  // long backoff short and the number of attempts is what the log then names.
  const maxRetries = options.maxRetries ?? 2;

  return {
    async generate<T>(request: LlmRequest<T>): Promise<T> {
      const signal = AbortSignal.timeout(timeoutMs);
      const started = Date.now();
      try {
        const { object, warnings, response, usage } = await generateObject({
          model: gateway(model),
          schema: request.schema,
          prompt: request.prompt,
          maxOutputTokens,
          temperature,
          reasoning,
          maxRetries,
          abortSignal: signal,
          providerOptions: { gateway: { models: fallbacks } },
        });
        // Which model actually answered is the one fact a fallback hides: the
        // gateway may have routed past Sonnet, and only this line says so.
        console.warn(
          `[llm] ${request.id} answered by ${response.modelId ?? model} in ` +
            `${Math.round((Date.now() - started) / 1000)} s ` +
            `(${usage.outputTokens ?? "?"} output tokens` +
            `${request.note ? `; ${request.note}` : ""})`
        );
        for (const warning of warnings ?? []) {
          console.warn(
            `[llm] ${request.id} warning: ${
              warning.type === "other"
                ? warning.message
                : JSON.stringify(warning)
            }`
          );
        }
        // `generateObject` already validated, but it infers its own result type;
        // parsing again is what makes the returned value provably a `T`.
        return request.schema.parse(object);
      } catch (error) {
        // The interesting failure: the model answered but not in the shape
        // asked for. Surfacing it distinctly is what lets a caller decide
        // between retrying and falling back.
        const failure = NoObjectGeneratedError.isInstance(error)
          ? new Error(
              "model did not return an object matching the schema " +
                `(finishReason: ${error.finishReason ?? "unknown"}, ` +
                `output tokens: ${error.usage?.outputTokens ?? "?"}, ` +
                `of which reasoning: ${
                  error.usage?.outputTokenDetails?.reasoningTokens ?? "?"
                })`
            )
          : RetryError.isInstance(error)
            ? // The SDK retries 429/5xx with backoff; when `timeoutMs` cuts
              // that short the surfaced message is only "Delay was aborted",
              // so name the attempts that led there.
              new Error(
                `${error.message} (reason: ${error.reason}; attempts: ${
                  error.errors
                    .map((e) => (e instanceof Error ? e.message : String(e)))
                    .join(" | ") || "none"
                })`
              )
            : error;
        // A hung gateway call or a retry backoff cut short both surface as a
        // bare AbortError; say whose deadline it was.
        const timedOut = signal.aborted
          ? new Error(
              `gave up after ${timeoutMs} ms (${
                failure instanceof Error ? failure.message : String(failure)
              })`
            )
          : failure;
        const wrapped = new LlmGenerationError(request.id, timedOut);
        // The generation chain reports a failed batch as one warning of its
        // own; this line is the only trace of *why* the model failed — dead,
        // slow, truncated, or routed to a fallback that could not keep the
        // schema.
        console.warn(`[llm] ${wrapped.message}`);
        throw wrapped;
      }
    },
  };
}

/**
 * True when a real model call can be made in this process.
 *
 * Read before scheduling generation so a missing key is reported at the door
 * rather than as a failed batch halfway through a participant's quiz. On
 * Vercel, OIDC can stand in for the key at runtime, so this is a hint rather
 * than a guarantee — the call itself is the real check.
 */
export function gatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  );
}
