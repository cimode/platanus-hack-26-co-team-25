import type { ReactNode } from "react";

/**
 * Root wrapper for isolated component previews (design-sync).
 *
 * A synced component renders outside `app/layout.tsx`, so it inherits neither
 * the page background nor the font stack. This restores both.
 *
 * It no longer applies a theme class. Dipia is light-only: `:root` in
 * globals.css *is* the palette, and there is no `.dark` block to opt into. The
 * previous version wrapped everything in `.dark`, which under the old system
 * was the real theme and under this one selects nothing.
 *
 * Deliberately hugs its content rather than filling the card. A wrapper that
 * fills gives the render root a visible box, which defeats the harness's
 * floor-card fallback: components that render nothing on their own (CardHeader,
 * Separator, a closed Dialog) would show an empty rectangle instead of an
 * honest "preview not yet authored" card.
 *
 * Fonts need no help here: `@theme inline` declares the families by literal
 * name, not via next/font's CSS variables, so the compiled @font-face rules
 * apply on their own.
 */
export function DsPreviewRoot({ children }: { children?: ReactNode }) {
  return (
    <div className="inline-block bg-background p-6 font-sans text-foreground">
      {children}
    </div>
  );
}
