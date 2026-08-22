"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { type Gate, nextGatePath } from "@/app/intake/guards";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import type { SessionToken } from "@/lib/domain/participant";
import { submitBusinessGate } from "@/lib/use-cases/submit-business-gate";
import { submitRomanticGate } from "@/lib/use-cases/submit-romantic-gate";

/**
 * The two gate Server Actions (step 5, issue #8).
 *
 * Each is a public HTTP endpoint, so each re-reads the session cookie and
 * validates its `FormData` against docs/form-response.md §10 before the use
 * case sees it -- and the use case refuses again for a lens the participant
 * never consented to (docs/domain.md §5, D5). A refusal on those grounds is
 * not an error the screen reports: it forwards, exactly as the page would have,
 * without writing a row.
 */

export type GateState = { error?: string };

const gender = z.enum(["M", "F", "NB"]);

/** docs/form-response.md §10 `RomanticGateInput`. */
const RomanticGateInput = z.object({
  gender,
  interestedIn: z.array(gender).min(1),
  single: z.boolean(),
  ageBand: z.number().int().min(0).max(3),
  wantsKids: z.boolean(),
});

/** docs/form-response.md §10 `BusinessGateInput`; both bands are 0..2. */
const BusinessGateInput = z.object({
  riskPosture: z.number().int().min(0).max(2),
  exitHorizon: z.number().int().min(0).max(2),
  redlinesOk: z.boolean(),
});

const PICK_ONE = "Pick one for each.";

/** An unchecked box sends nothing at all -- absence IS the "no" (D12). */
function checked(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

/** `formData.get` returns `File | string | null`; only a string is a field. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** A missing band must fail the range check, never parse as 0. */
function bandOrNaN(formData: FormData, key: string): number {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? Number(value) : Number.NaN;
}

function strings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

/**
 * Where the participant goes once this gate is behind them.
 *
 * The consent flags are re-read from the row rather than carried in the form:
 * a hidden field saying "business is next" is a hidden field somebody can
 * change.
 */
async function onward(token: SessionToken, done: Gate): Promise<string> {
  const me = await serverDeps().participants.bySessionToken(token);
  return me ? nextGatePath(me.consent, done) : "/intake";
}

export async function romanticGateAction(
  _previous: GateState,
  formData: FormData
): Promise<GateState> {
  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const parsed = RomanticGateInput.safeParse({
    gender: text(formData, "gender"),
    interestedIn: strings(formData, "interestedIn"),
    single: checked(formData, "single"),
    ageBand: bandOrNaN(formData, "ageBand"),
    wantsKids: checked(formData, "wantsKids"),
  });
  if (!parsed.success) return { error: PICK_ONE };

  const result = await submitRomanticGate(
    { sessionToken: token, gate: parsed.data },
    serverDeps()
  );

  if (!result.ok) {
    if (result.reason === "no-session") redirect("/intake");
    // `consent` is not a message: the lens was never this participant's to
    // answer, so they carry on as if the screen had never been offered.
    if (result.reason === "invalid") return { error: PICK_ONE };
  }

  redirect(await onward(token, "romantic"));
}

export async function businessGateAction(
  _previous: GateState,
  formData: FormData
): Promise<GateState> {
  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const parsed = BusinessGateInput.safeParse({
    riskPosture: bandOrNaN(formData, "riskPosture"),
    exitHorizon: bandOrNaN(formData, "exitHorizon"),
    redlinesOk: checked(formData, "redlinesOk"),
  });
  if (!parsed.success) return { error: PICK_ONE };

  const result = await submitBusinessGate(
    { sessionToken: token, gate: parsed.data },
    serverDeps()
  );

  if (!result.ok) {
    if (result.reason === "no-session") redirect("/intake");
    if (result.reason === "invalid") return { error: PICK_ONE };
  }

  redirect(await onward(token, "business"));
}
