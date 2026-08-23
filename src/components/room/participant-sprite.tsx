"use client";

import { AvatarSprite } from "@/components/emotes/avatar-sprite";
import { useParticipantEmotes } from "@/components/emotes/use-emote-player";
import { avatarKey } from "@/lib/domain/emotes/emotes";
import type { Placement } from "@/lib/domain/room/layout";
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
  // The drawing is the emotes library's `AvatarSprite`: the idle plate, and a
  // reaction whenever `reactToEvent(participant.id, …)` names this person.
  const avatar = avatarKey(spot.sprite) ?? "avatar1";
  const player = useParticipantEmotes(spot.participant.id, avatar);

  return (
    <figure
      /* -translate-y-full anchors the sprite's FEET at its depth, not its head.
         Anchoring the top left near sprites -- taller by design -- standing
         with their feet through the floor. */
      className={cn(
        "group absolute -translate-x-1/2 -translate-y-full",
        // Depth comes through a CUSTOM PROPERTY rather than an inline
        // `zIndex`, and that is the whole trick behind the hover.
        //
        // `z-index` on the figure opens a stacking context, so a caption
        // nested inside it can never paint above a nearer sprite no matter
        // what z-index the caption itself carries -- it is ordered WITHIN its
        // parent, not against the parent's siblings. The figure has to be the
        // thing that lifts. An inline style cannot be overridden by a `hover:`
        // class, so the depth moves into a variable and the hover raises the
        // whole figure over everyone.
        "z-[var(--depth)] hover:z-[200]"
      )}
      data-participant={spot.participant.id}
      style={
        {
          left: `${spot.x * 100}%`,
          top: `${spot.y * 100}%`,
          // Depth order without a sort: further down the floor means nearer the
          // camera, so a larger y must paint over a smaller one.
          "--depth": Math.round(spot.y * 100),
        } as React.CSSProperties
      }
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
          <AvatarSprite
            avatar={avatar}
            height={`${spot.height * 100}cqh`}
            label={spot.participant.name}
            onEnd={player.stop}
            playing={player.playing}
          />
        </div>
      </div>

      {/* Always in the accessibility tree, only sometimes on screen. Painting
          every name at once turns the crowd into soup. The room is atmosphere;
          the action is the lens. Names come back, legibly, in the ranking.

          ABOVE the head, not below the feet. Below, the caption landed exactly
          where the next row of sprites stands -- so the name you were reaching
          for was the one covered by the people in front of it, which is the
          opposite of what a hover is for. Above the head is empty floor at
          every depth, because sprites are anchored by their feet.

          KNOWN GAP, worth saying rather than discovering at the demo: `:hover`
          does not exist on a touch device, and this screen is phone-first. On a
          390px viewport these names are unreachable -- the e2e skips itself on
          the mobile project for exactly that reason rather than pretending
          otherwise. Names are legible on `/rank`, which is where the decision
          actually gets made; if the room needs them on touch, that is a tap
          affordance and a different change. */}
      <figcaption
        className={cn(
          "-translate-x-1/2 absolute bottom-full left-1/2 mb-1",
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
