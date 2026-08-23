import { describe, expect, it } from "vitest";
import { qrPath } from "./qr-path";

const LINK = "https://dipia.lat/intake?room=platanus-hack-26-bogota";

describe("qrPath", () => {
  it("encodes a link into a square of modules carrying the three finder patterns", () => {
    const { size, path } = qrPath(LINK);

    // Versions are 21 + 4·(v − 1) modules per side.
    expect(size).toBeGreaterThanOrEqual(21);
    expect(size % 4).toBe(1);

    // A finder pattern's top row is seven dark modules followed by a light
    // separator, so each one shows up as exactly this run.
    expect(path).toContain("M0 0h7v1h-7z");
    expect(path).toContain(`M${size - 7} 0h7v1h-7z`);
    expect(path).toContain(`M0 ${size - 7}h7v1h-7z`);

    // Nothing is drawn outside the square.
    for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const [, x, y, run] = match.map(Number);
      expect(x + run).toBeLessThanOrEqual(size);
      expect(y).toBeLessThan(size);
    }
  });

  it("is deterministic for one text and different for another", () => {
    expect(qrPath(LINK)).toEqual(qrPath(LINK));
    expect(qrPath(LINK).path).not.toBe(qrPath(`${LINK}-x`).path);
  });
});
