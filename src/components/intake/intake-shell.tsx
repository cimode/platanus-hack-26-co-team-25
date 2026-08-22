/**
 * The column every intake screen is poured into (390x844 is the target).
 *
 * The `<h1>` lives here rather than in the steps, and says the same thing on
 * all of them on purpose: Next's route announcer reads the first `<h1>`
 * whenever `document.title` is empty at commit time, so a per-step `<h1>` is
 * announced twice -- once as the heading, once as live-region text.
 *
 * Extracted from `src/app/intake/page.tsx` when issue #8 added routes of its
 * own (`/intake/declared`, `/intake/gates/*`): four copies of one column is
 * four chances for step 4 to sit two pixels off step 3.
 */
export function IntakeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-10 pb-8">
      <h1 className="font-mono text-xs tracking-[0.06em] text-ink-faint lowercase">
        hookai · intake
      </h1>
      {children}
    </main>
  );
}
