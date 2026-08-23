"use server";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDeps } from "@/lib/composition";
import type { ParentPhoto } from "@/lib/ports/offspring";
import { imagineOffspring } from "@/lib/use-cases/imagine-offspring";
import { DEMO_PAIR } from "./demo-pair";

/**
 * The `/match` server action (CONTEXT.md §3 step 6).
 *
 * A Server Action is a public HTTP endpoint, so it does not trust the client
 * with the faces: the demo pair is read from committed files on the server
 * (`public/match/parent-*.jpg`) and passed to the `imagineOffspring` use case,
 * which asks the `OffspringStudio` port for the blended baby. The action never
 * touches a model or the database itself — it reads two files and calls a use
 * case, and `src/lib/composition.ts` decides what a "studio" is.
 *
 * `public/match/**` is traced into this route's function by
 * `outputFileTracingIncludes` in `next.config.ts`, so the read works on Vercel
 * as well as under `next dev`.
 */

export type ImagineOffspringState =
  | { status: "idle" }
  | { status: "ready"; imageUrl: string }
  | { status: "error"; message: string };

async function parentPhoto(
  file: string,
  contentType: string
): Promise<ParentPhoto> {
  const bytes = new Uint8Array(
    await readFile(join(process.cwd(), "public", "match", file))
  );
  return { bytes, contentType };
}

export async function imagineOffspringAction(): Promise<ImagineOffspringState> {
  try {
    const parents = await Promise.all(
      DEMO_PAIR.map((person) => parentPhoto(person.file, person.contentType))
    );
    const { imageUrl } = await imagineOffspring({ parents }, serverDeps());
    return { status: "ready", imageUrl };
  } catch (error) {
    // The screen turns this into copy; the message is for the operator's logs.
    const message =
      error instanceof Error ? error.message : "unknown generation failure";
    return {
      status: "error",
      message: `No se pudo imaginar al bebé: ${message}`,
    };
  }
}
