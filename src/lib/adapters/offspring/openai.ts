import type {
  OffspringImage,
  OffspringStudio,
  ParentPhoto,
} from "@/lib/ports/offspring";

/**
 * openai.ts — the real `OffspringStudio`, over OpenAI's image edits endpoint.
 *
 * The seam is `src/lib/ports/offspring.ts`: use-case code takes an
 * `OffspringStudio` and never learns the model. This is the only offspring
 * module allowed to reach the network.
 *
 * Why the raw REST endpoint rather than the AI SDK:
 *   · the merge is an *edit* — two reference faces in, one blended baby out —
 *     which maps to `POST /v1/images/edits` with repeated `image[]` parts.
 *     That is the shape gpt-image-1 supports and the one measured to work
 *     (~18s, a plausible blend of both faces) before this was written.
 *   · one `fetch`, no dependency, full control over `output_format` so the
 *     data URL the use case builds stays small.
 *
 * The key is read from `OPENAI_API_KEY` and never interpolated into any error
 * string — those strings end up in logs.
 */

/** Measured at ~18s for a single edit; give it generous headroom under 120s. */
const DEFAULT_TIMEOUT_MS = 90_000;

/** gpt-image-1 is the edits-capable model this was measured against. */
const DEFAULT_MODEL = "gpt-image-1";

const IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";

/**
 * English on purpose: the model follows an English instruction more reliably,
 * and this text is never shown to a participant — only the resulting face is.
 * "One baby, centered, blends both" is the whole product ask (CONTEXT.md §3).
 */
const MERGE_PROMPT =
  "A warm studio portrait of the baby these two adults would have together: " +
  "a single chubby-cheeked, smiling infant that clearly blends both faces — " +
  "mix their skin tone, eye colour, hair colour and features. Soft warm " +
  "lighting, plain neutral background, wholesome family-photo style. Exactly " +
  "one baby, centred, facing the camera.";

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface OpenAiOffspringOptions {
  /** Defaults to `OPENAI_API_KEY`. */
  apiKey?: string;
  /** Defaults to `OPENAI_IMAGE_MODEL`, then gpt-image-1. */
  model?: string;
  timeoutMs?: number;
}

export class OffspringGenerationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "OffspringGenerationError";
    if (cause !== undefined) this.cause = cause;
  }
}

/** True when a real generation can be made in this process. */
export function openAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function partFor(photo: ParentPhoto): Blob {
  return new Blob([photo.bytes.slice()], {
    type: photo.contentType || "image/png",
  });
}

function filenameFor(photo: ParentPhoto, index: number): string {
  const ext = EXTENSIONS[photo.contentType] ?? "png";
  return `parent-${index}.${ext}`;
}

export function createOpenAiOffspringStudio(
  options: OpenAiOffspringOptions = {}
): OffspringStudio {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model =
    options.model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async imagine(input): Promise<OffspringImage> {
      if (!apiKey) {
        throw new OffspringGenerationError(
          "OPENAI_API_KEY is not set, so the offspring image cannot be " +
            "generated. Add it to .env (never commit it)."
        );
      }
      if (input.parents.length < 2) {
        throw new OffspringGenerationError(
          `imagine() needs two parent photos, got ${input.parents.length}.`
        );
      }

      const form = new FormData();
      form.append("model", model);
      form.append("prompt", MERGE_PROMPT);
      form.append("size", "1024x1024");
      form.append("n", "1");
      // JPEG keeps the returned data URL an order of magnitude smaller than the
      // default PNG — the use case inlines it into a single action response.
      form.append("output_format", "jpeg");
      form.append("output_compression", "80");
      input.parents.forEach((photo, index) => {
        form.append("image[]", partFor(photo), filenameFor(photo, index));
      });

      let response: Response;
      try {
        response = await fetch(IMAGES_EDITS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        throw new OffspringGenerationError(
          `The offspring image request to ${model} failed to complete.`,
          cause
        );
      }

      if (!response.ok) {
        // The body may name the reason (content policy, bad image); the key is
        // in the header, never the body, so this is safe to surface.
        const detail = await response.text().catch(() => "");
        throw new OffspringGenerationError(
          `The offspring image request to ${model} returned ${response.status}: ${detail.slice(0, 300)}`
        );
      }

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
      };
      const b64 = payload.data?.[0]?.b64_json;
      if (!b64) {
        throw new OffspringGenerationError(
          `${model} returned no image data for the offspring merge.`
        );
      }

      return {
        bytes: new Uint8Array(Buffer.from(b64, "base64")),
        contentType: "image/jpeg",
      };
    },
  };
}
