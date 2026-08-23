import Link from "next/link";
import { TimelineRail } from "@/components/simulate/timeline-rail";
import type { SimulatedLife } from "@/lib/domain/reveal/timeline";
import type { Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

export function SimulatedLifeScreen({
  life,
  lens,
}: {
  readonly life: SimulatedLife;
  readonly lens: Lens;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-md flex-1 flex-col gap-8 py-8",
        `lens-${lens}`
      )}
    >
      <div className="px-6">
        <Link
          className="font-display font-bold text-primary text-sm underline underline-offset-4"
          href="/rank"
        >
          ← Volver al ranking
        </Link>
      </div>
      <TimelineRail life={life} />
    </main>
  );
}
