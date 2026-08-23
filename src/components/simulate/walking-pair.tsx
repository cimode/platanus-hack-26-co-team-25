/**
 * The two of them, walking the path.
 *
 * `@utility walking` already exists in `globals.css` AND is already listed in
 * the `prefers-reduced-motion` block -- verified, after the plan claimed
 * otherwise for two units. No new bespoke animation class.
 */
export function WalkingPair() {
  return (
    <span aria-hidden="true" className="relative flex items-end gap-0.5">
      <span
        className="walking pixelated block h-[46px] w-[26px] bg-bottom bg-contain bg-no-repeat"
        style={{ backgroundImage: "url(/sprites/avatar1.png)" }}
      />
      <span
        className="walking pixelated block h-[46px] w-[26px] bg-bottom bg-contain bg-no-repeat"
        style={{
          backgroundImage: "url(/sprites/avatar3.png)",
          animationDelay: "-0.4s",
        }}
      />
    </span>
  );
}
