import qrcode from "qrcode-generator";

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrModules {
  /** Modules per side; QR versions are 21 + 4·(version − 1). */
  size: number;
  /** Every dark module, as one SVG path in module units (1 unit = 1 module). */
  path: string;
}

/**
 * Encode `text` and flatten the dark modules into a single SVG path.
 *
 * One `<path>` instead of a few hundred `<rect>`s keeps the markup small, and
 * `fill="currentColor"` on it lets the page's tokens colour the code. Runs of
 * dark modules on a row become one rectangle, so the path stays short.
 *
 * Pure: no React, no I/O — the encoder is a local computation, not a service.
 */
export function qrPath(
  text: string,
  level: QrErrorCorrection = "M"
): QrModules {
  // Type number 0 lets the encoder pick the smallest version that fits.
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  const segments: string[] = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!qr.isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && qr.isDark(row, col)) col++;
      const run = col - start;
      segments.push(`M${start} ${row}h${run}v1h-${run}z`);
    }
  }
  return { size, path: segments.join("") };
}
