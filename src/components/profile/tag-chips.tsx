import { cn } from "@/lib/utils";

/**
 * What the two of you both said you liked.
 *
 * SHARED tags only, and the intersection happens in the fixture rather than
 * here -- the screen must not be able to present the other person's private
 * interests as common ground even by accident, and the way to guarantee that
 * is to never send them (AC-PROF-3).
 *
 * These are NOT `--tag-*` tokens. That palette belongs to timeline event
 * families on screen 1f; an interest chip and a life-event chip meaning the
 * same colour would be a coincidence read as a relationship.
 */
export function TagChips({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) {
    return (
      <p
        aria-label="Todavía no tienen nada en común"
        className="font-mono text-[10.5px] text-ink-faint lowercase"
        role="status"
      >
        todavía no encontramos algo en común
      </p>
    );
  }

  return (
    <ul aria-label="Lo que tienen en común" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li
          className={cn(
            "rounded-full bg-card px-2.5 py-1",
            "font-mono text-[10.5px] text-ink-muted lowercase"
          )}
          key={tag}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
