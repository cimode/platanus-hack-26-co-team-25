import { Briefcase, Handshake, Heart } from "lucide-react";
import { chooseLensAction } from "@/app/actions";
import type { Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

const OPTIONS: readonly {
  lens: Lens;
  label: string;
  blurb: string;
  cls: string;
  Icon: typeof Heart;
}[] = [
  {
    lens: "romantic",
    label: "Románticamente",
    blurb: "una vida juntos",
    cls: "lens-romantic",
    Icon: Heart,
  },
  {
    lens: "business",
    label: "Trabajando",
    blurb: "socios, cofundadores",
    cls: "lens-business",
    Icon: Briefcase,
  },
  {
    lens: "friendship",
    label: "De amigos",
    blurb: "la gente que te queda",
    cls: "lens-friendship",
    Icon: Handshake,
  },
];

/**
 * "¿Cómo quieres conectar?" -- the only action on screen 1b.
 *
 * A Server Component with a plain form: three submit buttons sharing one
 * `name`, so the browser posts the lens the user actually pressed. No client
 * JavaScript, which means the choice still works while the room's islands are
 * still hydrating on venue wifi.
 *
 * Each button wears its own `lens-*` class, so its coral / violet / green comes
 * from `--primary` -- including the toy shadow, which reads `--primary-shadow`.
 * That is the whole point of the lens system: no conditional colour anywhere.
 */
export function LensPicker() {
  return (
    <form action={chooseLensAction} className="space-y-3">
      <h2 className="font-display text-xl font-extrabold text-ink">
        ¿Cómo quieres conectar?
      </h2>

      <div className="grid gap-2">
        {OPTIONS.map(({ lens, label, blurb, cls, Icon }) => (
          <button
            className={cn(
              cls,
              "flex items-center gap-3 rounded-xl px-4 py-3 text-left",
              "bg-primary text-primary-foreground shadow-toy",
              "transition-transform",
              "hover:-translate-y-0.5 hover:shadow-toy-lg active:translate-y-0.5",
              "focus-visible:outline-2 focus-visible:outline-ink",
              "focus-visible:outline-offset-2"
            )}
            key={lens}
            name="lens"
            type="submit"
            value={lens}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1">
              <span className="block font-display text-base font-bold">
                {label}
              </span>
              <span className="block font-mono text-[11px] opacity-80 lowercase">
                {blurb}
              </span>
            </span>
          </button>
        ))}
      </div>
    </form>
  );
}
