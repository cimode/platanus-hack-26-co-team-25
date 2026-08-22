import { redirect } from "next/navigation";
import { nextGatePath, requireIntakeParticipant } from "@/app/intake/guards";
import { RomanticGateForm } from "@/components/intake/gates/romantic-gate-form";
import { IntakeShell } from "@/components/intake/intake-shell";

/**
 * `/intake/gates/romantic` -- step 5, romantic (PILLARS.md §2 Eligibility
 * Gates, the only pillar with lens-partitioned content).
 *
 * The consent check happens here, before any control exists, and again inside
 * `submitRomanticGate` for anyone who posts to the action by hand
 * (docs/domain.md §5, D5). Gender and "interested in" are asked ONLY of
 * someone who opted into this lens: asking is a disclosure event (A8), so a URL
 * typed into the bar by a participant without romantic consent forwards to
 * whatever comes next instead of rendering the questions.
 */
export default async function RomanticGatePage() {
  const me = await requireIntakeParticipant();

  if (!me.declaredAt) redirect("/intake/declared");
  if (!me.consent.romantic) redirect(nextGatePath(me.consent, "romantic"));

  return (
    <IntakeShell>
      <RomanticGateForm />
    </IntakeShell>
  );
}
