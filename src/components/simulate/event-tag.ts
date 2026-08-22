/**
 * The 16 -> 7 collapse: every `EventKind` the narration engine can emit gets
 * exactly one of the seven `--tag-*` token pairs already in `globals.css`.
 *
 * Nine more token pairs was the alternative, and it was rejected (design D4):
 * eighteen unlinted CSS variables in a palette that already collided once
 * (`--band-high` is `--tag-ritual` byte for byte), against a design that draws
 * seven chips. So COLOUR IS THE FAMILY and the LABEL IS THE IDENTITY -- two
 * kinds may share a hue, never a label.
 *
 * The mapping is the one the spec/design reconciliation settled on
 * (`openspec/changes/ui-flow-screens/tasks.md`, R3 -> DESIGN), argued from
 * meaning rather than from the spec's unreasoned table. The cell that decides
 * it: a successful business `exit` is not a fight, so it must not come out
 * amber alongside `conflict`.
 */
import type { EventKind } from "./timeline";

/**
 * The seven tokens, in `globals.css` order. Each names a `--tag-{token}` /
 * `--tag-{token}-foreground` pair; rank bands use `--band-*` and MUST NOT
 * borrow `--tag-ritual`, which is the same hue as `--band-high`.
 */
export const TAG_TOKENS = [
  "hito",
  "mudanza",
  "mascota",
  "peque",
  "ritual",
  "viaje",
  "roce",
] as const;

export type TagToken = (typeof TAG_TOKENS)[number];

/** What one event card's chip renders: one colour family, one Spanish name. */
export interface TimelineTag {
  readonly token: TagToken;
  readonly label: string;
}

/**
 * Exhaustive by type, with NO `default` branch and no fallback entry. A 17th
 * `EventKind` does not render an unstyled chip that nobody notices -- it fails
 * `pnpm run typecheck` right here, on this object literal (AC-PORT-7).
 */
const TAGS: Record<EventKind, TimelineTag> = {
  // hito -- the progress markers of the outer life.
  milestone: { token: "hito", label: "Hito" },
  job: { token: "hito", label: "Trabajo" },
  venture: { token: "hito", label: "Emprendimiento" },
  client: { token: "hito", label: "Cliente" },

  // mudanza -- something changed hands or address. A good exit belongs here,
  // not in `roce`: painting it amber would narrate a win as a fight.
  move: { token: "mudanza", label: "Mudanza" },
  exit: { token: "mudanza", label: "Salida" },

  pet: { token: "mascota", label: "Mascota" },

  // peque -- a tag, and only a tag. Nothing in this change renders an
  // offspring affordance; see `offspring.ts` for why.
  kid: { token: "peque", label: "Peque" },

  // ritual -- the warm beats. Repair is a ritual, and so is the last word.
  ritual: { token: "ritual", label: "Ritual" },
  recovery: { token: "ritual", label: "Reconciliación" },
  epilogue: { token: "ritual", label: "Epílogo" },

  // viaje -- an outing. A friendship vignette is one.
  trip: { token: "viaje", label: "Viaje" },
  vignette: { token: "viaje", label: "Escena" },

  // roce -- the friction family. `decision` is the decision-rights arc, which
  // is friction between two people who both want the call.
  conflict: { token: "roce", label: "Roce" },
  decision: { token: "roce", label: "Decisión" },
  dissolution: { token: "roce", label: "Ruptura" },
};

/** Total over `EventKind`. Never throws, never returns `undefined`. */
export function tagFor(kind: EventKind): TimelineTag {
  return TAGS[kind];
}
