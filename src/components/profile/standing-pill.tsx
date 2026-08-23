import type { RankBand } from "@/lib/domain/reveal/rank";
import { cn } from "@/lib/utils";

/**
 * Where this person sits in YOUR ranking, as one pill.
 *
 * The band is the colour and the position is the text -- the design folds what
 * screen 1c shows as two things into one, because on a single profile the band
 * on its own has nothing to be relative to.
 *
 * On the tension with AC-PROF-3, which forbids rendering a "rank index" here:
 * see R17. In short, this is the same position the ranking already showed on
 * the card you tapped to get here, so it discloses nothing new TO THIS VIEWER,
 * and the AC's own example -- "3rd best" -- is a judgement where this is a
 * location. It is still the one number on the screen; nothing else here may
 * become a second one.
 */
const BAND_TONE: Record<RankBand, string> = {
  high: "bg-band-high text-band-high-foreground",
  mid: "bg-band-mid text-band-mid-foreground",
};

export function StandingPill({
  band,
  position,
}: {
  band: RankBand;
  position: number;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5",
        "font-display font-bold text-[12px]",
        BAND_TONE[band]
      )}
    >
      {position}º en tu rank
    </span>
  );
}
