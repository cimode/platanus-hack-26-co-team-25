import { cookies } from "next/headers";
import Link from "next/link";
import { LENS_COOKIE } from "@/app/lens";
import { isLens, type Lens } from "@/lib/domain/room/layout";
import { cn } from "@/lib/utils";

const LABEL: Record<Lens, string> = {
  romantic: "Romántico",
  business: "de Negocios",
  friendship: "de Amistad",
};

/**
 * Screen 1c -- the ranking. NOT BUILT.
 *
 * A landing pad, same as `/room` was before 1b: the lens buttons have to
 * arrive somewhere, and a 404 mid-demo is worse than a stub. Replace wholesale
 * when 1c is designed: the horizontally-dragged rank row, ALTA/MEDIA bands, the
 * compatibility driver.
 *
 * It does earn its keep in one way -- it proves the lens actually threads
 * through, because the subtree below wears the chosen `lens-*` class.
 */
export default async function RankPage() {
  const store = await cookies();
  const raw = store.get(LENS_COOKIE)?.value;
  const lens = isLens(raw) ? raw : null;

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16",
        lens ? `lens-${lens}` : ""
      )}
    >
      <p className="font-mono text-xs text-ink-faint lowercase">
        1c · rank · pendiente
      </p>

      <h1 className="font-display text-3xl font-extrabold text-ink">
        {lens ? `Rank ${LABEL[lens]}` : "Sin lente elegida."}
      </h1>

      <span className="w-fit rounded-full bg-primary px-4 py-2 font-display text-sm font-bold text-primary-foreground shadow-toy">
        el acento de esta lente
      </span>

      <p className="text-sm text-ink-muted">
        El ranking todavía no existe. Cuando exista, aquí es donde caes.
      </p>

      <Link
        className="font-display text-base font-bold text-primary underline underline-offset-4"
        href="/room"
      >
        ← Volver a la sala
      </Link>
    </main>
  );
}
