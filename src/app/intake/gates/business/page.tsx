import { redirect } from "next/navigation";
import { nextGatePath, requireIntakeParticipant } from "@/app/intake/guards";
import { BusinessGateForm } from "@/components/intake/gates/business-gate-form";
import { IntakeShell } from "@/components/intake/intake-shell";

/**
 * `/intake/gates/business` -- step 5, business.
 *
 * Same shape as the romantic gate: no consent, no screen (docs/domain.md §5,
 * D5). The last applicable gate hands off to `/quiz`, which issue #9 owns.
 */
export default async function BusinessGatePage() {
  const me = await requireIntakeParticipant();

  if (!me.declaredAt) redirect("/intake/declared");
  if (!me.consent.business) redirect(nextGatePath(me.consent, "business"));

  return (
    <IntakeShell>
      <BusinessGateForm />
    </IntakeShell>
  );
}
