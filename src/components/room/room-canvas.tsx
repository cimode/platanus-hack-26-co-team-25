"use client";

import { useRef } from "react";
import { ParticipantSprite } from "@/components/room/participant-sprite";
import { type Placement, VENUE_ASPECT } from "@/lib/domain/room/layout";

/**
 * The room floor: the venue plate, wider than the viewport, moving only in X.
 *
 * Built on NATIVE horizontal overflow rather than a transform driven by pointer
 * maths. That one decision buys touch drag with momentum, trackpad gestures, a
 * scrollbar, and arrow-key scrolling for free -- all of which a hand-rolled
 * drag would have had to reimplement, and the keyboard half of which it usually
 * never does. The pointer handlers below only ADD mouse drag on top, by nudging
 * `scrollLeft`; they never fight the native scroll because they ARE it.
 */
export function RoomCanvas({ spots }: { spots: readonly Placement[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    // Touch already scrolls natively; hijacking it would kill the momentum.
    if (event.pointerType === "touch" || !scroller.current) return;
    drag.current = {
      startX: event.clientX,
      startScroll: scroller.current.scrollLeft,
    };
    scroller.current.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft =
      drag.current.startScroll - (event.clientX - drag.current.startX);
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    if (!drag.current || !scroller.current) return;
    drag.current = null;
    scroller.current.releasePointerCapture(event.pointerId);
  }

  return (
    // A <section> with a name IS a region, which is what legitimises both the
    // aria-label and the tabIndex below.
    <section
      aria-label="La sala. Desplazá horizontalmente para ver a todos."
      /* absolute inset-0, NOT h-full: `height: 100%` resolves against a parent
         with a definite height, and the room band gets its height from flex-1.
         With h-full the scroller measured 0px, so every sprite's fractional
         `top` collapsed to 0 and the whole crowd was clipped out of view. The
         parent is already `relative`, so filling it absolutely is exact. */
      className="absolute inset-0 cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain active:cursor-grabbing"
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={scroller}
      /* Focusable so the arrow keys reach it. WCAG 2.1.1 requires a scrollable
         region be keyboard-operable, and tabIndex={0} is the documented way --
         Chrome and Firefox now do it implicitly, Safari still does not. */
      // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
      tabIndex={0}
    >
      {/*
        The plate at its OWN aspect ratio, full band height. That is what makes
        the measured floor coordinates land: stretch the art to fit the band
        instead and people stand on the furniture.

        `container-type: size` turns it into the size container the sprites
        measure themselves against in cqh, so the crowd tracks the art from a
        390px phone to the 1280px projector without a single breakpoint.

        A CSS background rather than <Image>: the plate is scenery whose exact
        box we control, and Biome's next domain (rightly) rejects a bare <img>.
      */}
      <div
        className="relative h-full select-none bg-center bg-no-repeat"
        style={{
          aspectRatio: `${VENUE_ASPECT}`,
          containerType: "size",
          backgroundImage: "url(/venue.jpeg)",
          backgroundSize: "100% 100%",
        }}
      >
        {spots.map((spot) => (
          <ParticipantSprite key={spot.participant.id} spot={spot} />
        ))}
      </div>
    </section>
  );
}
