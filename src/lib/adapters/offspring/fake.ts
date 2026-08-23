import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OffspringImage, OffspringStudio } from "@/lib/ports/offspring";

/**
 * The `OffspringStudio` used by Playwright and by a local checkout with no
 * `OPENAI_API_KEY`.
 *
 * It returns a committed placeholder baby (`public/match/baby-placeholder.jpg`)
 * so `/match` renders a real third circle with no network, no credential and
 * nothing to clean up — the same role the fake `PhotoStore` plays for the photo
 * step. It is deliberately NOT what production uses: the whole point of the
 * screen is that the face is the participants', which only the model can make.
 *
 * The read is guarded so a missing asset degrades to a 1×1 pixel rather than
 * throwing — the fake exists precisely so the screen never depends on anything.
 */

const PLACEHOLDER_PATH = join(
  process.cwd(),
  "public",
  "match",
  "baby-placeholder.jpg"
);

/** A 1×1 transparent PNG — the last resort if the committed asset is missing. */
const PIXEL = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  )
);

export function createFakeOffspringStudio(): OffspringStudio {
  return {
    async imagine(): Promise<OffspringImage> {
      try {
        const bytes = new Uint8Array(await readFile(PLACEHOLDER_PATH));
        return { bytes, contentType: "image/jpeg" };
      } catch {
        return { bytes: PIXEL, contentType: "image/png" };
      }
    },
  };
}
