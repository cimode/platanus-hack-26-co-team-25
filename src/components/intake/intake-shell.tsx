import { FlowProgress } from "@/components/intake/flow-progress";

/**
 * The column every intake screen is poured into (390x844 is the target).
 *
 * The `<h1>` is visually hidden and says the same neutral word on every screen
 * (issue #42): Next's route announcer reads the first `<h1>` whenever
 * `document.title` is empty at commit time, so a per-screen `<h1>` is announced
 * twice -- and, more to the point, nothing on an intake screen may name what is
 * being measured. The wordmark that used to live here is gone with it.
 *
 * The progress bar rides the shell rather than each screen, so a screen cannot
 * forget it and every screen agrees where it sits.
 */
export function IntakeShell({
  children,
  step,
}: {
  children: React.ReactNode;
  /** 1-based over the whole flow; omitted on a screen that is not one. */
  step?: number;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-6 pb-8">
      <h1 className="sr-only">Registro</h1>
      {step === undefined ? null : <FlowProgress step={step} />}
      {children}
    </main>
  );
}
