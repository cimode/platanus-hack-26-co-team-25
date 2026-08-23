import type { RankBand } from "@/lib/domain/reveal/rank";
import { cn } from "@/lib/utils";

/**
 * The band, as two words.
 *
 * Exactly two labels exist and there is no third, because `RankBand` has no
 * third member (AC-RANK-3). Eligible-but-low pairs are ABSENT from the ranking
 * rather than greyed out, and a greyed third pill would disclose exactly what
 * their absence is protecting.
 *
 * The colours come from `--band-high*` / `--band-mid*`, which are NOT the lens
 * accent: a band means the same thing under all three lenses, so it must not
 * move when the lens does. `--band-high` is byte-identical to `--tag-ritual`
 * and that is a coincidence of palette, not a shared meaning -- never reach for
 * a `--tag-*` token here.
 */
const BAND: Record<RankBand, { label: string; className: string }> = {
  high: {
    label: "BANDA ALTA",
    className: "bg-band-high text-band-high-foreground",
  },
  mid: {
    label: "BANDA MEDIA",
    className: "bg-band-mid text-band-mid-foreground",
  },
};

export function BandPill({ band }: { band: RankBand }) {
  return (
    <span
      className={cn(
        "w-fit rounded-full px-2.5 py-1",
        "font-mono font-semibold text-[9.5px] tracking-[0.08em]",
        BAND[band].className
      )}
    >
      {BAND[band].label}
    </span>
  );
}
