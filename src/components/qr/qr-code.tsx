import { cn } from "@/lib/utils";
import { qrPath } from "./qr-path";

/** Light modules around the code; the spec asks for four. */
const QUIET_ZONE = 4;

interface QrCodeProps {
  /** What the code encodes — for `/qr`, the room's intake link. */
  value: string;
  /** The accessible name: what a screen reader, and a test, call this image. */
  label: string;
  className?: string;
}

/**
 * A QR code as inline SVG, rendered on the server.
 *
 * The viewBox includes the quiet zone, so the code stays scannable whatever the
 * parent pads it with. `shape-rendering: crispEdges` stops the browser from
 * anti-aliasing module edges into grey, which is what makes a scaled QR fail on
 * a camera that is already struggling with a phone screen.
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const { size, path } = qrPath(value);
  const side = size + QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${side} ${side}`}
      shapeRendering="crispEdges"
      className={cn("h-auto w-full bg-card text-ink", className)}
    >
      <title>{label}</title>
      <path d={path} fill="currentColor" />
    </svg>
  );
}
