import type { Metadata } from "next";
import Link from "next/link";
import { FaceGallery } from "@/components/faces/face-gallery";

export const metadata: Metadata = {
  title: "dipia · caras",
  description:
    "La foto de una persona puesta en la cara vacía de cada avatar, en la placa y en las trece animaciones.",
};

export default function FacesPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-ink-faint text-xs lowercase">
          <Link className="hover:text-primary" href="/design">
            design system
          </Link>{" "}
          · caras
        </p>
        <h1 className="text-2xl">Caras</h1>
        <p className="max-w-prose text-ink-soft">
          Elige una foto y aparece en la cara vacía de los cuatro avatares, en
          la placa y en cada animación. La foto no sale de este navegador: la
          cara se compone aquí, sobre el mismo dibujo que ya sirve a toda la
          sala, y no se guarda en ninguna parte.
        </p>
      </header>
      <FaceGallery />
    </main>
  );
}
