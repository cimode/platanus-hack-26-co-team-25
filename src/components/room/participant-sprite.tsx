import type { Placement } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

/**
 * One person standing in the room.
 *
 * Not a button. Sprites are the room's population, not controls -- the only
 * action on this screen is choosing a lens. A control that looks pressable and
 * does nothing is worse than a figure that never claimed to be one.
 *
 * Everything is sized in `cqh` against the venue plate rather than in px. The
 * plate is a size container, so a sprite stays glued to the art at any rendered
 * width: on a 390px phone and on the 1280px projector the crowd sits on the
 * same floorboards.
 *
 * The pixel-art avatar plates (assets/avatar*.png, with the participant's real
 * photo in the face) are not drawn yet, so this renders a placeholder body with
 * initials. Swap the inner block for an <Image class="sprite"> when they land;
 * the placement maths above it does not change.
 */
export function ParticipantSprite({ spot }: { spot: Placement }) {
  const initials = spot.participant.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (
    <figure
      /* -translate-y-full anchors the sprite's FEET at its depth, not its head.
         Anchoring the top meant a near sprite -- taller by design -- stood with
         its feet through the floor. Feet-on-the-floor is also what the depth
         actually means: y is where the person is standing. */
      className="group absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
      }}
    >
      <div
        className={cn(
          "idle-hop group-hover:hop-big",
          "flex items-end justify-center rounded-t-full rounded-b-[15%]",
          "border-2 border-ink/40 bg-surface-alt",
          "font-display font-extrabold text-ink",
          "[filter:drop-shadow(0_3px_2px_rgb(0_0_0/0.45))]"
        )}
        style={{
          height: `${spot.height * 100}cqh`,
          aspectRatio: "0.45",
          fontSize: `${spot.height * 22}cqh`,
          animationDelay: `${spot.idleDelay}s`,
        }}
      >
        <span className="pb-[16%]">{initials}</span>
      </div>

      {/* Always in the accessibility tree, only sometimes on screen.
          Painting every name at once turned the crowd into soup -- and worse, a
          caption belongs to a sprite BEHIND the ones drawn over it, so the
          labels that got covered were exactly the ones you wanted to read. The
          room is atmosphere here; the action is the lens, not the person. Names
          come back, legibly, in the ranking. */}
      <figcaption
        className={cn(
          "absolute top-full mt-1 rounded-full bg-dark/85 px-2 py-0.5",
          "font-mono text-[10px] whitespace-nowrap text-background lowercase",
          "opacity-0 transition-opacity group-hover:opacity-100"
        )}
      >
        {spot.participant.name}
      </figcaption>
    </figure>
  );
}
