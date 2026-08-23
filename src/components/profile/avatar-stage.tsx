import { cn } from "@/lib/utils";

/**
 * The stage: the sprite, big, standing low on the screen.
 *
 * The design gives this the entire lower half and puts the note about the real
 * photo in the corner of it. That note is not decoration -- the avatar plates
 * ship with a BLANK FACE on purpose (`domain/room/layout.ts`: "that oval is
 * where the participant's real photo goes"), and without the caption an empty
 * face reads as a rendering bug rather than as the product's own joke.
 *
 * The bob is `@utility avatar-bob`, which `globals.css` already defines AND
 * already lists in the `prefers-reduced-motion` block. That is the whole
 * requirement of AC-PROF-6: no new bespoke animation class outside that list,
 * because a guard that depends on someone remembering to add a class is a guard
 * that rots the first time someone forgets.
 *
 * The shadow does NOT bob. A shadow that rises with the body reads as the
 * ground moving; keeping it still is what makes the body look like it lifts.
 */
export function AvatarStage({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <p className="px-6 pt-3 text-right font-mono text-[10px] text-ink-faint leading-tight lowercase">
        la foto real se inserta
        <br />
        en la cara del sprite
      </p>

      <div className="relative flex flex-1 items-end justify-center pb-[9%]">
        <span className="-translate-x-1/2 absolute bottom-[9%] left-1/2 h-[14px] w-[92px] rounded-[50%] bg-dark/20 blur-[2.5px]" />

        {photoUrl ? (
          <span
            aria-hidden="true"
            className="avatar-bob pixelated relative block h-[232px] w-[132px] bg-bottom bg-contain bg-no-repeat"
            style={{ backgroundImage: `url(${photoUrl})` }}
          />
        ) : (
          <span
            aria-label={`${name}, sin foto todavía`}
            className={cn(
              "avatar-bob relative flex h-[232px] w-[132px] items-center justify-center rounded-2xl",
              "border-2 border-ink-faint/30 border-dashed",
              "font-mono text-[11px] text-ink-faint lowercase"
            )}
            role="img"
          >
            sin foto
          </span>
        )}
      </div>
    </div>
  );
}
