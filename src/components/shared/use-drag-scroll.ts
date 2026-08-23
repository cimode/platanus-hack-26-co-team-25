"use client";

import { useCallback, useRef } from "react";

/**
 * Mouse drag on top of native horizontal overflow.
 *
 * Extracted from `RoomCanvas`, which shipped this first and proved it: three
 * screens now need a wide strip you can shove sideways -- the room floor (1b),
 * the rank row (1c) and the life timeline (1f) -- and the second copy is where
 * a shared implementation stops being speculative.
 *
 * The load-bearing decision is what this does NOT do. It never transforms the
 * content and never calls `preventDefault` on a scroll. The element keeps its
 * native `overflow-x`, and these handlers only nudge `scrollLeft` -- so touch
 * drag with momentum, trackpad gestures, the scrollbar and the arrow keys all
 * keep working, because they are still the browser's rather than a
 * reimplementation. A hand-rolled pointer-maths drag has to rebuild all four,
 * and the keyboard one it almost never does.
 *
 * The second load-bearing decision is WHEN it captures the pointer. Capturing
 * on `pointerdown` -- which this did until a link inside a strip stopped
 * working -- retargets every later pointer and compatibility mouse event to the
 * SCROLLER, so the browser resolves the subsequent `click` against the scroller
 * instead of the element under the cursor. A plain mouse click on a <Link>
 * inside the strip then fires on the <section> and navigates nowhere, while
 * touch (which never captures here) and the keyboard both still work -- the
 * worst shape a bug can take, because it is invisible to a phone and to the
 * e2e suite. Capture now waits for `DRAG_SLOP` px of movement, so a click stays
 * a click and only an actual drag takes the pointer.
 *
 * The caller still owns the DOM: this returns a ref and four handlers and has
 * no opinion about the element, its classes or its aria. It does NOT set
 * `overflow-x` for you -- the caller must, or there is nothing to scroll.
 */

/**
 * How far the pointer must travel before this is a drag and not a click.
 *
 * Small enough that a deliberate shove is never mistaken for a tap, large
 * enough to absorb the pixel or two a hand moves while pressing a button. Below
 * it nothing is captured and nothing scrolls, so the click reaches whatever is
 * under the cursor; above it the strip takes the pointer for the rest of the
 * gesture and the ensuing click is swallowed -- which is what you want, because
 * a drag that ends on a card must not open that card.
 */
export const DRAG_SLOP = 4;

/** Whether a gesture that has moved this far should scroll rather than click. */
export function isDrag(startX: number, currentX: number): boolean {
  return Math.abs(currentX - startX) > DRAG_SLOP;
}

/** Where the strip sits on its first paint. */
export type DragScrollInitial = "start" | "center";

/**
 * Where to park `scrollLeft` before the first frame.
 *
 * `"center"` exists because a plate far wider than a phone opens on a window
 * frame with no people in it. `"start"` is for a strip whose first item is the
 * point -- rank position 1 is not something you scroll back to.
 *
 * Clamped at 0: when the content does not overflow, the midpoint arithmetic
 * goes negative. A browser silently clamps a negative assignment, which is
 * exactly why a wrong sign here would never show up in the room.
 */
export function initialScrollLeft(
  scrollWidth: number,
  clientWidth: number,
  initial: DragScrollInitial
): number {
  if (initial === "start") return 0;
  return Math.max(0, (scrollWidth - clientWidth) / 2);
}

export interface DragScroll {
  /**
   * A CALLBACK ref, not an object ref, and deliberately: it runs the moment the
   * node exists, so the first frame the user sees is already positioned instead
   * of jumping after paint the way a `useEffect` would.
   */
  readonly ref: (node: HTMLElement | null) => void;
  /** Spread onto the same element the ref is on. */
  readonly handlers: {
    readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  };
}

export function useDragScroll({
  initial,
}: {
  initial: DragScrollInitial;
}): DragScroll {
  const scroller = useRef<HTMLElement | null>(null);
  const drag = useRef<{
    startX: number;
    startScroll: number;
    /** Set the moment `isDrag` first returns true, never before. */
    captured: boolean;
  } | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      scroller.current = node;
      if (node) {
        node.scrollLeft = initialScrollLeft(
          node.scrollWidth,
          node.clientWidth,
          initial
        );
      }
    },
    [initial]
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Touch already scrolls natively; hijacking it would kill the momentum.
      if (event.pointerType === "touch" || !scroller.current) return;
      // Armed, NOT captured. The capture happens in `onPointerMove` once the
      // gesture has proved itself a drag -- see the note at the top of the file.
      drag.current = {
        startX: event.clientX,
        startScroll: scroller.current.scrollLeft,
        captured: false,
      };
    },
    []
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!(drag.current && scroller.current)) return;
      // Under the slop this is still a click in progress: scrolling by a pixel
      // here would also be a visible jitter under every button press.
      if (
        !(drag.current.captured || isDrag(drag.current.startX, event.clientX))
      )
        return;
      if (!drag.current.captured) {
        drag.current.captured = true;
        // Only NOW, so the pointer keeps tracking once it leaves the strip --
        // which is the whole reason capture is here at all.
        scroller.current.setPointerCapture(event.pointerId);
      }
      // Absolute against the drag's origin, never incremental: accumulating
      // deltas drifts once the browser starts coalescing pointer events.
      scroller.current.scrollLeft =
        drag.current.startScroll - (event.clientX - drag.current.startX);
    },
    []
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!(drag.current && scroller.current)) return;
    const { captured } = drag.current;
    drag.current = null;
    // Releasing a capture that was never taken throws `NotFoundError` in
    // Safari, so the flag is checked rather than the call being made blind.
    if (captured) scroller.current.releasePointerCapture(event.pointerId);
  }, []);

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
