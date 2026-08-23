"use client";

import { ParticipantSprite } from "@/components/room/participant-sprite";
import { useDragScroll } from "@/components/shared/use-drag-scroll";
import {
  type Placement,
  VENUE_ASPECT,
  VENUE_VOID,
  VENUE_ZOOM,
} from "@/lib/domain/room/layout";

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
      /* `flex items-center` is the letterbox: the plate no longer fills the
         band's height (see VENUE_ZOOM), so something has to decide where the
         spare height goes, and centring keeps the room off both rims. The
         background is the plate's OWN void colour, which is what makes the
         letterbox read as more room rather than as a gap. */
      className="absolute inset-0 flex cursor-grab items-center overflow-x-auto overflow-y-hidden overscroll-x-contain active:cursor-grabbing"
      ref={ref}
      style={{ backgroundColor: VENUE_VOID }}
      /* Focusable so the arrow keys reach it. WCAG 2.1.1 requires a scrollable
         region be keyboard-operable, and tabIndex={0} is the documented way --
         Chrome and Firefox now do it implicitly, Safari still does not. */
      // biome-ignore lint/a11y/noNoninteractiveTabindex: see above
      tabIndex={0}
      {...handlers}
    >
      {/*
        The plate at its OWN aspect ratio, VENUE_ZOOM of the band's height.
        Keeping the ratio is what makes the measured floor coordinates land:
        stretch the art to fit the band instead and people stand on the
        furniture. The height is a scale knob, and scaling is safe -- every
        coordinate under here is a fraction of the plate, not a pixel.

        `container-type: size` turns it into the size container the sprites
        measure themselves against in cqh, so the crowd tracks the art from a
        390px phone to the 1280px projector without a single breakpoint.

        A CSS background rather than <Image>: the plate is scenery whose exact
        box we control, and Biome's next domain (rightly) rejects a bare <img>.
      */}
      <div
        /* `shrink-0` because the plate is now a flex item: without it the
           browser would happily squeeze its aspect-ratio width down to the
           viewport and every measured floor coordinate would land somewhere
           else. */
        className="venue-drift pixelated relative shrink-0 select-none bg-center bg-no-repeat"
        style={{
          height: `${VENUE_ZOOM * 100}%`,
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
