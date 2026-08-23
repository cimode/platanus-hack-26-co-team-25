import { redirect } from "next/navigation";
import { OpeningBeat } from "@/components/quiz/batch-beat";
import { BlockScreen } from "@/components/quiz/block-screen";
import { readSessionToken } from "@/lib/adapters/http/session";
import { serverDeps } from "@/lib/composition";
import { BLOCK_COUNT } from "@/lib/domain/quiz";
import { quizProgress } from "@/lib/use-cases/quiz-progress";
import { isSinglePick } from "./single-pick";

/**
 * `/quiz` -- twelve forced-choice blocks, one tap each (issue #9).
 *
 * A Server Component. It reads the `dipia_session` cookie, calls
 * `quizProgress` with `serverDeps()` and renders whatever the ROWS say: there
 * is no step column and no "current block" anywhere (docs/domain.md §0), so a
 * reload, a second phone or a browser restored from sleep all land on the first
 * unanswered position.
 *
 * THE FORM IS THE PARTICIPANT'S OWN TWELVE BLOCKS FROM THE COMMITTED BANK.
 * `formFor(participantId)` deals them out of `quiz/bank/*.json` -- three per
 * pillar, ordered per participant -- deterministically, and registration
 * writes them as this person's rows before the redirect ever lands here. So a
 * block costs ZERO model calls and one indexed read. Nothing on this route
 * waits on anything any more, which is why there is no `maxDuration` export
 * left (the platform default is more than a SELECT and a render need) and no
 * `after()` scheduling work behind the response.
 *
 * Three screens come out of one view:
 *
 *   no session                         → /intake
 *   quiz_completed_at                  → /results
 *   position 1, no ?start=, no ?block= → the opening moment
 *   anything else                      → the block
 *
 * The wait screen that used to sit between them is gone with the live
 * generation it covered: there is no state left in which a participant's next
 * block does not exist. `quizProgress` still self-heals -- a row that is
 * missing, or a legacy `fallback` row nobody answered, is re-assigned from the
 * bank before the view is built -- and that costs no model call either.
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
  if (view.completed) redirect("/results");

  // The opening moment sets the rules before block 1. It is skipped when
  // `?block=` asked for a specific block (the back affordance never shows a
  // transition) and when `?start=1` has already dismissed it.
  //
  // A null block is folded in here for the type's sake: `quizProgress` assigns
  // the form from the bank when a row is missing, so the only view without a
  // block is a completed quiz -- and that redirected two lines above.
  const dismissed = firstValue(searchParams.start) !== undefined;
  const asked = firstValue(searchParams.block) !== undefined;
  if ((view.nextPosition === 1 && !dismissed && !asked) || !view.block) {
    return <OpeningBeat avatar={view.avatar} />;
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
