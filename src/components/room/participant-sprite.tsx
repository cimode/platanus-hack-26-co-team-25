import type { Placement } from "@/lib/domain/room/layout";
import { SPRITE_ASPECT } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

/**
 * One person standing in the room.
 *
 * THREE nested elements, and not one of them is decoration: `transform` is a
 * single property, so wander, hop and the sprite's own scaling cannot share an
 * element. Outer drifts, middle hops, inner draws. Collapse them and the
 * animations overwrite each other -- the crowd freezes and it looks like a
 * rendering bug rather than a CSS one.
 *
 * Not a button. Sprites are the room's population, not controls: the only
 * action on this screen is choosing a lens. A control that looks pressable and
 * does nothing is worse than a figure that never claimed to be one.
 *
 * Sized in `cqh` against the venue plate, so the crowd stays glued to the art
 * at any rendered width -- a 390px phone and the 1280px projector put people on
 * the same floorboards, with no breakpoints.
 */
export function ParticipantSprite({ spot }: { spot: Placement }) {
  return (
    <figure
      /* -translate-y-full anchors the sprite's FEET at its depth, not its head.
         Anchoring the top left near sprites -- taller by design -- standing
         with their feet through the floor. */
      className="group absolute -translate-x-1/2 -translate-y-full"
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        // Depth order without a sort: further down the floor means nearer the
        // camera, so a larger y must paint over a smaller one.
        zIndex: Math.round(spot.y * 100),
      }}
    >
      <div
        style={{
          animation: `${spot.wander} ${spot.wanderSeconds}s ease-in-out infinite`,
        }}
      >
        <div
          className="group-hover:hop-big cursor-default"
          style={{
            animation: `pickme ${spot.hopSeconds}s ease-in-out infinite`,
            animationDelay: `${spot.idleDelay}s`,
          }}
        >
          <div
            className={cn("sprite", "bg-contain bg-bottom bg-no-repeat")}
            style={{
              height: `${spot.height * 100}cqh`,
              width: `${spot.height * 100 * SPRITE_ASPECT}cqh`,
              backgroundImage: `url(${spot.sprite})`,
            }}
          />
        </div>
      </div>

      {/* Always in the accessibility tree, only sometimes on screen. Painting
          every name at once turns the crowd into soup -- and a caption belongs
          to a sprite BEHIND the ones drawn over it, so the labels that got
          covered were exactly the ones worth reading. The room is atmosphere;
          the action is the lens. Names come back, legibly, in the ranking. */}
      <figcaption
        className={cn(
          "-translate-x-1/2 absolute top-full left-1/2 mt-1",
          "rounded-full bg-dark/85 px-2 py-0.5",
          "font-mono text-[10px] text-background lowercase",
          "whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100"
        )}
      >
        {spot.participant.name}
      </figcaption>
    </figure>
  );
}
