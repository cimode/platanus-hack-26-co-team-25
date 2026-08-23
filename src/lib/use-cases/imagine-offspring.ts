import type { OffspringStudio, ParentPhoto } from "../ports/offspring";

/**
 * imagine-offspring.ts — the child of two matched participants (CONTEXT.md §3
 * step 6).
 *
 * Given two parent faces it asks the `OffspringStudio` for one blended baby and
 * returns it as a `data:` URL, so the `/match` screen can drop it straight into
 * an `<img>` with no storage round trip. The bytes are small (a compressed
 * JPEG), and the image is shown to exactly one viewer once, so inlining beats
 * persisting it — this is a reveal, not a record.
 *
 * The studio is a port: this file never learns whether a model or a committed
 * placeholder answered, which is what lets it be tested with a stub and run
 * with no `OPENAI_API_KEY`.
 */

export interface ImagineOffspringInput {
  parents: readonly ParentPhoto[];
}

export interface ImagineOffspringResult {
  /** `data:<type>;base64,<...>` — ready for an `<img src>`. */
  imageUrl: string;
}

export interface ImagineOffspringDeps {
  offspring: OffspringStudio;
}

export async function imagineOffspring(
  input: ImagineOffspringInput,
  deps: ImagineOffspringDeps
): Promise<ImagineOffspringResult> {
  const image = await deps.offspring.imagine({ parents: input.parents });
  const base64 = Buffer.from(image.bytes).toString("base64");
  return { imageUrl: `data:${image.contentType};base64,${base64}` };
}
