import Link from "next/link";
import { FacedAvatar } from "@/components/faces/faced-avatar";
import { BandPill } from "@/components/rank/band-pill";
import type { RankEntry } from "@/lib/domain/reveal/rank";
import { cn } from "@/lib/utils";

/**
 * One person in the viewer's ranking.
 *
 * NO CARD. The people stand loose on the floor of the row, the way they stand
 * loose on the floor of the room -- boxing each one in a panel put a border
 * between the viewer and the person, and turned a room into a catalogue. The
 * design was right and the first build was wrong.
 *
 * A <Link>, so the whole target is one thing with one accessible name, which is
 * what lets the e2e find an entry that is scrolled off-screen by role and name
 * (AC-RANK-8) instead of by class.
 *
 * `position` is the engine's, never an index into what is currently visible:
 * filtering to BANDA ALTA must not renumber anybody, because the number is this
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
   * entry announces "sin foto 3 Camila Soto BANDA MEDIA les une..." -- the
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
        "pop-in flex w-[132px] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-2",
        "transition-transform hover:-translate-y-0.5",
        "focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2"
      )}
      /*
       * A link is natively draggable, and inside a drag-scrolled strip that is
       * a bug: pressing on a card and shoving sideways made Chrome start a
       * ghost-drag of the URL, which fires `dragstart` -> `pointercancel` and
       * kills the row's own drag after the first few pixels. Nothing here is
       * meant to be dropped anywhere, so the native gesture only has something
       * to take away.
       */
      draggable={false}
      href={`/profile/${entry.id}`}
      /* Inline, per card, because the stagger differs per card -- and the
         reduced-motion block matches on `[style*="animation"]`, so an inline
         delay is caught by the same guard that catches the class. */
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* The ordinal is the loudest thing on the entry, and first place is the
          only one that takes the lens accent. Everything below it is quieter by
          design: the rank is the message, the reasons are the footnote. */}
      <span
        className={cn(
          "font-display font-extrabold text-[26px] leading-none",
          entry.position === 1 ? "text-primary" : "text-ink"
        )}
      >
        {entry.position}º
      </span>

      <Avatar entry={entry} />

      <span className="max-w-full truncate font-display font-bold text-[14px] text-ink">
        {entry.name}
      </span>

      <BandPill band={entry.band} />

      {/*
        FIXED height and one line each, not `min-h`.
        AC-RANK-2 says an entry without friction must not collapse -- but
        `min-h` only stops it collapsing BELOW a floor, and a long bond label
        still wraps and makes that entry taller than its neighbours. A ragged
        row reads as broken layout, and it also made the AC untestable: the
        heights differed for a reason that had nothing to do with friction.
      */}
      <span className="flex h-[30px] w-full flex-col gap-0.5 text-center">
        <span className="truncate font-mono text-[9.5px] text-ink-muted leading-snug">
          {entry.bond.label}
        </span>
        {entry.friction ? (
          <span className="truncate font-mono text-[9.5px] text-ink-faint leading-snug">
            {entry.friction.label}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The body plate, standing on its own shadow.
 *
 * A CSS background rather than <Image>: these are pixel-art plates at a size we
 * control, and Biome's next domain (rightly) rejects a bare <img>.
 *
 * The ellipse under the feet is what stops a loose sprite from floating. With
 * the card gone there is no panel edge to sit on, so the shadow IS the floor --
 * the same trick `participant-sprite.tsx` uses in the room.
 */
function Avatar({ entry }: { entry: RankEntry }) {
  // No plate at all (a row older than the avatar column) is the only case with
  // nothing to draw. A missing PHOTO is not: the plate's face is blank by
  // design, so the person still stands there, just without a face yet.
  if (!entry.avatar) {
    return (
      <span
        aria-label={`${entry.name}, sin foto todavía`}
        className={cn(
          "flex h-[112px] w-[62px] items-center justify-center rounded-xl",
          "border-2 border-ink-faint/30 border-dashed",
          "font-mono text-[9px] text-ink-faint leading-tight lowercase"
        )}
        role="img"
      >
        sin
        <br />
        foto
      </span>
    );
  }

  return (
    <span className="relative block h-[112px] w-[62px]">
      <FacedAvatar
        avatar={entry.avatar}
        className="mx-auto"
        height="112px"
        label={entry.name}
        photoUrl={entry.photoUrl}
        preload={false}
      />
      <span className="-translate-x-1/2 absolute bottom-0.5 left-1/2 h-[7px] w-[34px] rounded-[50%] bg-dark/20 blur-[1.5px]" />
    </span>
  );
}
