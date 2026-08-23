"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
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
 *   completed          → /room          (scoring scheduled first, see below)
 *   advanced           → /quiz          (the block, or the wait if it is not written yet)
 *   re-answer (behind) → /quiz?start=1  (straight to the frontier)
 *
 * `/results` used to be the completion target and was a dead end -- no link out
 * of it, and the person who had just finished held a `dipia_session` and no
 * `dipia_impersonating`, so every screen past it treated them as nobody. With
 * `resolveViewerId` bridging the two cookies, `/room` is somewhere they arrive
 * identified and can pick a lens, which is the actual next step of the demo.
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
  // One clock reading, used for the row's `answered_at`, for
  // `participants.quiz_completed_at` on the completing write, and for the
  // completion gate the background scorer is handed below.
  const now = new Date();
  const result = await answerBlock(
    {
      sessionToken: token,
      position: parsed.data.position,
      mostKey: parsed.data.mostKey,
      // Under single-pick any submitted "Menos yo" is dropped, not trusted.
      leastKey: singlePick ? null : parsed.data.leastKey,
      singlePick,
      now,
    },
    serverDeps()
  );

  // `redirect` signals by throwing, so nothing below the first branch runs.
  revalidatePath("/quiz");
  if (result.completed) {
    scoreInBackground(result.participantId, result.roomId, now);
    redirect("/room");
  }
  if (result.advanced) redirect("/quiz");
  redirect("/quiz?start=1");
}

/**
 * Turn the twelve answers into four posteriors, after the response is sent.
 *
 * Until now the ONLY thing that ever scored anyone was `prepareResults`, and it
 * scores the VIEWER alone (`prepare-results.ts:273`). So everybody else in the
 * room ranked on the imputed prior (mean 0.5, se 0.6) and their quiz changed
 * nothing -- and `simulatePair` refuses a pair where either side has no
 * posterior at all, which is a `notFound()` on `/simulate`. Scoring at the
 * moment the quiz completes is what makes a finished form count for everyone
 * who looks, not only for the person looking.
 *
 * Three things this has to get right:
 *
 *   - Nothing request-scoped inside the callback. `after` in a Server Function
 *     may reach `cookies()`, but it does not need to: everything here is a
 *     plain value closed over during the action, so the callback cannot be the
 *     thing that makes this route dynamic in a way rendering did not.
 *   - It must never reject. An unhandled rejection in a background task takes
 *     the whole invocation down, so everything is caught and warned about.
 *   - `after` runs on the ROUTE's budget, not its own -- and `/quiz` declares
 *     no `maxDuration` since D21, because nothing on it waits for a model any
 *     more. This does not need one either: scoring is a handful of row reads,
 *     the MAP fit, and one upsert of four rows. It is arithmetic, not
 *     narration.
 *
 * `scoreParticipant` re-checks completion itself (`score-participant.ts:89`)
 * and refuses an incomplete quiz, so scheduling it on a row that changed under
 * us writes nothing rather than writing something fitted to half a form.
 */
function scoreInBackground(
  participantId: string,
  roomId: string,
  completedAt: Date
): void {
  after(async () => {
    try {
      const deps = serverDeps();
      const room = await deps.rooms.byId(roomId);
      if (!room) {
        // A non-null foreign key, so this is a room deleted under a live
        // session. Named, not thrown: the answers are already saved.
        console.warn(
          `[quiz] room ${roomId} is gone; ${participantId} unscored`
        );
        return;
      }
      await deps.scoreParticipant({
        participantId,
        room,
        quizCompletedAt: completedAt,
      });
    } catch (error) {
      console.warn(
        `[quiz] scoring ${participantId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
}

/** `formData.get` returns `File | string | null`; only a string is a field. */
function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
