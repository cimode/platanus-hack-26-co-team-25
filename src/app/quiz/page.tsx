import { redirect } from "next/navigation";
import { after } from "next/server";
import { OpeningBeat } from "@/components/quiz/batch-beat";
import { BlockScreen } from "@/components/quiz/block-screen";
import { GenerationWait } from "@/components/quiz/generation-wait";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { BLOCK_COUNT } from "@/lib/domain/quiz";
import { continueQuizGeneration } from "@/lib/use-cases/ensure-quiz-batch";
import { quizProgress } from "@/lib/use-cases/quiz-progress";
import { isSinglePick } from "./single-pick";

/**
 * `/quiz` -- fifteen forced-choice blocks, one tap each (issue #9).
 *
 * A Server Component. It reads the `dipia_session` cookie, calls
 * `quizProgress` with `serverDeps()` and renders whatever the ROWS say: there
 * is no step column and no "current block" anywhere (docs/domain.md §0), so a
 * reload, a second phone or a browser restored from sleep all land on the first
 * unanswered position.
 *
 * Four screens come out of one view:
 *
 *   no session                         → /intake
 *   quiz_completed_at                  → /room
 *   position 1, no ?start=, no ?block= → the opening moment
 *   block not authored yet             → the wait screen, which asks again
 *   anything else                      → the block
 *
 * READS NEVER GENERATE. `quizProgress` takes no model: when the block at the
 * frontier is not stored (or only as the fallback constant) it answers
 * `pending` and this page shows `GenerationWait`, whose island refreshes the
 * route until the rows say otherwise. Authoring is a claim-guarded chain --
 * `continueQuizGeneration` scheduled in `after()` on EVERY render of this
 * route, beat, block or wait: it claims the participant, writes the missing
 * batches 1..3 in order inside its budget, and returns at once when someone
 * else holds the claim or nothing is missing. So the participant's own
 * requests are what keep their writer alive, and a dead writer is revived by
 * the next tap rather than by anyone noticing. The batch beats that used to
 * pace the three batches are gone with the inline generation they covered.
 *
 * `?block=N` renders an already-answered block for the back affordance;
 * `quizProgress` clamps it to the frontier, so a pasted `?block=12` is block 8
 * and nobody ever jumps ahead of what they have answered.
 *
 * `InstrumentVersionMismatchError` is deliberately NOT caught: a room created
 * for another structural version of the form is an operator misconfiguration,
 * and rendering a block against the wrong structure would silently corrupt the
 * measurement. It belongs on the error boundary (docs/domain.md D2, §10.1(b)).
 */

/**
 * `after()` takes the *page's* budget, not its own. A cold chain is batch 1
 * (~40-70s) and then batches 2 and 3 side by side (~40-70s more), so the
 * writer gets 180s and the route the 300s Fluid Compute ceiling `/intake`
 * already runs with. Cutting it shorter would kill the chain mid-batch and
 * leave a claim that blocks regeneration until the takeover window passes.
 */
export const maxDuration = 300;

/** What the writer may spend per render; the next render schedules it again. */
const GENERATION_BUDGET_MS = 180_000;

export default async function QuizPage(props: PageProps<"/quiz">) {
  const searchParams = await props.searchParams;

  const token = await readSessionToken();
  if (!token) redirect("/intake");

  const view = await quizProgress(
    { sessionToken: token, at: requestedBlock(searchParams.block) },
    serverDeps()
  );

  // An unknown token is a stranger, not an error: send them to register.
  if (!view) redirect("/intake");
  // Where the completing write sends you too (`actions.ts`): `/room` is the
  // one screen a finished participant can act on, and `resolveViewerId` now
  // recognises them there from `dipia_session` alone.
  if (view.completed) redirect("/room");

  // Keep the writer going, whatever is on screen. Everything the callback
  // needs was read above: a Server Component's `after()` may not touch
  // `cookies()` itself (Next `after` docs).
  const { participantId, roomId } = view;
  after(() =>
    continueQuizGeneration(
      { participantId, roomId, budgetMs: GENERATION_BUDGET_MS },
      serverDeps()
    )
  );

  // The opening moment needs no block, so it shows even while batch 1 is
  // still being written -- reading it buys the writer a few seconds. It is
  // skipped when `?block=` asked for a specific block (the back affordance
  // never shows a transition) and when `?start=1` has already dismissed it.
  const dismissed = firstValue(searchParams.start) !== undefined;
  const asked = firstValue(searchParams.block) !== undefined;
  if (view.nextPosition === 1 && !dismissed && !asked) {
    return <OpeningBeat avatar={view.avatar} />;
  }

  if (view.pending || !view.block) {
    return <GenerationWait avatar={view.avatar} />;
  }

  return (
    <BlockScreen
      // Remount per position: the marks are this block's state, and React
      // would otherwise carry them across a navigation into the next one.
      key={view.nextPosition}
      avatar={view.avatar}
      backTo={
        view.nextPosition > 1 ? `/quiz?block=${view.nextPosition - 1}` : null
      }
      block={view.block}
      initialLeast={view.existing?.leastKey ?? null}
      initialMost={view.existing?.mostKey ?? null}
      // The slot order the answer will be recorded under (D10): the island
      // must lay the rows out in it, or `shown_order` describes a screen
      // nobody saw. `quizProgress` and `answerBlock` both derive it from
      // `shownOrderFor(participantId, position)`, so a resume, a reload and
      // the stored row all agree.
      order={view.shownOrder}
      singlePick={isSinglePick()}
      total={BLOCK_COUNT}
    />
  );
}

/** `?block=3` → 3. Anything unparseable is "no request", not an error. */
function requestedBlock(
  value: string | string[] | undefined
): number | undefined {
  const raw = firstValue(value);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** `?block=1&block=2` is a broken link, not a choice: take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
