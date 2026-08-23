/**
 * The offspring-image port (CONTEXT.md §3 step 6, AUDIT.md S17), owned by the
 * core.
 *
 * "How would our child look" is the comedic peak of the romantic lens: two real
 * faces in, one imagined baby out. The generation runs against an image model
 * in production (`adapters/offspring/openai.ts`) and against a committed
 * placeholder in tests and in a local checkout without `OPENAI_API_KEY`
 * (`adapters/offspring/fake.ts`); the use case knows neither.
 * `src/lib/composition.ts` decides which adapter implements this, and nothing
 * under `src/lib/{domain,use-cases,ports}` may import one.
 *
 * The same seam the `LlmPort` establishes for text: the engine takes a port as
 * a parameter and never learns which model — or whether any model at all —
 * answered.
 */

/** One parent's face, as the bytes the intake photo step already produced. */
export interface ParentPhoto {
  bytes: Uint8Array;
  /** `image/jpeg | image/png | image/webp` — the set the photo step admits. */
  contentType: string;
}

/** The imagined child, as raw bytes the caller turns into a URL. */
export interface OffspringImage {
  bytes: Uint8Array;
  contentType: string;
}

export interface OffspringStudio {
  /**
   * Imagine the child of the given parents. Implementations validate the
   * result before returning, so callers can trust the bytes are a real image.
   *
   * `parents` is exactly two for the romantic lens; more is not an error the
   * caller should construct, and an adapter may merge whatever it is handed.
   */
  imagine(input: { parents: readonly ParentPhoto[] }): Promise<OffspringImage>;
}
