"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import type { OptionKey } from "@/lib/domain/quiz";
import { BLOCK_COUNT } from "@/lib/domain/quiz";
import { answerBlock } from "@/lib/use-cases/answer-block";
import { isSinglePick } from "./single-pick";

/**
 * The quiz's only write (issue #9).
 *
 * A Server Action is a public HTTP endpoint reachable without ever rendering
 * the block (the Next forms guide is explicit about this), so it re-reads the
 * session cookie itself: the participant id never crosses the wire, and a
 * submission for someone else's row is impossible rather than merely unlikely.
 *
 * `singlePick` comes from the server's own env through `isSinglePick()`, never
 * from the form. If it came from the form, a participant could submit every
 * block without "Menos yo" and quietly halve the measurement.
 *
 * The redirect is chosen from the outcome, and every branch is a fresh read of
 * the rows rather than an arithmetic guess about where they are:
 *
 *   completed          → /results
 *   advanced           → /quiz          (the block, or the wait if it is not written yet)
 *   re-answer (behind) → /quiz?start=1  (straight to the frontier)
 *
 * `InstrumentVersionMismatchError` propagates for the same reason it does on
 * the page: a room on another structural version must not be written to.
 */

/**
 * The FormData contract, validated before a use case sees it (docs/domain.md
 * §7, docs/form-response.md §10).
 *
 * `mostKey` arrives two ways and this reads both the same: under single pick
 * each option row is `<button type="submit" name="mostKey" value="c">`, so
 * the browser -- with or without JavaScript -- posts the SUBMITTER's name and
 * value as the field; under most+least it is a hidden input the island keeps.
 * `leastKey` is absent under single pick and "" from the island when no second
 * mark is placed -- the use case rejects that too, but the empty string is a
 * form artefact, so it is normalised here.
 */
const KEY = z.enum(["a", "b", "c", "d"] satisfies OptionKey[]);

const AnswerInput = z.object({
  position: z.coerce.number().int().min(1).max(BLOCK_COUNT),
  mostKey: KEY,
  leastKey: KEY.nullable(),
});

export async function answerBlockAction(formData: FormData): Promise<void> {
  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const parsed = AnswerInput.safeParse({
    position: text(formData, "position"),
    mostKey: text(formData, "mostKey"),
    leastKey: text(formData, "leastKey") || null,
  });

  // A malformed body is not a message to show anyone: the block is still on
  // screen and still unanswered, and the page re-derives it from the rows.
  if (!parsed.success) redirect("/quiz");

  const singlePick = isSinglePick();
  const result = await answerBlock(
    {
      sessionToken: token,
      position: parsed.data.position,
      mostKey: parsed.data.mostKey,
      // Under single-pick any submitted "Menos yo" is dropped, not trusted.
      leastKey: singlePick ? null : parsed.data.leastKey,
      singlePick,
      now: new Date(),
    },
    serverDeps()
  );

  // `redirect` signals by throwing, so nothing below the first branch runs.
  revalidatePath("/quiz");
  if (result.completed) redirect("/results");
  if (result.advanced) redirect("/quiz");
  redirect("/quiz?start=1");
}

/** `formData.get` returns `File | string | null`; only a string is a field. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
