import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

export interface TimelinePathProps {
  readonly events: readonly LifeEvent[];
  readonly progress: number;
}

/**
 * Screen 1f dashed path. The contract is intentionally narrow so 1e can swap
 * this component without touching the rail.
 */
export function TimelinePath({ events, progress }: TimelinePathProps) {
  const clamped = events.length <= 1 ? 0 : progress / (events.length - 1);
  const left = `${Math.max(0, Math.min(1, clamped)) * 100}%`;

  return (
    <div aria-hidden="true" className="relative mx-4 h-16">
      <div className="absolute top-1/2 right-0 left-0 border-ink/20 border-t-2 border-dashed" />
      <div
        className={cn(
          "absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1",
          "motion-safe:transition-[left] motion-safe:duration-500"
        )}
        style={{ left }}
      >
        <span className="font-display text-[10px] font-bold text-primary">
          ●●
        </span>
        <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[10px] text-primary-foreground">
          vosotros
        </span>
      </div>
    </div>
  );
}
