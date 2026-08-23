import type { Metadata } from "next";
import Link from "next/link";

import { BabyOnBoard } from "@/components/emotes";
import { LifeBoard } from "@/components/simulate/life-board";
import { emoteForLifeEvent } from "@/lib/domain/emotes/actions";
import type { PairedTimeline } from "@/lib/domain/reveal/timeline";

export const metadata: Metadata = {
  title: "dipia · vida simulada",
  description:
    "La vida simulada con los dos avatares reaccionando a cada evento, sobre un fixture y sin base de datos.",
};

/**
 * The simulated life, driven by a fixture instead of the database.
 *
 * `/simulate/[id]` needs a viewer cookie, a ranked room, latents and roughly
 * thirty seconds of model time. None of that is what you want to look at when
 * the question is "does the pair react, and does the reaction leave them
 * standing where they were" -- so this route answers that question in the time
 * it takes to load a page, the same way `/design/emotes` does for the catalogue.
 *
 * The emotes below are written out rather than taken from the map, because the
 * point is to show what the NARRATOR's choice looks like: `celebrate` on a
 * milestone the map would also pick, and `love` on a trip it would not.
 */
const LIFE: PairedTimeline = {
  lens: "romantic",
  subject: { id: "ana", name: "Ana", avatar: "avatar3" },
  other: { id: "bruno", name: "Bruno", photoUrl: null, avatar: "avatar1" },
  horizonYears: 11,
  ending: {
    outcome: "apart",
    year: 9,
    epilogue: "Se siguen mandando la misma canción cada tanto, sin comentario.",
  },
  events: [
    {
      year: 1,
      kind: "milestone",
      emote: "celebrate",
      text: "Se conocen en la fila del café y descubren que los dos llevan el mismo libro rayado en la mochila.",
    },
    {
      year: 2,
      kind: "trip",
      emote: "love",
      text: "Un fin de semana en la costa que estiran dos días más sin avisarle a nadie.",
    },
    {
      year: 3,
      kind: "conflict",
      emote: "angry",
      text: "La cocina se vuelve territorio: quién compra, quién ordena, quién decide que ya está bien.",
    },
    {
      year: 4,
      kind: "recovery",
      emote: "wave",
      text: "Acuerdan una regla tonta —el que cocina no lava— y resulta que aguanta años.",
    },
    {
      year: 5,
      kind: "kid",
      emote: "love",
      text: "Llega la guagua y la casa se reorganiza entera alrededor de alguien muy pequeño.",
    },
    {
      year: 7,
      kind: "decision",
      emote: "fight",
      text: "Los dos quieren decidir la mudanza y ninguno quiere ser el que cede.",
    },
    {
      year: 9,
      kind: "dissolution",
      emote: "defeat",
      text: "Se separan un martes cualquiera, sin gritos, ordenando los libros por dueño.",
    },
  ],
};

/** The same plates the fixture life wears, with stand-in registration faces. */
const PARENT_A = {
  avatar: "avatar3" as const,
  faceUrl: "/match/parent-b.jpg",
  name: "Ana",
};
const PARENT_B = {
  avatar: "avatar1" as const,
  faceUrl: "/match/parent-a.jpg",
  name: "Bruno",
};

export default function SimulatedLifeDesignPage() {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex w-full max-w-md flex-col gap-2 px-6 pt-8">
        <p className="font-mono text-ink-faint text-xs lowercase">
          <Link className="hover:text-primary" href="/design">
            design system
          </Link>{" "}
          · vida simulada
        </p>
        <p className="text-ink-soft text-sm">
          Arrastra el tablero: la pareja que camina el camino actúa la casilla
          en la que está parada, con la emoción que eligió el narrador. La caja
          del sprite no cambia de tamaño, así que nadie se baja de su casilla.
        </p>
        <ul className="flex flex-col gap-1 font-mono text-[11px] text-ink-faint">
          {LIFE.events.map((event) => (
            <li key={`${event.year}-${event.kind}`}>
              año {event.year} · {event.kind} → {event.emote}
              {event.emote === emoteForLifeEvent(event.kind)
                ? " (= mapa)"
                : ` (mapa: ${emoteForLifeEvent(event.kind)})`}
            </li>
          ))}
        </ul>
      </header>
      <div className="flex h-[560px] flex-col">
        <LifeBoard lens="romantic" life={LIFE} />
      </div>

      {/*
        Phase 5, live: the `kid` beat is the one life event that earns a whole
        choreographed reveal on top of its emote. `PairStage` already fires
        `fireEvent("kid", "babyOnBoard")` when that card reaches the centre of
        the rail, and `<BabyOnBoard>` subscribes to the same bus -- so scrolling
        to año 5 plays it, with no wiring between the two components.

        `auto={false}` on purpose: the reveal belongs to the beat, not to the
        page load. Fixture faces stand in for the registration photos, which the
        read model does not carry for the viewer yet.
      */}
      <section className="mx-auto flex w-full max-w-md flex-col gap-2 px-6 pb-10">
        <p className="font-mono text-ink-faint text-xs lowercase">
          año 5 · kid → love + babyOnBoard
        </p>
        <div className="overflow-hidden rounded-3xl border-2 border-border shadow-toy">
          <div className="aspect-video w-full">
            <BabyOnBoard
              a={PARENT_A}
              auto={false}
              b={PARENT_B}
              child={{
                avatar: "avatar2",
                faceUrl: "/match/baby-placeholder.jpg",
              }}
            />
          </div>
        </div>
        <p className="text-ink-soft text-sm">
          Desliza hasta <strong>año 5</strong> y mira acá: el mismo beat que
          pone <code className="font-mono text-xs">love</code> en los dos
          avatares dispara el nacimiento. Un beat{" "}
          <code className="font-mono text-xs">kid</code> sólo existe cuando la
          pareja pasó el gate de consentimiento, así que esto se reproduce
          exactamente cuando debe.
        </p>
      </section>
    </div>
  );
}
