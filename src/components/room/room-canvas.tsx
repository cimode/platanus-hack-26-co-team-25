"use client";

import { ParticipantSprite } from "@/components/room/participant-sprite";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import { type Placement, VENUE_ASPECT } from "@/lib/domain/room/layout";

/**
 * The room floor: the venue plate, wider than the viewport, moving only in X.
 *
 * Built on NATIVE horizontal overflow rather than a transform driven by pointer
 * maths. That one decision buys touch drag with momentum, trackpad gestures, a
 * scrollbar, and arrow-key scrolling for free -- all of which a hand-rolled
 * drag would have had to reimplement, and the keyboard half of which it usually
 * never does. `useDragScroll` only ADDS mouse drag on top, by nudging
 * `scrollLeft`; it never fights the native scroll because it IS it.
 *
 * The hook was extracted FROM this component, so this is the reference caller:
 * `overflow-x-auto` is still ours to declare, and `initial: "center"` is here
 * because the plate is far wider than a phone -- `scrollLeft` 0 would greet you
 * with a window frame and no people in it.
 */
export function RoomCanvas({ spots }: { spots: readonly Placement[] }) {
  const { ref, handlers } = useDragScroll({ initial: "center" });

  return (
    // A <section> with a name IS a region, which is what legitimises both the
    // aria-label and the tabIndex below.
    <section
      aria-label="La sala. Desplaza horizontalmente para ver a todos."
      /* absolute inset-0, NOT h-full: `height: 100%` resolves against a parent
         with a definite height, and the room band gets its height from flex-1.
         With h-full the scroller measured 0px, so every sprite's fractional
         `top` collapsed to 0 and the whole crowd was clipped out of view. The
         parent is already `relative`, so filling it absolutely is exact. */
      className="absolute inset-0 cursor-grab overflow-x-auto overflow-y-hidden overscroll-x-contain active:cursor-grabbing"
      ref={ref}
      /* Focusable so the arrow keys reach it. WCAG 2.1.1 requires a scrollable
         region be keyboard-operable, and tabIndex={0} is the documented way --
         Chrome and Firefox now do it implicitly, Safari still does not. */
      // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
      tabIndex={0}
      {...handlers}
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
        className="venue-drift pixelated relative h-full select-none bg-center bg-no-repeat"
        style={{
          aspectRatio: `${VENUE_ASPECT}`,
          containerType: "size",
          backgroundImage: "url(/venue.jpg)",
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
