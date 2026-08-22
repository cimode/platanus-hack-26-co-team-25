import {
  hashPrompt,
  type LlmFixture,
  type LlmPort,
  type LlmRequest,
} from "../../ports/llm";

/**
 * Turns synchronous throws into rejections.
 *
 * The real client is async, so a fake that throws synchronously would let
 * `await llm.generate(...)` inside a try/catch behave differently in tests than
 * in production. Every failure path here must be a rejection.
 */
function asPromise<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
}

export class FixtureMissingError extends Error {
  constructor(id: string, available: string[]) {
    super(
      `No LLM fixture for id "${id}".\n` +
        `Available: ${available.length ? available.join(", ") : "(none)"}\n` +
        `Record one with \`npm run fixtures:record\`, or use stubLlm() for a ` +
        `hand-written response.`
    );
    this.name = "FixtureMissingError";
  }
}

export class FixtureSchemaError extends Error {
  constructor(id: string, detail: string) {
    super(
      `LLM fixture "${id}" no longer matches its schema:\n${detail}\n` +
        `The schema changed since this fixture was recorded. Re-record it, or ` +
        `fix the schema.`
    );
    this.name = "FixtureSchemaError";
  }
}

export interface FixtureLlmOptions {
  /**
   * What to do when the live prompt differs from the one recorded.
   *
   * Defaults to "warn". A fixture whose prompt has drifted is still usually
   * useful -- the response shape rarely changes when you reword an
   * instruction -- but you want to know. Set "throw" in CI if you would rather
   * be strict, or "ignore" while actively iterating on prompts.
   */
  onPromptDrift?: "warn" | "throw" | "ignore";
  /** Injected for testability. Defaults to console.warn. */
  warn?: (message: string) => void;
}

/**
 * An `LlmPort` that replays recorded responses instead of calling a model.
 *
 * Deterministic, free, and offline -- which is what makes it usable in CI. The
 * responses are real model output rather than what we imagined the model
 * returns, which is the whole reason to record rather than hand-write mocks.
 *
 * Crucially it still runs schema validation, so a fixture that stops matching
 * its schema fails loudly. That turns stale fixtures from a silent problem into
 * a red test.
 */
export function createFixtureLlm(
  fixtures: readonly LlmFixture[],
  options: FixtureLlmOptions = {}
): LlmPort {
  const { onPromptDrift = "warn", warn = console.warn } = options;
  const byId = new Map(fixtures.map((f) => [f.id, f]));

  return {
    generate<T>(request: LlmRequest<T>): Promise<T> {
      return asPromise(() => {
        const fixture = byId.get(request.id);
        if (!fixture) {
          throw new FixtureMissingError(request.id, [...byId.keys()]);
        }

        const liveHash = hashPrompt(request.prompt);
        if (liveHash !== fixture.promptHash && onPromptDrift !== "ignore") {
          const message =
            `LLM fixture "${request.id}" was recorded against a different ` +
            `prompt (recorded ${fixture.promptHash}, live ${liveHash}). ` +
            `Consider re-recording.`;
          if (onPromptDrift === "throw") throw new Error(message);
          warn(message);
        }

        const parsed = request.schema.safeParse(fixture.response);
        if (!parsed.success) {
          throw new FixtureSchemaError(
            request.id,
            JSON.stringify(parsed.error.issues, null, 2)
          );
        }
        return parsed.data;
      });
    },
  };
}

/**
 * A hand-written `LlmPort` for tests that care about a specific shape rather
 * than realistic output -- error paths, empty results, boundary values.
 *
 * Prefer `createFixtureLlm` when you are testing "does the engine handle real
 * model output". Use this when you are testing "does the engine handle THIS".
 */
export function stubLlm(
  responses: Record<string, unknown> | ((id: string) => unknown)
): LlmPort {
  const lookup =
    typeof responses === "function" ? responses : (id: string) => responses[id];

  return {
    generate<T>(request: LlmRequest<T>): Promise<T> {
      return asPromise(() => {
        const value = lookup(request.id);
        if (value === undefined) {
          throw new FixtureMissingError(
            request.id,
            typeof responses === "function"
              ? ["(dynamic)"]
              : Object.keys(responses)
          );
        }
        const parsed = request.schema.safeParse(value);
        if (!parsed.success) {
          throw new FixtureSchemaError(
            request.id,
            JSON.stringify(parsed.error.issues, null, 2)
          );
        }
        return parsed.data;
      });
    },
  };
}

/** An `LlmPort` that always rejects. For testing failure handling. */
export function failingLlm(error = new Error("llm unavailable")): LlmPort {
  return {
    generate<T>(): Promise<T> {
      return Promise.reject(error);
    },
  };
}
