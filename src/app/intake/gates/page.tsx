import { redirect } from "next/navigation";
import { nextGatePath, requireIntakeParticipant } from "@/app/intake/guards";

/**
 * `/intake/gates` -- step 5's front door, and never a screen of its own.
 *
 * It applies the floor guards and then forwards to the first gate this
 * participant consented to, or straight to the quiz when neither romantic nor
 * business is on. Rendering nothing is the point: a friendship-only
 * participant must not so much as receive the markup of a gate question
 * (PILLARS.md A8).
 */
export default async function GatesPage() {
  const me = await requireIntakeParticipant();

  // The declared round has no degraded path (docs/domain.md §0): an unfinished
  // one goes back to step 4 rather than forward into a gate.
  if (!me.declaredAt) redirect("/intake/declared");

  redirect(nextGatePath(me.consent));
}
