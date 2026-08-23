import { EventBubble } from "@/components/simulate/event-bubble";
import { WalkingPair } from "@/components/simulate/walking-pair";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/**
 * Variant 1e: the board path. One tile per beat, snaking across the canvas,
 * with the narrated bubble hanging off its own tile.
 *
 * The props contract is STILL exactly `{ events, progress }`, which is the
 * happy part of this swap: `LifeEvent` already carries `year`, `kind` and
 * `text`, so a board that shows the story needs nothing the dashed path did not
 * already receive. A third prop remains a `tsc` failure at every call site
 * (AC-SIM-7).
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
}: {
  events: readonly LifeEvent[];
  progress: number;
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
                {/* The beat comes off `events`, which this component already
                    receives -- so the pair reacts without TimelinePath growing
                    a third prop (AC-SIM-7). */}
                <WalkingPair beat={event} />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
