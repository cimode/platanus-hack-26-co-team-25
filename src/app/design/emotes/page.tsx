import type { Metadata } from "next";
import Link from "next/link";
import { EmoteGallery } from "@/components/emotes/emote-gallery";

export const metadata: Metadata = {
  title: "hookai · emotes",
  description:
    "Catálogo de reacciones y caminatas de los avatares digitales, listo para usar en cualquier pantalla.",
};

export default function EmotesPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-ink-faint text-xs lowercase">
          <Link className="hover:text-primary" href="/design">
            design system
          </Link>{" "}
          · emotes
        </p>
        <h1 className="text-2xl">Emotes</h1>
        <p className="max-w-prose text-ink-soft">
          Cada avatar con todo lo que sabe hacer. Toca un emote para verlo; las
          caminatas quedan en loop hasta volver a idle. La misma librería (
          <code className="font-mono text-sm">@/components/emotes</code>) sirve
          a la sala y a cualquier otra pantalla.
        </p>
      </header>
      <EmoteGallery />
    </main>
  );
}
