import { Progress } from "@/components/ui/progress";

/**
 * The one progress bar the whole flow shares (issue #42).
 *
 * Nineteen steps: the registration screen, the three declared screens and the
 * fifteen quiz blocks. The bar is the ONLY progress copy on an intake screen --
 * no "step N of N", no screen title, nothing that names what is being asked
 * (the product correction of 2026-08-22). The quiz keeps its own mono counter
 * beside the bar because a block is a countable thing to the person answering
 * it; the intake screens are not.
 *
 * A Server Component wrapper around the shadcn `Progress` primitive, which
 * renders `role="progressbar"` with `aria-valuenow` and `aria-valuemax` -- the
 * accessible name is Spanish and deliberately neutral.
 */

/** 1 registration + 3 declared screens + 15 blocks. */
export const FLOW_TOTAL_STEPS = 19;

/** The registration screen is step 1; the declared screens follow it. */
export const FLOW_REGISTER_STEP = 1;
export const FLOW_DECLARED_FIRST_STEP = 2;
export const FLOW_QUIZ_FIRST_STEP = 5;

export function FlowProgress({
  step,
  className,
}: {
  /** 1-based, over `FLOW_TOTAL_STEPS`. */
  step: number;
  className?: string;
}) {
  const clamped = Math.min(Math.max(step, 0), FLOW_TOTAL_STEPS);
  return (
    // `aria-valuenow` / `aria-valuemax` are passed explicitly rather than left
    // to the primitive: the shadcn wrapper consumes `value` to size the
    // indicator and does not forward it to the Radix root, so without these the
    // bar would announce itself as indeterminate. `src/components/ui/**` is
    // shadcn-owned and must not be edited (`ui-composition` §4).
    <Progress
      aria-label="Progreso"
      aria-valuemax={FLOW_TOTAL_STEPS}
      aria-valuemin={0}
      aria-valuenow={clamped}
      className={className}
      value={(clamped / FLOW_TOTAL_STEPS) * 100}
    />
  );
}
