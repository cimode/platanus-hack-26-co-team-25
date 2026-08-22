import Link from "next/link";
import { BandPill } from "@/components/rank/band-pill";
import type { RankEntry } from "@/lib/domain/reveal/rank";
import { cn } from "@/lib/utils";

/**
 * One person in the viewer's ranking.
 *
 * A <Link>, not a card with a button in it, so the whole target is one thing
 * with one accessible name -- which is also what lets the e2e find an entry
 * that is scrolled off-screen by role and name (AC-RANK-8) instead of by class.
 *
 * `position` is the engine's, never an index into what is currently visible:
 * filtering to ALTA must not renumber anybody, because the number is this
 * viewer's rank and not a row counter.
 */
export function RankCard({
  entry,
  delay,
}: {
  entry: RankEntry;
  delay: number;
}) {
  /*
   * An EXPLICIT accessible name, composed in reading order.
   *
   * Left to itself the browser concatenates every descendant, so a photoless
   * card announces "sin foto 3 Camila Soto BANDA MEDIA les une..." -- the
   * placeholder first and the person third. Naming it here puts the position
   * and the person up front and still carries the bond and the friction, so a
   * screen reader hears the same three facts a sighted user reads, in the same
   * order.
   */
  const name = [
    `${entry.position} · ${entry.name}`,
    entry.bond.label,
    entry.friction?.label,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Link
      aria-label={name}
      className={cn(
        "pop-in flex w-[172px] shrink-0 flex-col gap-2.5 rounded-[20px] bg-card p-3.5",
        "shadow-toy transition-transform",
        "hover:-translate-y-0.5 hover:shadow-toy-lg",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      )}
      href={`/profile/${entry.id}`}
      /* Inline, per card, because the stagger differs per card -- and the
         reduced-motion block matches on `[style*="animation"]`, so an inline
         delay is caught by the same guard that catches the class. */
      style={{ animationDelay: `${delay}ms` }}
    >
      <Avatar entry={entry} />

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[11px] text-ink-faint tabular-nums">
          {entry.position}
        </span>
        <span className="truncate font-display font-bold text-[15px] text-ink">
          {entry.name}
        </span>
      </div>

      <BandPill band={entry.band} />

      {/*
        FIXED height and one line each, not `min-h`.
        AC-RANK-2 says a card without friction must not collapse -- but `min-h`
        only stops it collapsing BELOW a floor, and a long bond label still
        wraps and makes that card taller than its neighbours. A row of ragged
        cards reads as broken layout, and it also made the AC untestable: the
        heights differed for a reason that had nothing to do with friction.
      */}
      <div className="flex h-[38px] flex-col gap-0.5">
        <span className="truncate font-mono text-[10px] text-ink-muted leading-snug">
          {entry.bond.label}
        </span>
        {entry.friction ? (
          <span className="truncate font-mono text-[10px] text-ink-faint leading-snug">
            {entry.friction.label}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * The face, or an honest hole where one goes.
 *
 * A CSS background rather than <Image>: these are pixel-art plates at a size we
 * control, and Biome's next domain (rightly) rejects a bare <img>.
 *
 * The placeholder is NAMED. A person with no photo is a person who has not
 * finished intake, not a rendering failure, and an empty grey box reads as the
 * second one.
 */
function Avatar({ entry }: { entry: RankEntry }) {
  if (!entry.photoUrl) {
    return (
      <span
        aria-label={`${entry.name}, sin foto todavía`}
        className={cn(
          "flex h-[104px] items-center justify-center rounded-[14px]",
          "border-2 border-ink-faint/25 border-dashed bg-dark/5",
          "font-mono text-[10px] text-ink-faint lowercase"
        )}
        role="img"
      >
        sin foto
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="pixelated block h-[104px] rounded-[14px] bg-dark/5 bg-center bg-contain bg-no-repeat"
      style={{ backgroundImage: `url(${entry.photoUrl})` }}
    />
  );
}
