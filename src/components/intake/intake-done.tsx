import type { Consent } from "@/lib/domain/participant";

/**
 * The temporary end of the flow (issue #6).
 *
 * Issue #8 replaces this with step 4; until then it is where consent lands, and
 * it exists mostly to make the saved state visible: `CONTEXT.md` §7 asks for a
 * *visible* consent state, and "Romantic off" printed on the screen is the
 * cheapest possible audit of a column nobody can otherwise see.
 */
const LENSES = [
  { key: "romantic", label: "Romantic" },
  { key: "business", label: "Business" },
  { key: "friendship", label: "Friendship" },
] as const;

export function IntakeDone({
  name,
  photoUrl,
  consent,
}: {
  name: string;
  photoUrl: string;
  consent: Consent;
}) {
  return (
    <section className="flex flex-1 flex-col gap-8">
      <header className="space-y-2">
        {/* An <h2> for the same reason as `StepHeading`: the page's <h1> is the
            flow, and a per-screen <h1> gets echoed into the route announcer. */}
        <h2 className="font-display text-3xl leading-tight font-extrabold text-ink">
          You&apos;re in
        </h2>
        <p className="text-sm text-ink-muted">
          Keep this phone handy — the room opens from here.
        </p>
      </header>

      <div className="flex items-center gap-4">
        {/* biome-ignore lint/performance/noImgElement: the PhotoStore owns this URL, and a data: URL is not a host next/image can be configured for */}
        <img
          // biome-ignore lint/a11y/noRedundantAlt: the intake criteria pin "Your photo" as the accessible name
          alt="Your photo"
          className="size-20 rounded-2xl border-2 border-border object-cover"
          src={photoUrl}
        />
        <p className="font-display text-xl font-extrabold text-ink">{name}</p>
      </div>

      <ul className="space-y-2">
        {LENSES.map((lens) => (
          <li
            className="rounded-2xl border border-border bg-card px-4 py-3 font-display text-base font-bold text-ink"
            key={lens.key}
          >
            {`${lens.label} ${consent[lens.key] ? "on" : "off"}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
