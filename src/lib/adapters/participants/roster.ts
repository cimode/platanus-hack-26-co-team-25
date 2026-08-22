import type { Participant } from "@/lib/domain/participants/participant";
import type { ParticipantsPort } from "@/lib/ports/participants";

/**
 * The roster, hardcoded.
 *
 * There is no `participants` table yet -- intake is not built, so nothing has
 * ever written one. Rather than block the demo screen on the whole persistence
 * story, the roster lives here behind `ParticipantsPort`. Swapping it for a
 * Drizzle-backed implementation later changes this file and the one line in
 * `composition.ts` that names it. Nothing else moves.
 *
 * PLACEHOLDER DATA. Replace with the real hack-26 roster before the demo --
 * these are stand-ins so the combobox has something to filter. Keep the list
 * alphabetical by name: `filterParticipants` preserves input order for equally
 * good matches, so the roster's order IS the tiebreak the user sees.
 */
const ROSTER: readonly Participant[] = [
  { id: "p-ana-ramirez", name: "Ana Ramírez", team: "equipo 03" },
  { id: "p-andres-gil", name: "Andrés Gil", team: "equipo 11" },
  { id: "p-camila-soto", name: "Camila Soto", team: "equipo 07" },
  { id: "p-daniel-rueda", name: "Daniel Rueda", team: "equipo 22" },
  { id: "p-diego-morales", name: "Diego Morales", team: "equipo 25" },
  { id: "p-elena-vargas", name: "Elena Vargas", team: "equipo 14" },
  { id: "p-fernanda-lopez", name: "Fernanda López", team: "equipo 03" },
  { id: "p-ignacio-bravo", name: "Ignacio Bravo", team: "equipo 19" },
  { id: "p-julian-castro", name: "Julián Castro", team: "equipo 07" },
  { id: "p-laura-mendez", name: "Laura Méndez", team: "equipo 25" },
  { id: "p-mateo-herrera", name: "Mateo Herrera", team: "equipo 11" },
  { id: "p-natalia-pena", name: "Natalia Peña", team: "equipo 19" },
  { id: "p-nicolas-rojas", name: "Nicolás Rojas", team: "equipo 14" },
  { id: "p-paula-quintero", name: "Paula Quintero", team: "equipo 22" },
  { id: "p-santiago-luna", name: "Santiago Luna", team: "equipo 25" },
  { id: "p-sofia-guzman", name: "Sofía Guzmán", team: "equipo 03" },
  { id: "p-tomas-alvarez", name: "Tomás Álvarez", team: "equipo 19" },
  { id: "p-valentina-cruz", name: "Valentina Cruz", team: "equipo 11" },
];

export const rosterParticipants: ParticipantsPort = {
  list: () => Promise.resolve(ROSTER),
};
