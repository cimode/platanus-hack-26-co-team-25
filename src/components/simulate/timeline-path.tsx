import { WalkingPair } from "@/components/simulate/walking-pair";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";

/**
 * The dashed path the pair walks, and the ONLY component that knows any layout
 * geometry.
 *
 * Its whole props contract is `{ events, progress }`. That is the point:
 * variant 1e is an isometric board, and when it arrives it replaces THIS ONE
 * FILE. No sibling reads a position, a width or an offset, so nothing else has
 * to change (AC-SIM-7). A third prop is a `tsc` failure at every call site,
 * which is the contract enforcing itself rather than a comment asking nicely.
 *
 * `events` is taken but not read for geometry beyond its length -- it is in the
 * contract because 1e places a marker per event and would need them. Keeping it
 * out today would make 1e a props change as well as a component swap.
 */
export function TimelinePath({
  events,
  progress,
}: {
  events: readonly LifeEvent[];
  progress: number;
}) {
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <div className="relative h-[58px] w-full">
      <div className="absolute inset-x-6 top-[38px] border-ink-faint/35 border-t-2 border-dashed" />

      {events.length > 0 ? (
        <div
          /*
           * NO CSS transition here, and the reason is worth keeping.
           *
           * It shipped with `transition-[left] duration-500`, and the e2e caught
           * it: a running transition is an entry in `document.getAnimations()`,
           * and `globals.css`'s reduced-motion block matches
           * `[style*="animation"]` plus seven class names -- none of which this
           * wrapper carries. So one animation survived the guard, intermittently,
           * depending on whether the scroll had settled when the count was taken.
           *
           * The fix is not to widen the guard. `progress` is driven by a scroll
           * position that already updates continuously, so a 500ms ease on top
           * of it was easing a value that was never jumping -- it made the pair
           * LAG the drag. Removing it fixes the guard and the feel at once.
           */
          className="absolute top-0"
          style={{
            // Percentage of the rail, not a pixel offset: the rail is dragged
            // and resized, and a pixel would need a measurement this component
            // is not allowed to take from a sibling.
            left: `calc(1.5rem + ${clamped} * (100% - 3rem - 54px))`,
          }}
        >
          <WalkingPair />
        </div>
      ) : null}
    </div>
  );
}
