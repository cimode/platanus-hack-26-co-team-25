import { EventBubble } from "@/components/simulate/event-bubble";
import { WalkingPair } from "@/components/simulate/walking-pair";
import type { AvatarKey } from "@/lib/domain/emotes/emotes";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * Variant 1e: the board path. One tile per beat, snaking across the canvas,
 * with the narrated bubble hanging off its own tile.
 *
 * The props contract was `{ events, progress }` and is now
 * `{ events, progress, avatars }`. `LifeEvent` carries `year`, `kind`, `text`
 * and the narrator's `emote`, so the STORY still needs nothing extra -- what
 * forced the third prop is identity: the pair on the tile is two real
 * participants, and their plates live on `SimulatedLife`, not on an event.
 * AC-SIM-7 held for everything it was written to protect (this component still
 * reads no layout); it did not survive the pair becoming the users themselves.
 *
 * What the swap DID cost is worth writing down, because the plan promised
 * otherwise: 1e was scoped as "replaces this one file". It replaced this file
 * and emptied the card row above it, because in this design the path IS the
 * layout rather than decoration underneath one. The narrow contract survived;
 * the one-file estimate did not.
 *
 * The isometric floor art is a drop-in the design marks as pending
 * ("arte drop-in: piso + casillas isométricas del tablero"). Until it arrives
 * the tiles are drawn from tokens, which is why they are flat rounded plates
 * with a lower edge rather than true isometric faces.
 */

/**
 * Horizontal distance between tile centres.
 *
 * Chosen against the BUBBLE, not the tile, but only against the SAME-SIDE one.
 * Bubbles alternate above and below, so neighbours on opposite rows may overlap
 * horizontally -- the design does exactly that -- and only same-side
 * neighbours, `2 * STRIDE` apart, need to clear a 190px bubble.
 *
 * The first attempt used 96 and every bubble covered both of its neighbours;
 * the second over-corrected to 132 and pulled the tiles apart until the board
 * stopped reading as one path. 108 keeps the chain tight and leaves 26px
 * between same-side bubbles.
 */
const STRIDE = 108;
/** How far the path rises and falls, peak to trough. */
const WAVE = 150;
/** Clear space above the tile band, so an upward bubble has somewhere to go. */
const BAND_TOP = 178;
/** Same below. */
const BAND_BOTTOM = 158;
/** One full up-and-down every N tiles, so the snake reads at 390px. */
const PERIOD = 8;

/** Where a tile sits, as a fraction of the wave's height. 0 is the top. */
function offsetAt(index: number): number {
  return (1 - Math.cos((index / PERIOD) * Math.PI * 2)) / 2;
}

export function TimelinePath({
  events,
  progress,
  avatars,
}: {
  events: readonly LifeEvent[];
  progress: number;
  /**
   * The two people's plates, subject first.
   *
   * THE THIRD PROP the contract above said would never come, so here is the
   * reason it did. The pair standing on the tile started as decoration -- two
   * hardcoded plates with a bob -- and once it became the two PARTICIPANTS,
   * drawing `avatar1` and `avatar3` meant every couple on the board was one
   * masculine and one feminine figure whoever they actually were.
   *
   * The emote needed no prop because it rides inside `LifeEvent`. An identity
   * has no such seat, and duplicating both plates onto all N events to keep the
   * count at two would be worse. Optional, so nothing is forced to pass it and
   * a plate-less row (registrations older than the column) still renders.
   */
  avatars?: {
    readonly a: AvatarKey | null;
    readonly b: AvatarKey | null;
  };
}) {
  const active = Math.min(events.length - 1, Math.max(0, Math.round(progress)));

  return (
    <div
      className="relative shrink-0"
      style={{
        width: `${events.length * STRIDE + STRIDE * 2}px`,
        height: `${BAND_TOP + WAVE + BAND_BOTTOM}px`,
      }}
    >
      {events.map((event, index) => {
        // The anchor is the tile's CENTRE. Everything else is measured from it
        // with an explicit offset, which is what the first attempt got wrong:
        // bubbles hung off `bottom-full` of a zero-height box, so they started
        // flush against the tile and swallowed the walking pair.
        const top = BAND_TOP + offsetAt(index) * WAVE;
        const left = STRIDE + index * STRIDE;
        const above = index % 2 === 0;

        return (
          <div
            className="absolute"
            key={`${event.year}-${event.kind}`}
            style={{ left: `${left}px`, top: `${top}px` }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "-translate-x-1/2 -translate-y-1/2 absolute block h-[42px] w-[86px] rounded-[13px] border-b-4",
                index === active
                  ? "border-tag-roce-foreground/30 bg-tag-roce"
                  : "border-ink-faint/25 bg-card"
              )}
              style={{
                transform: `translate(-50%, -50%) rotate(${
                  (offsetAt(index + 1) - offsetAt(index)) * 26
                }deg)`,
              }}
            />

            <EventBubble above={above} delay={index * 40} event={event} />

            {/* Standing ON the tile. `z-10` so the pair reads in front of the
                board rather than under the next tile's shadow. */}
            {index === active ? (
              <span className="-translate-x-1/2 absolute bottom-[16px] left-0 z-10">
                {/* The beat comes off `events`; the plates come off
                    `avatars`. See the prop's own note for why that one exists. */}
                <WalkingPair
                  avatarA={avatars?.a}
                  avatarB={avatars?.b}
                  beat={event}
                />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
