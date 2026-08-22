/**
 * The heading every intake step wears.
 *
 * An `<h2>`, not an `<h1>`: the page's `<h1>` is the flow itself ("hookai ·
 * intake") and it is deliberately the SAME on every screen. Next's route
 * announcer falls back to the first `<h1>` when `document.title` is momentarily
 * empty mid-navigation, and a per-step `<h1>` therefore ends up duplicated into
 * an `aria-live` node -- which is a real screen-reader annoyance before it is a
 * test-selector one.
 *
 * "Step N of 5" is the whole of the heading; the step's own title sits beside
 * it as body text. Five since issue #8: register, photo, consent, the declared
 * round and the lens gates. Steps 4 and 5 are several screens each and all of
 * them wear the same number -- the count is the participant's sense of how much
 * is left, not a page counter.
 */
export function StepHeading({
  step,
  title,
}: {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
}) {
  return (
    <header className="space-y-2">
      <h2 className="font-display text-3xl leading-tight font-extrabold text-ink">
        Step {step} of 5
      </h2>
      <p className="text-sm text-ink-muted">{title}</p>
    </header>
  );
}
