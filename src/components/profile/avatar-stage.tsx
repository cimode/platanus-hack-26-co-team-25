import { cn } from "@/lib/utils";

/**
 * The stage: the sprite, big, standing low in the room.
 *
 * No caption. The first build shipped the design's annotation -- "la foto real
 * se inserta en la cara del sprite" -- as if it were product copy. It was a
 * note to the reader of the mockup, not to the person using the app, and
 * explaining your own art on screen is the tell of a screen that does not trust
 * it.
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
    <div className="relative flex min-h-0 flex-1 items-end justify-center pb-[10%]">
      <span className="-translate-x-1/2 absolute bottom-[10%] left-1/2 h-[14px] w-[92px] rounded-[50%] bg-dark/25 blur-[2.5px]" />

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
            "border-2 border-ink-faint/30 border-dashed bg-background/60",
            "font-mono text-[11px] text-ink-faint lowercase"
          )}
          role="img"
        >
          sin foto
        </span>
      )}
    </div>
  );
}
