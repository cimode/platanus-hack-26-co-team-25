import { tagFor } from "@/components/simulate/event-tag";
import type { LifeEvent } from "@/lib/domain/reveal/timeline";
import { cn } from "@/lib/utils";

/** The seven families, as the classes that paint a chip. */
const CHIP: Record<string, string> = {
  hito: "bg-tag-hito text-tag-hito-foreground",
  mudanza: "bg-tag-mudanza text-tag-mudanza-foreground",
  mascota: "bg-tag-mascota text-tag-mascota-foreground",
  peque: "bg-tag-peque text-tag-peque-foreground",
  ritual: "bg-tag-ritual text-tag-ritual-foreground",
  viaje: "bg-tag-viaje text-tag-viaje-foreground",
  roce: "bg-tag-roce text-tag-roce-foreground",
};

/**
 * The bubble that borders in the family colour. Only `roce` does, in the
 * design: friction is the one beat that earns a coloured edge, because it is
 * the one you might skim past and should not.
 */
const EDGE: Record<string, string> = {
  roce: "border-tag-roce-foreground/45",
};

/**
 * One beat of the life, anchored to its tile by a short dashed leader.
 *
 * Still an `<article>`, deliberately: AC-SIM-5's e2e counts sixteen of them by
 * role, and moving the text from a card row into a board bubble is a layout
 * change, not a semantic one. The chip still comes from `tagFor(kind)` -- an
 * exhaustive `Record` with no `default`, so a seventeenth kind fails
 * `pnpm run typecheck` there rather than rendering an unstyled chip (AC-PORT-7).
 */
export function EventBubble({
  event,
  above,
  delay,
}: {
  event: LifeEvent;
  above: boolean;
  delay: number;
}) {
  const tag = tagFor(event.kind);

  return (
    <div
      className={cn(
        "-translate-x-1/2 pop-in absolute left-0 flex w-[190px] flex-col items-center"
      )}
      style={{
        animationDelay: `${delay}ms`,
        // Measured from the tile's centre, with room for the leader AND for the
        // walking pair standing on the tile. `bottom-full` on a zero-height
        // anchor put the bubble flush against the board.
        [above ? "bottom" : "top"]: "46px",
      }}
    >
      {/* The leader. Below the bubble when the bubble is above, and vice
          versa -- it always points AT the tile. */}
      {above ? null : (
        <span
          aria-hidden="true"
          className="h-4 border-ink-faint/45 border-l-2 border-dashed"
        />
      )}

      {/* NOT `shadow-toy`. That shadow reads from `--primary-shadow`, so every
          bubble grew a coral bottom edge and the board looked like sixteen
          buttons. A narration bubble is not an affordance. */}
      <article
        className={cn(
          "w-full rounded-[14px] border-2 bg-card px-3 py-2 shadow-[0_3px_10px_rgba(51,38,29,0.10)]",
          EDGE[tag.token] ?? "border-ink-faint/25"
        )}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono font-semibold text-[9px] uppercase tracking-[0.06em]",
              CHIP[tag.token]
            )}
          >
            {tag.label}
          </span>
          <span className="font-mono text-[9.5px] text-ink-faint lowercase tabular-nums">
            año {event.year}
          </span>
        </div>

        <p className="mt-1 font-display text-[12.5px] text-ink leading-snug">
          {event.text}
        </p>
      </article>

      {above ? (
        <span
          aria-hidden="true"
          className="h-4 border-ink-faint/45 border-l-2 border-dashed"
        />
      ) : null}
    </div>
  );
}
