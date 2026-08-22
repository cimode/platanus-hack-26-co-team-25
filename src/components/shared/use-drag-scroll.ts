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
 * The caller still owns the DOM: this returns a ref and four handlers and has
 * no opinion about the element, its classes or its aria. It does NOT set
 * `overflow-x` for you -- the caller must, or there is nothing to scroll.
 */

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
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

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
      drag.current = {
        startX: event.clientX,
        startScroll: scroller.current.scrollLeft,
      };
      scroller.current.setPointerCapture(event.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!(drag.current && scroller.current)) return;
      // Absolute against the drag's origin, never incremental: accumulating
      // deltas drifts once the browser starts coalescing pointer events.
      scroller.current.scrollLeft =
        drag.current.startScroll - (event.clientX - drag.current.startX);
    },
    []
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!(drag.current && scroller.current)) return;
    drag.current = null;
    scroller.current.releasePointerCapture(event.pointerId);
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
