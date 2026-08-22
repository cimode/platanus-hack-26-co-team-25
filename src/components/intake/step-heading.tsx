/**
 * The heading every intake step wears.
 *
 * An `<h2>`, not an `<h1>`: the page's `<h1>` is the flow itself ("hookai ·
 * intake") and it is deliberately the SAME on all four screens. Next's route
 * announcer falls back to the first `<h1>` when `document.title` is momentarily
 * empty mid-navigation, and a per-step `<h1>` therefore ends up duplicated into
 * an `aria-live` node -- which is a real screen-reader annoyance before it is a
 * test-selector one.
 *
 * "Step N of 3" is the whole of the heading; the step's own title sits beside
 * it as body text.
 */
export function StepHeading({
  step,
  title,
}: {
  step: 1 | 2 | 3;
  title: string;
}) {
  return (
    <header className="space-y-2">
      <h2 className="font-display text-3xl leading-tight font-extrabold text-ink">
        Step {step} of 3
      </h2>
      <p className="text-sm text-ink-muted">{title}</p>
    </header>
  );
}
