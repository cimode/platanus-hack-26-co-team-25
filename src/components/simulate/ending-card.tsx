import type { SimulatedLife } from "@/lib/domain/reveal/timeline";

export function EndingCard({
  life,
}: {
  readonly life: Extract<SimulatedLife, { lens: "romantic" | "business" }>;
}) {
  const { ending, horizonYears } = life;

  if (ending.outcome === "together") {
    return (
      <section className="mx-auto w-full max-w-md rounded-2xl border border-ink/10 bg-background p-5 shadow-toy">
        <h2 className="font-display font-extrabold text-ink text-xl">
          Llegaron juntos
        </h2>
        <p className="mt-2 text-ink-muted text-sm">
          Alcanzaron el horizonte de {horizonYears} años sin cerrar el capítulo
          antes de tiempo.
        </p>
        <button
          className="mt-4 rounded-full bg-primary px-5 py-2.5 font-display font-bold text-primary-foreground shadow-toy"
          type="button"
        >
          Proponer encuentro
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="rounded-2xl border border-ink/10 bg-background p-5 shadow-toy">
        <h2 className="font-display font-extrabold text-ink text-xl">
          Se apartaron en el año {ending.year}
        </h2>
        <p className="mt-2 text-ink-muted text-sm">
          El horizonte era {horizonYears} años; la historia cerró antes.
        </p>
        <button
          className="mt-4 rounded-full bg-primary px-5 py-2.5 font-display font-bold text-primary-foreground shadow-toy"
          type="button"
        >
          Proponer encuentro
        </button>
      </div>
      {ending.epilogue ? (
        <p className="rounded-2xl border border-ink/10 bg-background/80 p-4 text-ink text-sm italic">
          {ending.epilogue}
        </p>
      ) : null}
    </section>
  );
}
