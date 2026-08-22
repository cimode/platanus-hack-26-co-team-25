/**
 * AC-PORT-8. The gate is mutual and romantic-only, and it is tested from both
 * sides of the pair because an asymmetric gate would leak in exactly one
 * direction -- the direction nobody thinks to check.
 *
 * What this file does NOT test, because there is nothing to test yet: any
 * rendering. This change ships no offspring affordance at all (`offspring.ts`
 * says why), so the predicate has no caller in the render path.
 */
import { describe, expect, it } from "vitest";
import type { Lens } from "@/lib/domain/room/layout";
import { offspringVisible } from "./offspring";

const CONSENTS_TO_EVERYTHING = {
  consent: { romantic: true, business: true, friendship: true },
};

/** Consents to the other two lenses. Business consent is not romantic consent. */
const OPTED_OUT_OF_ROMANTIC = {
  consent: { romantic: false, business: true, friendship: true },
};

describe("offspringVisible", () => {
  it("AC-PORT-8 · true only when both consent, under the romantic lens", () => {
    // The positive case exists so every `false` below means the gate closed,
    // not that the predicate is a constant `false`.
    expect(
      offspringVisible(
        CONSENTS_TO_EVERYTHING,
        CONSENTS_TO_EVERYTHING,
        "romantic"
      )
    ).toBe(true);
  });

  it("AC-PORT-8 · false when the viewer has not consented", () => {
    expect(
      offspringVisible(
        OPTED_OUT_OF_ROMANTIC,
        CONSENTS_TO_EVERYTHING,
        "romantic"
      )
    ).toBe(false);
  });

  it("AC-PORT-8 · false with the two people swapped", () => {
    // Same pair, other direction. An `&&` that degraded into reading only the
    // viewer would pass the test above and fail this one.
    expect(
      offspringVisible(
        CONSENTS_TO_EVERYTHING,
        OPTED_OUT_OF_ROMANTIC,
        "romantic"
      )
    ).toBe(false);
  });

  it("AC-PORT-8 · false when neither has consented", () => {
    expect(
      offspringVisible(OPTED_OUT_OF_ROMANTIC, OPTED_OUT_OF_ROMANTIC, "romantic")
    ).toBe(false);
  });

  it("AC-PORT-8 · false under business and friendship, full consent or not", () => {
    // Both people consent to all three lenses here, so the only thing that can
    // close the gate is the lens itself (docs/domain.md D12, AUDIT.md S17).
    const nonRomantic: Lens[] = ["business", "friendship"];
    expect(nonRomantic).toHaveLength(2);
    for (const lens of nonRomantic) {
      expect(
        offspringVisible(CONSENTS_TO_EVERYTHING, CONSENTS_TO_EVERYTHING, lens),
        lens
      ).toBe(false);
    }
  });

  it("AC-PORT-8 · is symmetric across every consent combination", () => {
    const people = [CONSENTS_TO_EVERYTHING, OPTED_OUT_OF_ROMANTIC];
    const lenses: Lens[] = ["romantic", "business", "friendship"];
    let compared = 0;
    for (const a of people) {
      for (const b of people) {
        for (const lens of lenses) {
          expect(offspringVisible(a, b, lens)).toBe(
            offspringVisible(b, a, lens)
          );
          compared += 1;
        }
      }
    }
    expect(compared).toBe(12);
  });
});
