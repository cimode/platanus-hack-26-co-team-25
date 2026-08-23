import { describe, expect, it } from "vitest";
import type { OffspringStudio } from "../ports/offspring";
import { imagineOffspring } from "./imagine-offspring";

/**
 * `imagineOffspring` (CONTEXT.md §3 step 6): two parent faces in, one child
 * image out, returned as a `data:` URL the `/match` screen drops into an
 * `<img>`.
 *
 * The studio is a port, so these use an inline stub — no adapter import, so the
 * biome.json hexagon rule holds — and assert the use case's own job: that it
 * base64-encodes the bytes it is handed under the content type it is handed,
 * and passes both parents through untouched.
 */

const PARENT_A = {
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "image/jpeg",
};
const PARENT_B = { bytes: new Uint8Array([4, 5, 6]), contentType: "image/png" };

function studioReturning(
  bytes: Uint8Array,
  contentType: string
): { offspring: OffspringStudio; seen: (typeof PARENT_A)[][] } {
  const seen: (typeof PARENT_A)[][] = [];
  return {
    seen,
    offspring: {
      imagine: async ({ parents }) => {
        seen.push(parents as (typeof PARENT_A)[]);
        return { bytes, contentType };
      },
    },
  };
}

describe("imagineOffspring", () => {
  it("returns the studio's bytes as a data URL under its content type", async () => {
    const babyBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const { offspring } = studioReturning(babyBytes, "image/jpeg");

    const { imageUrl } = await imagineOffspring(
      { parents: [PARENT_A, PARENT_B] },
      { offspring }
    );

    const expected = `data:image/jpeg;base64,${Buffer.from(babyBytes).toString("base64")}`;
    expect(imageUrl).toBe(expected);
  });

  it("passes both parents through to the studio in order", async () => {
    const { offspring, seen } = studioReturning(
      new Uint8Array([9]),
      "image/jpeg"
    );

    await imagineOffspring({ parents: [PARENT_A, PARENT_B] }, { offspring });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([PARENT_A, PARENT_B]);
  });

  it("propagates a studio failure rather than swallowing it", async () => {
    const offspring: OffspringStudio = {
      imagine: () => Promise.reject(new Error("model down")),
    };

    await expect(
      imagineOffspring({ parents: [PARENT_A, PARENT_B] }, { offspring })
    ).rejects.toThrow(/model down/);
  });
});
