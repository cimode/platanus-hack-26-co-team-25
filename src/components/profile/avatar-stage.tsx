import { cn } from "@/lib/utils";

/**
 * The person, standing still enough to look at.
 *
 * The bob is `@utility avatar-bob`, which `globals.css` already defines AND
 * already lists in the `prefers-reduced-motion` block. That is the whole
 * requirement of AC-PROF-6: no new bespoke animation class outside that list,
 * because a guard that depends on someone remembering to add a class is a guard
 * that rots the first time someone forgets.
 *
 * The shadow does NOT bob. A shadow that rises with the body reads as the
 * ground moving; keeping it still is what makes the body look like it is
 * lifting off it.
 */
export function AvatarStage({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  return (
    <div className="relative flex h-[210px] w-full items-end justify-center">
      <span className="-translate-x-1/2 absolute bottom-3 left-1/2 h-[12px] w-[74px] rounded-[50%] bg-dark/20 blur-[2px]" />

      {photoUrl ? (
        <span
          aria-hidden="true"
          className="avatar-bob pixelated relative block h-[190px] w-[110px] bg-bottom bg-contain bg-no-repeat"
          style={{ backgroundImage: `url(${photoUrl})` }}
        />
      ) : (
        <span
          aria-label={`${name}, sin foto todavía`}
          className={cn(
            "avatar-bob relative flex h-[190px] w-[110px] items-center justify-center rounded-2xl",
            "border-2 border-ink-faint/30 border-dashed",
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
